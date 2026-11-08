// Win-max casual strategy.
//
// Unspent coins score nothing, and long words pay a large length bonus
// (4=1.5x, 5=2x, 6=2.5x, 7+=3x). The old policy only bid the tiny change in
// immediate equity, so it finished games with 100+ coins and one short word.
// This version bids true building value, keeps buying after it can already
// spell something, and spends leftover money as the bag shrinks.
// Q, Z, J, and X are still skipped unless a rack word can use them.
// Leave/endgame rails borrow BestBot/Macondo ideas (cesar, Woogles, 2025):
// value the leftover rack instead of dumping a cheap short word, and treat
// a nearly empty bag like an endgame where leftover coins must convert.
// https://blog.woogles.io/posts/2025-05-04-the-mathematics-and-algorithms-behind-bestbot/
// Quackle (https://github.com/quackle/quackle) adds score-plus-leave equity,
// a midgame / pre-endgame / endgame split, and ranking by win chance rather
// than raw points. See src/quackle.ts.

import { canPlay, usesLetter, bestPlays, buildIndex, type DictIndex, type Play } from "./dictionary.js";
import { VALUE, BAG_COUNTS } from "./scoring.js";
import { type MlPolicy, mlFeatures, mlBid, loadPolicyFile } from "./ml.js";
import { leaveValue, scorePlusLeave, winLift, timingHeuristic, phase, endgameDeadwood, winProb6, STATIC_PRUNE } from "./quackle.js";

const ALPHABET = 26;
const VOWEL = new Uint8Array(ALPHABET);
for (const ch of "AEIOU") VOWEL[ch.charCodeAt(0) - 65] = 1;
const POWER = new Uint8Array(ALPHABET);
for (const ch of "QZJX") POWER[ch.charCodeAt(0) - 65] = 1;
const CORE = new Uint8Array(ALPHABET);
for (const ch of "RSTNL") CORE[ch.charCodeAt(0) - 65] = 1;
const S_INDEX = "S".charCodeAt(0) - 65;

const PLAYERS = 6;

/**
 * Tunable numbers. The live bot and the simulator run the same code; the
 * trainer (src/sim/train.ts) searches over these. Defaults = deployed policy.
 */
export const DEFAULT_PARAMS = {
  holdFourBelow: 13,
  endgameBag: 0,
  fishFourBag: 1,
  fishBag: 6,
  fishMinBalance: 8,
  fishMaxReward: 35,
  fishMass: 1,
  fishMassHigh: 6,
  fishGain: 8,
  floorScale: 0.6629832531619667,
  hungerEarly: 0.9981288666847591,
  hungerMid: 1.0884765383557231,
  hungerLate: 0.7236327408351971,
  jumpMult: 1.4948715533673018,
  kickScale: 0.23542662938265385,
  heldWordFrac: 1.123964713408582,
  shapeScale: 1.6111098824139922,
  vowelSatMult: 0.9589424481693923,
  consOnlyMult: 0.5006554482053659,
  dupMult1: 0.6282888659381308,
  dupMult2: 0.6671126197102125,
  reserveFrac: 0.2716050991667104,
  reserveCap: 20,
  reserveBag: 20,
  fourCapBag: 40,
  fourCapImproves: 19,
  fourCapOther: 22,
  noImproveStopBag: 0,
};
export type StrategyParams = typeof DEFAULT_PARAMS;
let P: StrategyParams = { ...DEFAULT_PARAMS };
export function setStrategyParams(p: Partial<StrategyParams>): void {
  P = { ...DEFAULT_PARAMS, ...p };
}
export function getStrategyParams(): StrategyParams {
  return { ...P };
}

export interface BidContext {
  letter: string;
  myBalance: number;
  myRack: Map<string, number>;
  /** Casual lobbies are Vickrey. First-price shades the same value. */
  auctionType?: "Vickrey" | "FirstPrice";
  /** Public match_state.bagTotal, when the client knows it. */
  bagRemaining?: number;
  /** Our current score and the best opponent score, for Quackle-style win%. */
  myScore?: number;
  topOpp?: number;
}

