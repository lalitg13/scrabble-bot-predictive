// Small pure-TypeScript neural bidding policy (no Python / no deps).
//
// Feature layout (NF = 18), all from public info the live bot sees:
//  0 bias            1 balance/100       2 bag/68            3 tiles/10
//  4 vowelFrac       5 letterValue/10    6 isVowel           7 isPower(QZJX, usable)
//  8 isS             9 duplicate/2      10 heuristicBid/30  11 rewardBefore/30
// 12 rewardAfter/30 13 lenBefore/7      14 lenAfter/7       15 improves
// 16 completesLong  17 equityDelta/20
// Net: 18 -> H tanh -> 2 outputs (Gaussian means; sd = exp(logStd)).
//   out0 = log-multiplier m on the heuristic bid, out1 = additive offset a (coins/5).
//   bid = clamp(round(h * exp(m) + 5a), 0, balance).  At play time the mean is used.
// Output layer starts at zero, so an untrained policy == the heuristic.
import fs from "node:fs";

export const NF = 18;
export interface MlPolicy { version: 1; nf: number; h: number; w1: number[]; b1: number[]; w2: number[]; b2: number[]; logStd: number[]; meta?: any }

const VOW = new Set([0, 4, 8, 14, 20]); const POW = new Set([16, 25, 9, 23]);
const VAL = [1,3,3,2,1,4,2,4,1,8,5,1,3,1,1,3,10,1,1,1,1,4,4,8,4,10];
export interface Internals { li: number; tiles: number; vowels: number; duplicate: number; bag: number; balance: number; rewardBefore: number; rewardAfter: number; lenBefore: number; lenAfter: number; improves: boolean; completesLong: boolean; delta: number }

export function mlFeatures(hBid: number, f: Internals): Float64Array {
  const x = new Float64Array(NF);
  x[0] = 1; x[1] = f.balance / 100; x[2] = f.bag / 68; x[3] = f.tiles / 10;
  x[4] = f.tiles ? f.vowels / f.tiles : 0; x[5] = (VAL[f.li] ?? 1) / 10; x[6] = VOW.has(f.li) ? 1 : 0; x[7] = POW.has(f.li) ? 1 : 0;
  x[8] = f.li === 18 ? 1 : 0; x[9] = Math.min(2, f.duplicate) / 2; x[10] = hBid / 30; x[11] = f.rewardBefore / 30;
  x[12] = f.rewardAfter / 30; x[13] = f.lenBefore / 7; x[14] = f.lenAfter / 7; x[15] = f.improves ? 1 : 0;
  x[16] = f.completesLong ? 1 : 0; x[17] = Math.max(-2, Math.min(2, f.delta / 20));
  return x;
}

export function newPolicy(h = 16, seed = 1): MlPolicy {
  let s = seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  return { version: 1, nf: NF, h, w1: Array.from({ length: h * NF }, () => r() * 0.6), b1: new Array(h).fill(0), w2: new Array(2 * h).fill(0), b2: [0, 0], logStd: [Math.log(0.35), Math.log(0.6)] };
}

export function forward(p: MlPolicy, x: Float64Array): { hid: Float64Array; mu: [number, number] } {
  const hid = new Float64Array(p.h);
  for (let j = 0; j < p.h; j++) { let z = p.b1[j]!; const o = j * p.nf; for (let i = 0; i < p.nf; i++) z += p.w1[o + i]! * x[i]!; hid[j] = Math.tanh(z); }
  const mu: [number, number] = [p.b2[0]!, p.b2[1]!];
  for (let k = 0; k < 2; k++) for (let j = 0; j < p.h; j++) mu[k] += p.w2[k * p.h + j]! * hid[j]!;
  mu[0] = Math.max(-3, Math.min(1.5, mu[0])); mu[1] = Math.max(-6, Math.min(6, mu[1]));
  return { hid, mu };
}

/** eps = null -> deterministic (mean). Returns the bid and the sampled action. */
export function mlBid(p: MlPolicy, x: Float64Array, hBid: number, balance: number, auctionType: string | undefined, eps: [number, number] | null) {
  const { hid, mu } = forward(p, x);
  const a: [number, number] = eps ? [mu[0] + Math.exp(p.logStd[0]!) * eps[0], mu[1] + Math.exp(p.logStd[1]!) * eps[1]] : mu;
  let bid = Math.round(hBid * Math.exp(a[0]) + 5 * a[1]);
  if (auctionType === "FirstPrice" && bid >= 2) bid = Math.max(1, Math.floor(bid * 0.85));
  bid = Math.max(0, Math.min(Math.floor(balance), bid));
  return { bid, a, mu, hid };
}

/** Accumulate d log pi(a|x) / d theta into g (same layout as flatten()). */
export function addLogpGrad(p: MlPolicy, g: Float64Array, x: Float64Array, hid: Float64Array, mu: [number, number], a: [number, number]) {
  const H = p.h, NFp = p.nf; const W1 = H * NFp, B1 = W1 + H, W2 = B1 + H, B2 = W2 + 2 * H, LS = B2 + 2;
  const dmu = [0, 0];
  for (let k = 0; k < 2; k++) { const sd = Math.exp(p.logStd[k]!); const z = (a[k]! - mu[k]!) / sd; dmu[k] = z / sd; g[LS + k] += z * z - 1; }
  const dh = new Float64Array(H);
  for (let k = 0; k < 2; k++) { g[B2 + k] += dmu[k]!; for (let j = 0; j < H; j++) { g[W2 + k * H + j] += dmu[k]! * hid[j]!; dh[j] += dmu[k]! * p.w2[k * H + j]!; } }
  for (let j = 0; j < H; j++) { const dz = dh[j]! * (1 - hid[j]! * hid[j]!); if (!dz) continue; g[B1 + j] += dz; const o = j * NFp; for (let i = 0; i < NFp; i++) g[o + i] += dz * x[i]!; }
}
export function nParams(p: MlPolicy) { return p.h * p.nf + p.h + 2 * p.h + 2 + 2; }
export function flatten(p: MlPolicy): Float64Array { return Float64Array.from([...p.w1, ...p.b1, ...p.w2, ...p.b2, ...p.logStd]); }
export function unflatten(p: MlPolicy, v: Float64Array): MlPolicy {
  const H = p.h, NFp = p.nf; let o = 0; const take = (n: number) => Array.from(v.slice(o, (o += n)));
  return { ...p, w1: take(H * NFp), b1: take(H), w2: take(2 * H), b2: take(2), logStd: take(2).map((s) => Math.max(Math.log(0.05), Math.min(Math.log(1.5), s))) };
}

export const POLICY_PATH = new URL("../sim/ml-policy.json", import.meta.url);
export function loadPolicyFile(path: URL | string = POLICY_PATH): MlPolicy | null {
  if (process.env.CT_ML === "0") return null;
  try {
    const p = JSON.parse(fs.readFileSync(path, "utf8")) as MlPolicy;
    if (p.version !== 1 || p.nf !== NF || p.w1.length !== p.h * NF || p.w2.length !== 2 * p.h) return null;
    if (![...p.w1, ...p.b1, ...p.w2, ...p.b2].every(Number.isFinite)) return null;
    return p;
  } catch { return null; }
}
