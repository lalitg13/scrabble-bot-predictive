import fs from "node:fs";
import { bestPlays, type DictIndex } from "../dictionary.js";
import { VALUE } from "../scoring.js";
import { prepareDictionary, decideBid, evaluateBid, chooseWord, setStrategyParams, dictIndex, type StrategyParams } from "../strategy.js";
import { type MlPolicy, mlFeatures, mlBid, addLogpGrad } from "../ml.js";
import type { Bot, SeatView } from "./engine.js";
import { Rng } from "./engine.js";

export const WORDS: string[] = fs.readFileSync(new URL("../../spacetimedb/wordlist.txt", import.meta.url), "utf8")
  .trim().toUpperCase().split("\n");
prepareDictionary(WORDS);
export const INDEX: DictIndex = dictIndex();

const L = (i: number) => String.fromCharCode(65 + i);
function toMap(r: Uint8Array): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < 26; i++) if (r[i]) m.set(L(i), r[i]!);
  return m;
}
function usedOf(word: string): Uint8Array {
  const u = new Uint8Array(26);
  for (const c of word) u[c.charCodeAt(0) - 65]!++;
  return u;
}

/**
 * CasualThinker: exactly the live decideBid/chooseWord, fed only what the
 * live client sees (own rack, own balance, public bagTotal, auction type).
 * The live client plays words as soon as chooseWord returns one, and bids
 * using the rack after any word it is cashing; the sim's word phase before
 * each bid reproduces that.
 */
export function casualThinker(params: Partial<StrategyParams> | null, name = "CasualThinker"): Bot {
  return {
    name,
    bid(v: SeatView, letter: number) {
      if (params) setStrategyParams(params);
      return decideBid({ letter: L(letter), myBalance: v.balance, myRack: toMap(v.rack), bagRemaining: v.bagRemaining, auctionType: v.auctionType }, null);
    },
    word(v: SeatView) {
      if (params) setStrategyParams(params);
      const w = chooseWord({ myRack: toMap(v.rack), dictionary: WORDS, bagRemaining: v.bagRemaining, myBalance: v.balance });
      return w ? usedOf(w) : null;
    },
  };
}

// ---- Official padding sims (game.ts decideBid / simulateWordPlay) ----
const BY_LEN = [...WORDS].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
export function officialFindBestPlayable(rack: Uint8Array, minLen: number): string | undefined {
  let total = 0; for (let i = 0; i < 26; i++) total += rack[i]!;
  if (total < minLen) return undefined;
  const need = new Uint8Array(26);
  for (const w of BY_LEN) {
    if (w.length < minLen) break;
    if (w.length > total) continue;
    need.fill(0); let ok = true;
    for (let i = 0; i < w.length; i++) { const s = w.charCodeAt(i) - 65; if (++need[s]! > rack[s]!) { ok = false; break; } }
    if (ok) return w;
  }
  return undefined;
}
export function officialSim(tag: "Cheapskate" | "ValueBidder" | "Aggressive", name: string): Bot {
  return {
    name, playsInsideClose: true,
    bid(v, letter, rng) {
      const value = VALUE[letter]!; const vowel = "AEIOU".includes(L(letter));
      const base = tag === "Cheapskate" ? value - 1 : tag === "ValueBidder" ? value : value + (vowel ? 4 : 2);
      const jitter = rng.int(-2, 2);
      return Math.max(Math.min(Math.max(base + jitter, 1), v.balance), 0);
    },
    word(v) { const w = officialFindBestPlayable(v.rack, 3); return w ? usedOf(w) : null; },
  };
}

// ---- Fitted opponent policy family ----
export interface OppParams {
  a: number;     // base bid
  b: number;     // weight on immediate best-word reward gain from this tile
  c: number;     // weight on face value
  vow: number;   // vowel adjustment
  s: number;     // spend-down weight on balance / expected remaining claims
  late: number;  // multiplier with <=12 tiles left in bag
  noise: number; // bid noise sd
  skip: number;  // prob of not bidding on a tile that adds nothing
  lmin: number;  // play words of at least this length immediately
  endBag: number;// play anything once bag <= endBag
  tileCap: number;// play anything once rack holds >= tileCap tiles
}
export const OPP_KEYS: (keyof OppParams)[] = ["a", "b", "c", "vow", "s", "late", "noise", "skip", "lmin", "endBag", "tileCap"];
export const OPP_BOUNDS: Record<keyof OppParams, [number, number]> = {
  a: [-10, 25], b: [0, 3], c: [-2, 4], vow: [-8, 8], s: [0, 3], late: [0, 3], noise: [0, 10], skip: [0, 1],
  lmin: [2, 8], endBag: [0, 40], tileCap: [3, 14],
};
export const OPP_DEFAULT: OppParams = { a: 4, b: 0.8, c: 0.5, vow: 0, s: 0.6, late: 1.2, noise: 3, skip: 0.3, lmin: 5, endBag: 6, tileCap: 9 };