export interface WordContext {
  myRack: Map<string, number>;
  dictionary: readonly string[];
  bagRemaining?: number;
  myBalance?: number;
  myScore?: number;
  topOpp?: number;
}

export interface BidDecision {
  bid: number;
  value: number;
  equityWith: number;
  equityWithout: number;
  wordWith: string | null;
  wordWithout: string | null;
  waivedReserve: boolean;
  /** Public-information internals used as ML policy features. */
  internals?: BidInternals;
}
export interface BidInternals {
  li: number; tiles: number; vowels: number; duplicate: number; bag: number; balance: number;
  rewardBefore: number; rewardAfter: number; lenBefore: number; lenAfter: number;
  improves: boolean; completesLong: boolean; delta: number;
}

const indexByWords = new WeakMap<object, DictIndex>();
let currentIndex: DictIndex | null = null;

export function prepareDictionary(words: readonly string[]): { indexed: number; ms: number } {
  const cached = indexByWords.get(words);
  if (cached) {
    currentIndex = cached;
    return { indexed: cached.terminals, ms: 0 };
  }
  const started = performance.now();
  const index = buildIndex(words);
  indexByWords.set(words, index);
  currentIndex = index;
  return { indexed: index.terminals, ms: performance.now() - started };
}

function indexFor(words: readonly string[]): DictIndex {
  const cached = indexByWords.get(words);
  if (cached) return cached;
  const index = buildIndex(words);
  indexByWords.set(words, index);
  return index;
}

function requireIndex(): DictIndex {
  if (!currentIndex) {
    throw new Error("prepareDictionary() must run before decideBid");
  }
  return currentIndex;
}

export function countsFromRack(rack: Map<string, number>): Uint8Array {
  const counts = new Uint8Array(ALPHABET);
  for (const [letter, n] of rack) {
    if (!n || n <= 0) continue;
    const upper = letter.toUpperCase();
    if (upper.length !== 1) continue;
    const li = upper.charCodeAt(0) - 65;
    if (li < 0 || li > 25) continue;
    counts[li] = Math.min(255, (counts[li] ?? 0) + n);
  }
  return counts;
}

function tileCount(counts: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < ALPHABET; i++) n += counts[i] ?? 0;
  return n;
}

export function shouldPlay(
  play: Play,
  tiles: number,
  bagRemaining: number | undefined,
): boolean {
  // Cash long bonus words immediately (5=2x, 6=2.5x, 7+=3x).
  if (play.length >= 5) return true;
  const ph = phase(bagRemaining);
  // 2–3 letter dumps (UT, EAU) waste a rack the way a bad BestBot leave would.
  // Quackle endgame (empty bag) and our late bag (<=6) are the convert window.
  if (play.length <= 3) {
    if (ph === "endgame") return true;
    if (bagRemaining !== undefined && bagRemaining <= 6) return true;
    if (tiles >= 10) return true;
    if (bagRemaining !== undefined && tiles + bagRemaining < 4) return true;
    return false;
  }
  // Hold a 4-letter word while the rack can still grow into a 5–7.
  // Pre-endgame (bag <= 14, Quackle's full-playout window): cash the 4.
  if (play.length === 4) {
    if (tiles >= P.holdFourBelow) return true;
    if (ph === "preendgame" || ph === "endgame") return true;
    if (bagRemaining !== undefined && bagRemaining <= Math.max(P.fishFourBag, 6)) return true;
    return false;
  }
  if (tiles >= 8) return true;
  if (bagRemaining !== undefined && bagRemaining <= P.endgameBag) return true;
  const reachable = tiles + (bagRemaining ?? 0);
  if (bagRemaining !== undefined && (reachable < 4)) {
    return true;
  }
  return false;
}

type RankCtx = { bag?: number; myScore?: number; topOpp?: number };

function faceValue(counts: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < ALPHABET; i++) s += (VALUE[i] ?? 0) * (counts[i] ?? 0);
  return s;
}

