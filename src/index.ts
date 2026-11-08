// scrabble-bot-predictive — a ScrabbleBot client for casual lobby matches.
//
// First run, with a token from a NEW team (not a tournament bot's token):
//   https://scrabblebot.spacetimedb.com/team/new
//   BOT_NAME=scrabble-bot-predictive BOT_TOKEN=<token> npm start
//
// The token is saved to .token-<BOT_NAME>. Later runs need only BOT_NAME.
// A nonce from `spacetime call scrabblebot mint_credential_nonce` also works:
//   BOT_NAME=scrabble-bot-predictive BOT_NONCE=<code> npm start
//
// This process never registers for a tournament. If TOURNAMENT_ID is set,
// it exits before connecting.

import {
  DbConnection,
  type EventContext,
  type ErrorContext,
} from "./module_bindings/index.js";
import { Identity } from "spacetimedb";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { tournamentRefusal } from "./casual.js";
import { chooseWord, prepareDictionary, rackAfterWord, activePolicy } from "./strategy.js";
import { liveBid, endMatch, noteWord } from "./online.js";

// Before the token file, BOT_TOKEN, or any connection. A set TOURNAMENT_ID
// means this process must not start, even when the value is empty.
const refusal = tournamentRefusal(process.env);
if (refusal) {
  console.error(refusal);
  process.exit(1);
}

const HOST = process.env.STDB_HOST ?? "https://maincloud.spacetimedb.com";
const DB_NAME = process.env.STDB_DB ?? "scrabblebot";
const BOT_NAME = process.env.BOT_NAME ?? "scrabble-bot-predictive";
const TOKEN_PATH = path.join(process.cwd(), `.token-${BOT_NAME}`);
let botNonce: string | undefined;

