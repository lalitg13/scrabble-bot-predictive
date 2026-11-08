// Train CasualThinker's numeric parameters in the simulated field.
// Objective per game: win (1/0) + 0.1 * (3.5 - place). Common random
// numbers: every candidate in a generation plays the same deals/fields.
import fs from "node:fs";
import { Pool } from "./pool.js";
import { DEFAULT_PARAMS, type StrategyParams } from "../strategy.js";
import { Rng } from "./engine.js";
import type { FieldSpec } from "./worker.js";

type K = keyof StrategyParams;
export const CT_BOUNDS: Partial<Record<K, [number, number, boolean?]>> = {
  holdFourBelow: [5, 14, true], endgameBag: [0, 20, true], fishFourBag: [0, 30, true], fishBag: [6, 40, true],
  fishMinBalance: [0, 40, true], fishMaxReward: [8, 40, true], fishMass: [1, 20, true], fishMassHigh: [2, 30, true], fishGain: [2, 20, true],
  floorScale: [0.2, 2.5], hungerEarly: [0.5, 4], hungerMid: [0.5, 4], hungerLate: [0.3, 3], jumpMult: [0.5, 3], kickScale: [0, 3],
  heldWordFrac: [0.4, 1.2], shapeScale: [0, 3], vowelSatMult: [0.05, 1], consOnlyMult: [0.1, 1], dupMult1: [0.1, 1.2], dupMult2: [0.05, 1],
  reserveFrac: [0, 0.6], reserveCap: [0, 50, true], reserveBag: [0, 50, true], fourCapBag: [0, 50, true], fourCapImproves: [2, 40, true],
  fourCapOther: [1, 30, true], noImproveStopBag: [0, 20, true],
};
const KEYS = Object.keys(CT_BOUNDS) as K[];
const fit = (r: any) => (r.win + 0.1 * (3.5 * r.n - r.place)) / r.n;

export function loadField(filter?: (i: number) => boolean): FieldSpec {
  const o = JSON.parse(fs.readFileSync(new URL("../../sim/opponents.json", import.meta.url), "utf8"));
  const bots = o.bots.filter((_: any, i: number) => !filter || filter(i));
  return { pool: bots.map((b: any) => b.params), weights: bots.map((b: any) => b.matches), names: bots.map((b: any) => b.name) };
}
export function sum(parts: any[][], i: number) {
  const t: any = { win: 0, place: 0, score: 0, bal: 0, n: 0, oppScore: 0, wlen: 0, nw: 0, f6: 0 };
  for (const p of parts) for (const k of Object.keys(t)) t[k] += p[i][k];
  return t;
}
export function summary(r: any) {
  return { games: r.n, winRate: r.win / r.n, avgPlace: r.place / r.n, avgScore: r.score / r.n, leftover: r.bal / r.n, avgOppScore: r.oppScore / r.n, avgWordLen: r.wlen / Math.max(1, r.nw), frac6: r.f6 / Math.max(1, r.nw), wordsPerGame: r.nw / r.n };
}
function clampP(p: any) {
  const q: any = { ...p };
  for (const k of KEYS) { const [lo, hi, int] = CT_BOUNDS[k]!; q[k] = Math.min(hi, Math.max(lo, q[k])); if (int) q[k] = Math.round(q[k]); }
  return q as StrategyParams;
}

async function main() {
  const GENS = Number(process.env.GENS ?? 40), LAMBDA = Number(process.env.LAMBDA ?? 14), GAMES = Number(process.env.GAMES ?? 1400);
  const SELF = 0.25, CHUNK = 100;
  const field = loadField();
  const pool = new Pool();
  const rng = new Rng(4242);
  let mean: StrategyParams = { ...DEFAULT_PARAMS };
  const sig: Record<string, number> = Object.fromEntries(KEYS.map((k) => [k, (CT_BOUNDS[k]![1] - CT_BOUNDS[k]![0]) * 0.12]));
  const t0 = performance.now(); let games = 0;
  const history: any[] = [];
  for (let g = 0; g < GENS; g++) {
    const cands: StrategyParams[] = [mean];
    for (let i = 1; i < LAMBDA; i++) cands.push(clampP(Object.fromEntries(KEYS.map((k) => [k, mean[k] + sig[k]! * gaussian(rng)]))));
    const seed = 900000 + g * 100003;
    const parts = await pool.runSplit({ type: "ct", cands, field, seed, games: GAMES, selfPlay: SELF, selfParams: DEFAULT_PARAMS }, CHUNK);
    games += GAMES * cands.length;
    const scored = cands.map((c, i) => ({ c, r: sum(parts, i) })).sort((a, b) => fit(b.r) - fit(a.r));
    const elite = scored.slice(0, 4);
    // weighted recombination, only move if elite beats current mean
    const meanFit = fit(scored.find((s) => s.c === mean)!.r);
    if (fit(elite[0]!.r) > meanFit) {
      const w = [0.4, 0.3, 0.2, 0.1];
      mean = clampP(Object.fromEntries(KEYS.map((k) => [k, elite.reduce((s, e, i) => s + w[i]! * e.c[k], 0)])));
    }
    for (const k of KEYS) sig[k]! *= 0.95;
    const gps = games / ((performance.now() - t0) / 1000);
    const s = summary(scored[0]!.r);
    history.push({ gen: g, meanFit, bestFit: fit(scored[0]!.r), best: s });
    console.log(`gen ${g}: incumbent fit ${meanFit.toFixed(4)} best ${fit(scored[0]!.r).toFixed(4)} (win ${(s.winRate * 100).toFixed(1)}% place ${s.avgPlace.toFixed(2)} score ${s.avgScore.toFixed(1)}) | ${games} games ${gps.toFixed(0)} g/s`);
  }
  // Final evaluation on fresh seeds, paired against the deployed defaults.
  const finalGames = Number(process.env.FINAL ?? 40000);
  const evalOn = async (name: string, f: FieldSpec, extra: any = {}) => {
    const parts = await pool.runSplit({ type: "ct", cands: [DEFAULT_PARAMS, mean], field: f, seed: 77_000_000, games: finalGames, selfPlay: SELF, selfParams: DEFAULT_PARAMS, ...extra }, 250);
    const before = summary(sum(parts, 0)), after = summary(sum(parts, 1));
    console.log(name, "before", JSON.stringify(before), "\n", name, "after ", JSON.stringify(after));
    return { name, before, after };
  };
  const evals = [
    await evalOn("full field", field),
    await evalOn("holdout: even-indexed bots only", loadField((i) => i % 2 === 0)),
    await evalOn("holdout: odd-indexed bots only", loadField((i) => i % 2 === 1)),
    await evalOn("no self-play copies", field, { selfPlay: 0 }),
  ];
  const elapsed = (performance.now() - t0) / 1000;
  fs.writeFileSync(new URL("../../sim/trained.json", import.meta.url), JSON.stringify({ created: new Date().toISOString(), games, elapsedSec: elapsed, trainingGamesPerSec: games / elapsed, params: mean, defaults: DEFAULT_PARAMS, evals, history }, null, 1));
  console.log("wrote sim/trained.json");
  pool.close();
}
function gaussian(r: Rng) { return Math.sqrt(-2 * Math.log(r.next() + 1e-12)) * Math.cos(2 * Math.PI * r.next()); }
if (import.meta.url === `file://${process.argv[1]}`) main();