function pickGreedy(index: DictIndex, rack: Uint8Array, bag: number | undefined): Play | null {
  const tiles = tileCount(rack);
  if (tiles < 2) return null;
  let best: Play | null = null;
  let bestEq = -Infinity;
  for (const play of bestPlays(index, rack)) {
    if (!shouldPlay(play, tiles, bag)) continue;
    const eq = scorePlusLeave(play.reward, leaveCounts(rack, play));
    if (eq > bestEq || (eq === bestEq && best !== null && play.word < best.word)) {
      best = play;
      bestEq = eq;
    }
  }
  return best;
}

/** Endgame::reallyPlayOut: play the first word, then greedily cash whatever shouldPlay still allows. */
function playOut(index: DictIndex, rack: Uint8Array, first: Play, bag: number | undefined): {
  reward: number; leftover: Uint8Array; emptied: boolean;
} {
  let leftover = leaveCounts(rack, first);
  let reward = first.reward;
  for (let step = 0; step < 3; step++) {
    const next = pickGreedy(index, leftover, bag);
    if (!next) break;
    reward += next.reward;
    leftover = leaveCounts(leftover, next);
  }
  return { reward, leftover, emptied: tileCount(leftover) === 0 };
}

function candidateValues(index: DictIndex, rack: Uint8Array, play: Play, bag: number | undefined): { opt: number; pess: number } {
  const rest = playOut(index, rack, play, bag);
  const opt = rest.reward + leaveValue(rest.leftover) + (leaveHasWord(index, rack, play) ? 4 : 0);
  const pess = rest.reward + endgameDeadwood(faceValue(rest.leftover), rest.emptied);
  return { opt, pess };
}

function rankScore(opt: number, pess: number, rackTiles: number, ctx: RankCtx): number {
  const ph = phase(ctx.bag);
  const raw = ph === "midgame" ? opt : pess;
  if (ctx.myScore === undefined || ctx.topOpp === undefined) return raw;
  return winProb6(ctx.myScore - ctx.topOpp + raw, (ctx.bag ?? 48) + rackTiles);
}

function rankPlays(index: DictIndex, rack: Uint8Array, plays: Play[], ctx: RankCtx = {}): Play | null {
  if (plays.length === 0) return null;
  if (plays.length === 1) return plays[0]!;
  const statics = plays.map((play) => ({ play, s: scorePlusLeave(play.reward, leaveCounts(rack, play)) }));
  statics.sort((a, b) => b.s - a.s || a.play.word.localeCompare(b.play.word));
  const cutoff = statics[0]!.s - STATIC_PRUNE;
  const kept = statics.filter((row, i) => i < 8 && row.s >= cutoff);
  const tiles = tileCount(rack);
  let best = kept[0]!.play;
  let bestEq = -Infinity;
  for (const row of kept) {
    const { opt, pess } = candidateValues(index, rack, row.play, ctx.bag);
    const eq = rankScore(opt, pess, tiles, ctx);
    if (eq > bestEq || (eq === bestEq && row.play.word < best.word)) {
      best = row.play;
      bestEq = eq;
    }
  }
  return best;
}

function leaveHasWord(index: DictIndex, rack: Uint8Array, play: Play): boolean {
  const leave = new Uint8Array(ALPHABET);
  let tiles = 0;
  for (let i = 0; i < ALPHABET; i++) {
    const left = (rack[i] ?? 0) - (play.used[i] ?? 0);
    if (left > 0) {
      leave[i] = left;
      tiles += left;
    }
  }
  if (tiles < 2) return false;
  return canPlay(index, leave);
}

export function bestPlayable(
  dictionary: readonly string[],
  rack: Map<string, number>,
): Play | null {
  const index = indexFor(dictionary);
  const counts = countsFromRack(rack);
  return rankPlays(index, counts, bestPlays(index, counts), {});
}