function loadToken(): string | undefined {
  try {
    return fs.readFileSync(TOKEN_PATH, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}
function saveToken(tok: string) {
  fs.writeFileSync(TOKEN_PATH, `${tok.trim()}\n`, { mode: 0o600 });
  fs.chmodSync(TOKEN_PATH, 0o600);
}

const dictionaryPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "spacetimedb",
  "wordlist.txt",
);
if (!fs.existsSync(dictionaryPath)) {
  console.error(
    `[${BOT_NAME}] ENABLE wordlist not found at ${dictionaryPath}. It ships in spacetimedb/wordlist.txt.`,
  );
  process.exit(1);
}
const DICTIONARY: string[] = fs
  .readFileSync(dictionaryPath, "utf8")
  .split("\n")
  .map((l) => l.trim().toUpperCase())
  .filter((l) => l.length >= 2);
if (DICTIONARY.length === 0) {
  console.error(`[${BOT_NAME}] wordlist at ${dictionaryPath} has no words.`);
  process.exit(1);
}
const prepared = prepareDictionary(DICTIONARY);
console.log(
  `[${BOT_NAME}] indexed ${prepared.indexed} words in ${prepared.ms.toFixed(1)} ms`,
);

let myIdentity: Identity | null = null;
let myBotId: bigint | null = null;
const bidsByAuction = new Set<string>();
const lastWordAttemptByMatch = new Map<string, { at: number; rackKey: string; word: string }>();
const WORD_RETRY_MS = 500;

function resolveMyBotId(conn: DbConnection): bigint | null {
  if (!myIdentity) return null;
  const cred = conn.db.botCredential.identity.find(myIdentity);
  return cred ? cred.botId : null;
}

function rackForMatch(conn: DbConnection, matchId: bigint): Map<string, number> {
  const rack = new Map<string, number>();
  for (const h of conn.db.myRack.iter()) {
    if (h.matchId !== matchId) continue;
    rack.set(h.letter, (rack.get(h.letter) ?? 0) + h.count);
  }
  return rack;
}

function rackKey(rack: Map<string, number>): string {
  const parts: string[] = [];
  for (const [letter, n] of rack) parts.push(`${letter}:${n}`);
  parts.sort();
  return parts.join(",");
}

const scoreboardCache = new Map<string, { botId: number; balance: number; score: number }[]>();

function participantForMatch(
  conn: DbConnection,
  matchId: bigint,
): { balance: number; score: number; place: number; win: boolean; topOpp: number; reliable: boolean; seats: number } | null {
  if (myBotId === null) return null;
  let seats: { botId: number; balance: number; score: number }[] = [];
  let mine: { botId: number; balance: number; score: number } | null = null;
  for (const p of conn.db.matchParticipant.iter()) {
    if (p.matchId !== matchId) continue;
    const rec = { botId: Number(p.botId), balance: Number(p.balance), score: Number(p.score) };
    seats.push(rec);
    if (p.botId === myBotId) mine = rec;
  }
  const cacheKey = String(matchId);
  if (seats.length >= 2) {
    scoreboardCache.set(cacheKey, seats.map((s) => ({ ...s })));
  } else {
    const cached = scoreboardCache.get(cacheKey);
    if (cached && cached.length >= 2) {
      seats = cached.map((s) => (mine && s.botId === mine.botId ? { ...mine } : { ...s }));
      if (mine && !seats.some((s) => s.botId === mine.botId)) seats.push(mine);
    }
  }
  if (!mine) return null;
  seats.sort((a, b) => b.score - a.score || a.botId - b.botId);
  const reliable = seats.length >= 2;
  const place = seats.findIndex((s) => s.botId === mine!.botId) + 1;
  const topOpp = seats.find((s) => s.botId !== mine!.botId)?.score ?? 0;
  return { balance: mine.balance, score: mine.score, place: reliable ? place : 0, win: reliable && place === 1, topOpp: reliable ? topOpp : 0, reliable, seats: seats.length };
}

function matchContext(conn: DbConnection, matchId: bigint): {
  bagRemaining?: number;
  auctionType: "Vickrey" | "FirstPrice";
} {
  const match = conn.db.matchState.id.find(matchId);
  if (!match) return { auctionType: "Vickrey" };
  return {
    bagRemaining: Number(match.bagTotal),
    auctionType: match.auctionType.tag === "FirstPrice" ? "FirstPrice" : "Vickrey",
  };
}

function logFailure(what: string) {
  return (err: unknown) =>
    console.warn(
      `[${BOT_NAME}] ${what} failed: ${err instanceof Error ? err.message : err}`,
    );
}

const scheduledBids = new Set<string>();
function tryBid(conn: DbConnection, auctionId: bigint, matchId: bigint, letter: string) {
  const key = `${matchId}:${auctionId}`;
  if (scheduledBids.has(key) || bidsByAuction.has(key)) return;
  scheduledBids.add(key);
  // Let all rows of the auction-close transaction update before valuing the
  // next letter; callbacks may otherwise see the previous rack/balance.
  setTimeout(() => {
    scheduledBids.delete(key);
    executeBid(conn, auctionId, matchId, letter);
  }, 25);
}

function executeBid(conn: DbConnection, auctionId: bigint, matchId: bigint, letter: string) {
  if (myBotId === null) return;
  const key = `${matchId}:${auctionId}`;
  if (bidsByAuction.has(key)) return;
  const participant = participantForMatch(conn, matchId);
  if (!participant) return;
  const info = matchContext(conn, matchId);
  let amount = 0;
  try {
    let biddingRack = rackForMatch(conn, matchId);
    // A word and the next auction can arrive in adjacent cache callbacks.
    // Do not buy a "completion" for tiles we are already cashing out.
    const pending = lastWordAttemptByMatch.get(String(matchId));
    const cashing = pending?.word && pending.rackKey === rackKey(biddingRack)
      && Date.now() - pending.at < 1500 ? pending.word : chooseWord({
        myRack: biddingRack, dictionary: DICTIONARY,
        bagRemaining: info.bagRemaining, myBalance: participant.balance,
        myScore: participant.score, topOpp: participant.reliable ? participant.topOpp : undefined,
      });
    if (cashing) biddingRack = rackAfterWord(biddingRack, cashing);
    amount = liveBid(String(matchId), {
      letter,
      myBalance: participant.balance,
      myRack: biddingRack,
      auctionType: info.auctionType,
      bagRemaining: info.bagRemaining,
      myScore: participant.score,
      topOpp: participant.reliable ? participant.topOpp : undefined,
    });
  } catch (err) {
    logFailure(`deciding a bid on '${letter}'`)(err);
    return;
  }
  if (amount <= 0) {
    console.log(
      `[${BOT_NAME}] skip '${letter}' (match ${matchId}, auction ${auctionId})`,
    );
    bidsByAuction.add(key);
    return;
  }
  bidsByAuction.add(key);
  conn.reducers
    .submitBid({ auctionId, amount: BigInt(amount) })
    .catch(logFailure(`bid on auction ${auctionId}`));
  console.log(
    `[${BOT_NAME}] bid ${amount} on '${letter}' (match ${matchId}, auction ${auctionId})`,
  );
}

function tryPlayWord(conn: DbConnection) {
  if (myBotId === null) return;
  const matches = new Set<bigint>();
  for (const p of conn.db.matchParticipant.iter()) {
    if (p.botId !== myBotId) continue;
    const m = conn.db.matchState.id.find(p.matchId);
    if (m?.status.tag === "Running") matches.add(p.matchId);
  }
  const now = Date.now();
  for (const matchId of matches) {
    const key = String(matchId);
    const rack = rackForMatch(conn, matchId);
    const signature = rackKey(rack);
    const info = matchContext(conn, matchId);
    const seat = participantForMatch(conn, matchId);
    let word: string | null = null;
    try {
      word = chooseWord({
        myRack: rack,
        dictionary: DICTIONARY,
        bagRemaining: info.bagRemaining,
        myBalance: seat?.balance,
        myScore: seat?.score,
        topOpp: seat?.reliable ? seat.topOpp : undefined,
      });
    } catch (err) {
      logFailure(`choosing a word in match ${matchId}`)(err);
      continue;
    }
    const played = word ?? "";
    const prev = lastWordAttemptByMatch.get(key);
    // Same rack after a submit means the server has not consumed the tiles yet.
    // Do not send JOINER twice (match 46542: second play failed, J already spent).
    if (prev && prev.word && prev.rackKey === signature && now - prev.at < 8000) {
      continue;
    }
    lastWordAttemptByMatch.set(key, { at: now, rackKey: signature, word: played });
    if (!word) continue;
    console.log(`[${BOT_NAME}] match ${matchId}: playing '${word}'`);
    noteWord(String(matchId), word);
    conn.reducers
      .submitWord({ matchId, word })
      .catch(logFailure(`playing '${word}'`));
  }
}

function onConnect(conn: DbConnection, identity: Identity, token: string) {
  myIdentity = identity;
  saveToken(token);
  console.log(`[${BOT_NAME}] connected as ${identity.toHexString()}`);

  conn
    .subscriptionBuilder()
    .onApplied(() => {
      console.log(`[${BOT_NAME}] subscription applied`);
      myBotId = resolveMyBotId(conn);
      if (myBotId === null) {
        if (botNonce) {
          console.log(`[${BOT_NAME}] claiming credential with nonce…`);
          conn.reducers
            .claimCredential({ code: botNonce })
            .catch(logFailure("claiming the credential"));
          setTimeout(() => {
            myBotId = resolveMyBotId(conn);
            if (myBotId === null) {
              console.error(
                `[${BOT_NAME}] couldn't claim credential. Bad or expired nonce?`,
              );
              process.exit(1);
            }
            const bot = conn.db.bot.id.find(myBotId);
            console.log(
              `[${BOT_NAME}] claimed credential for bot '${bot?.name ?? "?"}' (id ${myBotId})`,
            );
            bootstrapActivity(conn);
          }, 1000);
          return;
        }
        console.error(
          `[${BOT_NAME}] no BotCredential for this token. Set BOT_TOKEN or BOT_NONCE and re-run.`,
        );
        process.exit(1);
      }
      const bot = conn.db.bot.id.find(myBotId);
      console.log(
        `[${BOT_NAME}] acting as bot '${bot?.name ?? "?"}' (id ${myBotId})`,
      );
      bootstrapActivity(conn);
    })
    // Only this bot's history and active-match auctions. Hydrating millions
    // of historical auctions/results caused CPU/memory stalls and sit-outs.
    .subscribe([
      "SELECT * FROM bot WHERE id = 203",
      "SELECT * FROM bot_credential",
      "SELECT * FROM my_rack",
      "SELECT * FROM match_participant WHERE bot_id = 203",
      "SELECT match_participant.* FROM match_participant JOIN match_participant mine ON match_participant.match_id = mine.match_id WHERE mine.bot_id = 203",
      "SELECT match_participant.* FROM match_participant JOIN match_state ON match_participant.match_id = match_state.id WHERE match_state.bag_total > 0",
      "SELECT match_state.* FROM match_state JOIN match_participant ON match_state.id = match_participant.match_id WHERE match_participant.bot_id = 203",
      "SELECT auction.* FROM auction JOIN match_state ON auction.match_id = match_state.id WHERE match_state.bag_total > 0",
      "SELECT auction_result.* FROM auction_result JOIN match_state ON auction_result.match_id = match_state.id WHERE match_state.bag_total > 0",
      "SELECT * FROM open_lobbies",
      "SELECT * FROM lobby_member WHERE bot_id = 203",
    ]);

  conn.db.auction.onInsert((_ctx: EventContext, auction) => {
    if (auction.status.tag === "Open") {
      tryBid(conn, auction.id, auction.matchId, auction.letter);
    }
  });
  conn.db.myRack.onInsert(() => tryPlayWord(conn));
  conn.db.myRack.onUpdate(() => tryPlayWord(conn));
  conn.db.botCredential.onInsert(() => {
    if (myBotId === null) myBotId = resolveMyBotId(conn);
  });
  conn.db.auctionResult.onInsert((_ctx, result) => {
    if (myBotId === null) return;
    if (result.winnerBotId === undefined || result.winnerBotId === null) return;
    if (result.winnerBotId !== myBotId) return;
    console.log(
      `[${BOT_NAME}] won '${result.letter}' in match ${result.matchId} auction ${result.auctionId} paid ${result.paid}`,
    );
  });

  setInterval(() => {
    if (myBotId === null) return;
    bootstrapActivity(conn);
  }, 4000);

  conn.db.matchState.onUpdate((_ctx, oldRow, newRow) => {
    if (myBotId === null) return;
    if (oldRow.status.tag !== "Ended" && newRow.status.tag === "Ended") {
      const wasIn = Array.from(conn.db.matchParticipant.iter()).some(
        (p) => p.matchId === newRow.id && p.botId === myBotId,
      );
      if (wasIn) {
        for (const key of bidsByAuction) if (key.startsWith(`${newRow.id}:`)) bidsByAuction.delete(key);
        lastWordAttemptByMatch.delete(String(newRow.id));
        console.log(`[${BOT_NAME}] match ${newRow.id} ended; rejoining lobby`);
        joinLobby(conn);
        const fin = participantForMatch(conn, newRow.id);
        if (fin) console.log(`[${BOT_NAME}] scoreboard match ${newRow.id}: ${fin.seats} seats, place ${fin.reliable ? fin.place : "?"}, topOpp ${fin.reliable ? fin.topOpp : "?"}`);
        setImmediate(() => { try { if (fin) console.log(`[${BOT_NAME}] ${endMatch(String(newRow.id), fin.score, fin.balance, { place: fin.reliable ? fin.place : 0, win: fin.win, topOpp: fin.topOpp })}`); } catch (e) { logFailure("online update")(e); } });
      }
    }
  });
}

function joinLobby(conn: DbConnection) {
  if (myBotId === null) return;
  const inRunning = Array.from(conn.db.matchParticipant.iter()).some((p) => {
    if (p.botId !== myBotId) return false;
    const match = conn.db.matchState.id.find(p.matchId);
    return match?.status.tag === "Running";
  });
  if (inRunning) return;
  const openLobby = Array.from(conn.db.openLobbies.iter()).find((l) => l.status.tag === "Open");
  const alreadyIn =
    openLobby !== undefined &&
    Array.from(conn.db.lobbyMember.iter()).some(
      (lm) => lm.lobbyId === openLobby.id && lm.botId === myBotId,
    );
  if (alreadyIn) return;
  console.log(`[${BOT_NAME}] joining lobby`);
  conn.reducers.joinLobby({}).catch(logFailure("joining the lobby"));
}

function bootstrapActivity(conn: DbConnection) {
  joinLobby(conn);
  for (const auction of conn.db.auction.iter()) {
    if (auction.status.tag === "Open") {
      tryBid(conn, auction.id, auction.matchId, auction.letter);
    }
  }
  tryPlayWord(conn);
}

function main() {
  // Blank BOT_TOKEN falls through to the gitignored token file.
  const envToken = process.env.BOT_TOKEN?.trim() || undefined;
  botNonce = process.env.BOT_NONCE?.trim() || undefined;
  console.log(
    `[${BOT_NAME}] ML policy ${activePolicy() ? "loaded" : "missing -> heuristic"}; casual lobby only. Connecting to ${DB_NAME} at ${HOST}.`,
  );
  DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB_NAME)
    .withToken(envToken ?? loadToken())
    .onConnect(onConnect)
    .onConnectError((_ctx: ErrorContext, err: Error) =>
      console.error("connect error:", err.message),
    )
    .onDisconnect(() => { console.log("disconnected"); process.exit(1); })
    .build();
}

main();
