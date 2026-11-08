// Instant-speed replica of the official ScrabbleBot match loop
// (clockworklabs/scrabblebot spacetimedb/src/game.ts: createMatch,
// drawLetter, closeAuction, playWord). Time is removed: each 1 s sealed-bid
// window becomes one simultaneous call to every bot's bid().
//
// Fidelity notes (copied from official source):
// - STARTING_BALANCE 100, STARTING_RACK_SIZE 5, 6 seats, DEFAULT_BAG (98, no blanks).
// - drawLetter: uniform over remaining tiles (index into letters sorted A..Z).
// - Racks dealt seat by seat, 5 each, then the first auction letter is drawn.
// - closeAuction: bids > 0 only; shuffle then stable sort desc (random ties);
//   Vickrey paid = second bid, or min(reserve 1, top) when alone; FirstPrice paid = top.
//   Winner must afford `paid` (always true: submitBid rejects bids > balance).
// - Tiles nobody bids on are NOT returned to the bag; the auction just closes.
// - Match ends right after the auction that empties the bag; real bots get no
//   word phase after that close (status flips to Ended in the same reducer).
//   Official padding sims do play findBestPlayable(rack,3) inside the close.
// - playWord: reward = floor(sum(letterValue) * num / denom); adds to balance and score.
// - Word plays only touch the player's own rack/balance, so the order in which
//   bots submit words between auctions cannot change outcomes.

import { VALUE, BAG_COUNTS, totalReward } from "../scoring.js";

export const STARTING_BALANCE = 100;
export const STARTING_RACK_SIZE = 5;
export const AUCTION_RESERVE = 1;
export const SEATS = 6;

export interface SeatView {
  seat: number;
  balance: number;
  rack: Uint8Array; // own tiles only
  bagRemaining: number; // public match_state.bagTotal
  auctionType: "Vickrey" | "FirstPrice";
}

export interface Bot {
  name: string;
  /** Sealed bid for `letter` (0..balance). */
  bid(view: SeatView, letter: number, rng: Rng): number;
  /** Words to play now (called repeatedly until null). Must be spellable. */
  word(view: SeatView, rng: Rng): Uint8Array | null; // returns used counts
  /** Official padding sims play inside closeAuction, including the last one. */
  playsInsideClose?: boolean;
  newMatch?(seat: number): void;
}

export class Rng {
  s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 0x9e3779b9; }
  next(): number { // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
}

export interface SeatResult { name: string; score: number; balance: number; place: number; win: boolean; words: number[]; wins: number; spent: number; }
export interface MatchResult { seats: SeatResult[]; auctions: number; unsold: number; log?: AuctionLog[] }
export interface AuctionLog { k: number; letter: number; winner: number; top: number; paid: number; bag: number }

function draw(bag: Uint8Array, total: { n: number }, rng: Rng): number {
  if (total.n === 0) return -1;
  let idx = rng.int(0, total.n - 1);
  for (let i = 0; i < 26; i++) {
    if (idx < bag[i]!) { bag[i]!--; total.n--; return i; }
    idx -= bag[i]!;
  }
  return -1;
}

export function wordReward(used: Uint8Array): { reward: number; len: number } {
  let base = 0, len = 0;
  for (let i = 0; i < 26; i++) { base += VALUE[i]! * used[i]!; len += used[i]!; }
  return { reward: totalReward(base, len), len };
}

export function playMatch(bots: Bot[], rng: Rng, opts: { auctionType?: "Vickrey" | "FirstPrice"; log?: boolean } = {}): MatchResult {
  const n = bots.length;
  const auctionType = opts.auctionType ?? "Vickrey";
  const bag = Uint8Array.from(BAG_COUNTS);
  const total = { n: bag.reduce((a, b) => a + b, 0) };
  const racks = bots.map(() => new Uint8Array(26));
  const bal = new Array<number>(n).fill(STARTING_BALANCE);
  const score = new Array<number>(n).fill(0);
  const words: number[][] = bots.map(() => []);
  const won = new Array<number>(n).fill(0);
  const spent = new Array<number>(n).fill(0);
  const log: AuctionLog[] = [];
  bots.forEach((b, i) => b.newMatch?.(i));
  for (let s = 0; s < n; s++) for (let k = 0; k < STARTING_RACK_SIZE; k++) {
    const l = draw(bag, total, rng); if (l < 0) break; racks[s]![l]!++;
  }
  const view = (s: number): SeatView => ({ seat: s, balance: bal[s]!, rack: racks[s]!, bagRemaining: total.n, auctionType });
  const play = (s: number, used: Uint8Array): boolean => {
    for (let i = 0; i < 26; i++) if (used[i]! > racks[s]![i]!) return false;
    const { reward, len } = wordReward(used);
    if (len < 2) return false;
    for (let i = 0; i < 26; i++) racks[s]![i]! -= used[i]!;
    bal[s]! += reward; score[s]! += reward; words[s]!.push(len);
    return true;
  };
  const wordPhase = (s: number) => {
    for (let guard = 0; guard < 20; guard++) {
      const w = bots[s]!.word(view(s), rng);
      if (!w || !play(s, w)) return;
    }
  };
  let letter = draw(bag, total, rng);
  let k = 0, unsold = 0;
  // Words may be played from the starting rack before/while the first auction runs.
  for (let s = 0; s < n; s++) if (!bots[s]!.playsInsideClose) wordPhase(s);
  while (letter >= 0) {
    const bids: { s: number; a: number }[] = [];
    for (let s = 0; s < n; s++) {
      let a = Math.floor(bots[s]!.bid(view(s), letter, rng));
      if (!(a > 0)) continue;
      if (a > bal[s]!) continue; // submitBid: "Insufficient balance"
      bids.push({ s, a });
    }
    // shuffle (Fisher-Yates like official shuffle) then stable sort desc
    for (let i = bids.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = bids[i]!; bids[i] = bids[j]!; bids[j] = t; }
    bids.sort((x, y) => y.a - x.a); // Array.prototype.sort is stable
    let winner = -1, top = 0, paid = 0;
    if (bids.length) {
      winner = bids[0]!.s; top = bids[0]!.a;
      paid = auctionType === "FirstPrice" ? top : bids[1] ? bids[1].a : Math.min(AUCTION_RESERVE, top);
      if (bal[winner]! >= paid) { bal[winner]! -= paid; spent[winner]! += paid; racks[winner]![letter]!++; won[winner]!++; }
      else winner = -1;
    } else unsold++;
    if (opts.log) log.push({ k, letter, winner, top, paid, bag: total.n });
    if (winner >= 0 && bots[winner]!.playsInsideClose) wordPhase(winner);
    letter = draw(bag, total, rng);
    k++;
    if (letter < 0) break; // Ended in the same reducer: no more submitWord.
    for (let s = 0; s < n; s++) if (!bots[s]!.playsInsideClose) wordPhase(s);
  }
  const order = [...score.keys()].sort((a, b) => score[b]! - score[a]!);
  const top = score[order[0]!]!;
  const seats: SeatResult[] = bots.map((b, s) => ({
    name: b.name, score: score[s]!, balance: bal[s]!,
    // competition ranking (ties share the better place), like findIndex by score
    place: 1 + order.findIndex((o) => score[o] === score[s]),
    win: score[s] === top, words: words[s]!, wins: won[s]!, spent: spent[s]!,
  }));
  return { seats, auctions: k, unsold, log: opts.log ? log : undefined };
}