export function chooseWord(ctx: WordContext): string | null {
  const index = indexFor(ctx.dictionary);
  const counts = countsFromRack(ctx.myRack);
  const play = rankPlays(index, counts, bestPlays(index, counts), { bag: ctx.bagRemaining, myScore: ctx.myScore, topOpp: ctx.topOpp });
  if (!play) return null;
  if (!shouldPlay(play, tileCount(counts), ctx.bagRemaining)) return null;
  // Reviews: immediate 10-point fives repeatedly destroyed cheap 6/7-letter
  // routes. Fish only with funding, time, and real dictionary continuations.
  // Bound the hold by bag/rack size: never refuse the eventual cash-out.
  if (play.length <= 5 && tileCount(counts) < 9 &&
      (ctx.bagRemaining ?? 0) > P.fishBag && (ctx.myBalance ?? 0) >= P.fishMinBalance) {
    let hookMass = 0;
    let gain = 0;
    for (let li = 0; li < ALPHABET; li++) {
      counts[li] = (counts[li] ?? 0) + 1;
      const next = bestPlays(index, counts)[0];
      counts[li] = (counts[li] ?? 1) - 1;
      if (next && next.length >= 6 && next.reward >= play.reward + 5) {
        hookMass += BAG_COUNTS[li] ?? 0;
        gain = Math.max(gain, next.reward - play.reward);
      }
    }
    // Bag frequencies are only a prior, not a claim about unseen tiles.
    if ((play.reward < P.fishMaxReward && hookMass >= P.fishMass) || (hookMass >= P.fishMassHigh && gain >= P.fishGain)) return null;
  }
  return play.word;
}

function optionScale(bagRemaining: number | undefined): number {
  if (bagRemaining === undefined) return 1;
  if (bagRemaining <= 0) return 0;
  if (bagRemaining <= 4) return 0.2;
  if (bagRemaining <= P.endgameBag) return 0.4;
  if (bagRemaining <= 16) return 0.7;
  return 1;
}

function deadPower(index: DictIndex, counts: Uint8Array): Uint8Array {
  const dead = new Uint8Array(ALPHABET);
  for (let i = 0; i < ALPHABET; i++) {
    if (!POWER[i] || (counts[i] ?? 0) === 0) continue;
    if (!usesLetter(index, counts, i)) dead[i] = 1;
  }
  return dead;
}

function shapeValue(index: DictIndex, counts: Uint8Array): number {
  const dead = deadPower(index, counts);
  let vowels = 0;
  let cons = 0;
  let esses = 0;
  let tiles = 0;
  let face = 0;
  for (let i = 0; i < ALPHABET; i++) {
    const n = counts[i] ?? 0;
    if (n <= 0 || dead[i]) continue;
    tiles += n;
    face += (VALUE[i] ?? 0) * n;
    if (VOWEL[i]) vowels += n;
    else cons += n;
    if (i === S_INDEX) esses += n;
  }
  if (tiles === 0) return 0;
  let flex: number;
  if (vowels === 0) flex = 1.2 + Math.min(cons, 4) * 0.25;
  else if (cons === 0) flex = 1 + Math.min(vowels, 4) * 0.15;
  else {
    const ratio = vowels / tiles;
    const balance = 1 - Math.min(1, Math.abs(ratio - 0.4) / 0.4);
    flex = 3 + balance * 4;
  }
  flex += Math.min(esses, 2) * 2;
  let near = 0;
  if (tiles === 3 || tiles === 4) near = 2;
  else if (tiles === 5 || tiles === 6) near = 3.5;
  else if (tiles >= 7) near = 1.5;
  const faceOption = face * (vowels > 0 && cons > 0 ? 0.45 : 0.15);
  return flex + near + faceOption;
}

type Position = {
  play: Play | null;
  tiles: number;
  equity: number;
  played: Play | null;
};

function leaveCounts(counts: Uint8Array, play: Play): Uint8Array {
  const leave = new Uint8Array(ALPHABET);
  for (let i = 0; i < ALPHABET; i++) {
    const left = (counts[i] ?? 0) - (play.used[i] ?? 0);
    if (left > 0) leave[i] = left;
  }
  return leave;
}