function topReward(r: Uint8Array): { reward: number; len: number; play: Uint8Array | null } {
  const p = bestPlays(INDEX, r)[0];
  return p ? { reward: p.reward, len: p.length, play: p.used } : { reward: 0, len: 0, play: null };
}
function gauss(rng: Rng): number { return Math.sqrt(-2 * Math.log(rng.next() + 1e-12)) * Math.cos(2 * Math.PI * rng.next()); }

export function fittedOpponent(p: OppParams, name: string): Bot {
  const tmp = new Uint8Array(26);
  return {
    name,
    bid(v, letter, rng) {
      if (v.balance <= 0) return 0;
      const before = topReward(v.rack).reward;
      tmp.set(v.rack); tmp[letter]!++;
      const after = topReward(tmp).reward;
      const u = Math.max(0, after - before);
      if (u === 0 && rng.next() < p.skip) return 0;
      const claims = Math.max(1, Math.ceil((v.bagRemaining + 1) / 6));
      let x = p.a + p.b * u + p.c * VALUE[letter]! + ("AEIOU".includes(L(letter)) ? p.vow : 0) + p.s * v.balance / claims;
      if (v.bagRemaining <= 12) x *= p.late;
      x += p.noise * gauss(rng);
      return Math.max(0, Math.min(v.balance, Math.round(x)));
    },
    word(v) {
      const t = topReward(v.rack);
      if (!t.play) return null;
      let tiles = 0; for (let i = 0; i < 26; i++) tiles += v.rack[i]!;
      if (t.len >= Math.round(p.lmin) || v.bagRemaining <= p.endBag || tiles >= p.tileCap) return t.play;
      return null;
    },
  };
}

function gaussN(r: Rng): number { return Math.sqrt(-2 * Math.log(r.next() + 1e-12)) * Math.cos(2 * Math.PI * r.next()); }
export interface Decision { bag: number; letter: string; rack: string; bal: number; hBid: number; bid: number; rewardAfter: number; lenAfter: number; improves: boolean }
export interface MlTrace { decisions: Decision[]; words: string[] }
/**
 * ML CasualThinker. Same decision path as live decideBid (heuristic features
 * -> policy -> rails) and the same chooseWord. If `train` is given, actions are
 * sampled with its own noise Rng and d log pi is accumulated into train.g.
 */
export function mlThinker(policy: MlPolicy | null, name = "CT-ML", train?: { g: Float64Array; noise: Rng }, trace?: MlTrace): Bot {
  return {
    name,
    bid(v: SeatView, letter: number) {
      setStrategyParams({});
      const ctx = { letter: L(letter), myBalance: v.balance, myRack: toMap(v.rack), bagRemaining: v.bagRemaining, auctionType: v.auctionType };
      let bid: number; const d = evaluateBid(ctx);
      if (!train || !policy || !d.internals) bid = decideBid(ctx, policy);
      else {
        const x = mlFeatures(d.bid, d.internals);
        const r = mlBid(policy, x, d.bid, d.internals.balance, ctx.auctionType, [gaussN(train.noise), gaussN(train.noise)]);
        addLogpGrad(policy, train.g, x, r.hid, r.mu, r.a); bid = r.bid;
      }
      if (trace) { let rack = ""; for (let i = 0; i < 26; i++) rack += L(i).repeat(v.rack[i]!);
        trace.decisions.push({ bag: v.bagRemaining, letter: L(letter), rack, bal: v.balance, hBid: d.bid, bid, rewardAfter: d.internals?.rewardAfter ?? 0, lenAfter: d.internals?.lenAfter ?? 0, improves: d.internals?.improves ?? false }); }
      return bid;
    },
    word(v: SeatView) {
      setStrategyParams({});
      const w = chooseWord({ myRack: toMap(v.rack), dictionary: WORDS, bagRemaining: v.bagRemaining, myBalance: v.balance });
      if (w && trace) trace.words.push(w);
      return w ? usedOf(w) : null;
    },
  };
}