function positionValue(
  index: DictIndex,
  counts: Uint8Array,
  bagRemaining: number | undefined,
  scores?: { myScore?: number; topOpp?: number },
): Position {
  const tiles = tileCount(counts);
  const rankCtx: RankCtx = { bag: bagRemaining, myScore: scores?.myScore, topOpp: scores?.topOpp };
  const play = rankPlays(index, counts, bestPlays(index, counts), rankCtx);
  const scale = optionScale(bagRemaining) * P.shapeScale;
  const hold = shapeValue(index, counts) * scale + leaveValue(counts);
  if (!play) return { play, tiles, equity: hold, played: null };
  const { opt, pess } = candidateValues(index, counts, play, bagRemaining);
  const raw = phase(bagRemaining) === "midgame" ? opt : pess;
  const leftover = leaveCounts(counts, play);
  const shapeLeave = shapeValue(index, leftover) * scale;
  const cash = raw + shapeLeave + timingHeuristic(bagRemaining ?? 48, play.length);
  if (!shouldPlay(play, tiles, bagRemaining)) {
    // We can still bank this word later, so count most of its reward.
    return { play, tiles, equity: Math.max(hold, cash * P.heldWordFrac), played: null };
  }
  return { play, tiles, equity: Math.max(cash, hold), played: play };
}

function letterFloor(li: number, tiles: number): number {
  const isVowel = VOWEL[li] === 1;
  const isCore = CORE[li] === 1;
  const isS = li === S_INDEX;
  if (tiles < 4) {
    if (isS) return 16;
    if (isVowel) return 14;
    if (isCore) return 12;
    return 8;
  }
  if (tiles < 7) {
    if (isS) return 14;
    if (isVowel) return 11;
    if (isCore) return 10;
    return 7;
  }
  if (isS) return 10;
  if (isVowel) return 7;
  if (isCore) return 6;
  return 5;
}

function spendDown(balance: number, tiles: number, bagRemaining: number | undefined): number {
  const bag = bagRemaining === undefined ? 48 : Math.max(0, bagRemaining);
  const expectedClaims = Math.max(1, Math.ceil(bag / PLAYERS));
  const hunger = tiles < 4 ? P.hungerEarly : tiles < 7 ? P.hungerMid : P.hungerLate;
  return Math.round((balance / expectedClaims) * hunger);
}

function lengthBonusKick(len: number): number {
  if (len >= 7) return 16;
  if (len === 6) return 12;
  if (len === 5) return 8;
  if (len === 4) return 5;
  return 0;
}

export function evaluateBid(ctx: BidContext): BidDecision {
  const empty: BidDecision = {
    bid: 0,
    value: 0,
    equityWith: 0,
    equityWithout: 0,
    wordWith: null,
    wordWithout: null,
    waivedReserve: false,
  };
  const balance = Math.floor(ctx.myBalance);
  if (!Number.isFinite(balance) || balance <= 0) return empty;
  const letter = ctx.letter.trim().toUpperCase();
  if (letter.length !== 1) return empty;
  const li = letter.charCodeAt(0) - 65;
  if (li < 0 || li > 25) return empty;

  const index = requireIndex();
  const without = countsFromRack(ctx.myRack);
  const withLetter = without.slice();
  withLetter[li] = Math.min(255, (withLetter[li] ?? 0) + 1);

  if (POWER[li] && !usesLetter(index, withLetter, li)) return empty;

  const scores = { myScore: ctx.myScore, topOpp: ctx.topOpp };
  const before = positionValue(index, without, ctx.bagRemaining, scores);
  const after = positionValue(index, withLetter, ctx.bagRemaining, scores);
  const delta = after.equity - before.equity;
  const rewardAfter = after.play?.reward ?? 0;
  const rewardBefore = before.play?.reward ?? 0;
  const rawRewardJump = Math.max(0, rewardAfter - rewardBefore);
  const lenAfter = after.play?.length ?? 0;
  const lenBefore = before.play?.length ?? 0;

  let amount = Math.max(0, Math.round(delta));
  amount = Math.max(amount, Math.round(rawRewardJump * P.jumpMult));
  if (lenAfter > lenBefore) {
    amount = Math.max(amount, Math.round(rawRewardJump) + Math.round(lengthBonusKick(lenAfter) * P.kickScale));
  }

  const tiles = tileCount(without);
  const bag = ctx.bagRemaining ?? 48;
  let vowels = 0;
  for (let i = 0; i < ALPHABET; i++) if (VOWEL[i]) vowels += without[i] ?? 0;
  const consonants = tiles - vowels;
  const duplicate = without[li] ?? 0;
  // EIIOU/AAIO were expensive dead racks. A generic spend-down must not
  // override the shape penalty, even when that tile is a common vowel.
  let quality = 1;
  if (VOWEL[li] && vowels >= 2 && vowels / Math.max(1, tiles) >= 0.55) quality *= P.vowelSatMult;
  if (!VOWEL[li] && consonants >= 4 && vowels === 0) quality *= P.consOnlyMult;
  if (duplicate >= 1) quality *= duplicate >= 2 ? P.dupMult2 : P.dupMult1;
  const usesNewTile = !!after.play && (after.play.used[li] ?? 0) > duplicate;
  const completesLong = usesNewTile && lenAfter >= 6 && rawRewardJump >= 5;
  const improves = usesNewTile && rawRewardJump > 0;
  const repairsShape = tiles >= 2 &&
    ((vowels >= 2 && vowels / tiles > 0.55 && !VOWEL[li]) || (vowels === 0 && !!VOWEL[li]));
  let floor = letterFloor(li, tiles) * P.floorScale + (repairsShape ? 3 : 0);
  const speculative = Math.max(floor, spendDown(balance, tiles, bag));
  amount = Math.max(amount, Math.round(speculative * quality));
  // Reserve is a follow-up budget, not hoarding. Release it for a genuine
  // 6+ completion, or with <=8 auctions left. Speculative singletons never
  // get the last coins while dozens of auctions remain (43266 E blunder).
  const reserve = bag > P.reserveBag && !completesLong ? Math.min(P.reserveCap, Math.ceil(balance * P.reserveFrac)) : 0;
  const buildingCap = Math.max(2, Math.floor(balance / Math.max(3, 6 - tiles)));
  if (!improves && bag > P.noImproveStopBag) amount = Math.min(amount, buildingCap);
  amount = Math.min(amount, Math.max(0, balance - reserve));
  // Match 45091: paid 13 for R to turn AIT into AIRT (6 pts) and had
  // only 9 coins left, so that four sat out the rest of the bag.
  // Do not let a core-letter floor drain follow-up funds for a four
  // while plenty of auctions remain. Longer completions are unchanged.
  if (lenAfter > 0 && lenAfter <= 4 && bag > P.fourCapBag) {
    amount = Math.min(amount, improves ? P.fourCapImproves : Math.min(P.fourCapOther, buildingCap));
  }
  if (bag <= P.noImproveStopBag && !improves) amount = 0;
  // Last useful tile: all-in is defensible only if it converts to points.
  if (bag <= 1 && improves) amount = balance;
  // SmartBogowin: when we know the scoreboard, bid for win chance, not just points.
  if (ctx.myScore !== undefined && ctx.topOpp !== undefined) {
    const spread = ctx.myScore - ctx.topOpp;
    const unseen = bag + tiles;
    const lift = winLift(spread, unseen, delta);
    if (lift > 0.02 && improves) {
      amount = Math.max(amount, Math.round(amount + lift * 50));
    }
    if (spread < -15 && completesLong) {
      amount = Math.max(amount, Math.min(balance, Math.round(amount * 1.15)));
    }
    if (spread > 20 && !improves) {
      amount = Math.min(amount, Math.max(0, Math.round(amount * 0.75)));
    }
  }
  amount = Math.min(amount, balance);

  if (ctx.auctionType === "FirstPrice" && amount >= 2) {
    amount = Math.max(1, Math.floor((amount * 85) / 100));
  }

  return {
    bid: amount,
    value: Math.max(0, delta),
    equityWith: after.equity,
    equityWithout: before.equity,
    wordWith: after.play?.word ?? after.played?.word ?? null,
    wordWithout: before.play?.word ?? before.played?.word ?? null,
    waivedReserve: reserve === 0,
    internals: { li, tiles, vowels, duplicate, bag, balance, rewardBefore, rewardAfter, lenBefore, lenAfter, improves, completesLong, delta },
  };
}

/**
 * Bid used by the live bot AND the simulator. If an ML policy is active
 * (sim/ml-policy.json loaded, or one passed explicitly), it adjusts the
 * heuristic bid; hard rails stay: 0..balance, dead Q/Z/J/X skipped (the
 * heuristic returns no internals for those), FirstPrice shading.
 * Pass policy=null to force the pure heuristic.
 */
/**
 * Win rails, tuned from live match 46235 (124 pts, first place: EPIDOTE / QUOTING / ZOONAL).
 * That game won by (1) paying up for a usable Q and Z so it could cash 7- and 6-letter
 * words, (2) buying vowels and builders cheaply (O/E/I around 8), (3) cashing long
 * words immediately, and (4) dumping the leftover 3-letter word only at the end.
 * Vickrey means an all-in on a usable Q/Z only costs the runner-up bid.
 */
export function applyWinRails(d: BidDecision, rawBid: number): number {
  const balance = d.internals?.balance ?? 0;
  const h = d.bid;
  if (!d.internals) return Math.max(0, Math.min(balance || h, h));
  const { bag, improves, lenAfter, completesLong, li } = d.internals;
  const power = !!POWER[li];
  // 46235: bid 56/46 (all-in) on usable Q/Z and made QUOTING + ZOONAL.
  // Dead power tiles never reach here (no internals). Do not clip these.
  // Only all-in on Q/Z/J/X when they complete a long word (46235: QUOTING/ZOONAL).
  // A lone "improves" on X/Z was paying 48+ without a 6+ cash-out (match 46570).
  if (power && (completesLong || (improves && lenAfter >= 6))) {
    const floor = Math.min(balance, Math.max(h, rawBid, 24, Math.ceil(balance * 0.55)));
    return Math.max(0, Math.min(balance, Math.round(Math.max(rawBid, floor))));
  }
  let cap = 8;
  if (completesLong || (improves && lenAfter >= 6)) cap = 14;
  if (improves && lenAfter >= 7) cap = 18;
  let bid = Math.max(0, Math.min(balance, rawBid, h + cap));
  // Ordinary letters: keep early bidding cheap, like the 8-coin O/E/I buys.
  if (!(improves && lenAfter >= 6) && balance > 0 && bag > 20) {
    bid = Math.min(bid, Math.max(h, Math.floor(balance * 0.35)));
  }
  // Endgame: leftover coins score nothing, so spend them while tiles remain.
  if (bag <= 16 && improves && balance >= 6) {
    const turnsLeft = Math.max(1, Math.ceil((bag + 2) / 6));
    const floor = Math.min(balance, Math.max(1, Math.ceil(balance / (turnsLeft + 1))));
    bid = Math.max(bid, Math.min(balance, Math.max(h, floor)));
  }
  if (bag <= 6 && improves && balance > 0) {
    bid = Math.max(bid, Math.min(balance, Math.max(h, Math.ceil(balance / Math.max(1, bag)))));
  }
  return Math.max(0, Math.min(balance, Math.round(bid)));
}

export function decideBid(ctx: BidContext, policy: MlPolicy | null | undefined = ACTIVE_POLICY): number {
  const d = evaluateBid(ctx);
  if (!policy || !d.internals) return d.bid;
  const x = mlFeatures(d.bid, d.internals);
  return applyWinRails(d, mlBid(policy, x, d.bid, d.internals.balance, ctx.auctionType, null).bid);
}

let ACTIVE_POLICY: MlPolicy | null = loadPolicyFile();
export function setActivePolicy(p: MlPolicy | null): void { ACTIVE_POLICY = p; }
export function activePolicy(): MlPolicy | null { return ACTIVE_POLICY; }

/** Conservative auction rack after an immediate or in-flight word cash-out. */
export function rackAfterWord(rack: Map<string, number>, word: string): Map<string, number> {
  const leave = new Map(rack);
  for (const c of word) {
    const n = leave.get(c) ?? 0;
    if (n <= 0) return rack; // Cache no longer represents that word's rack.
    if (n === 1) leave.delete(c); else leave.set(c, n - 1);
  }
  return leave;
}

/** The prepared dictionary index (for the simulator's opponent models). */
export function dictIndex(): DictIndex {
  return requireIndex();
}
