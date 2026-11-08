// npm run ml-train: REINFORCE (paired-rollout CRN baseline) for the ML bidding policy.
// Env: MINUTES (default 20), BATCH games per update (default 1000), EVAL games (default 4000),
//      EVAL_EVERY games (default 5000), LR (default 0.02), RESUME=1 to continue from sim/ml-policy.json.
// Reward shaping comes from sim/coach-advice.json (rewardWeights) if present.
import fs from "node:fs";
import { Pool } from "./pool.js";
import { loadField } from "./train.js";
import { newPolicy, flatten, unflatten, loadPolicyFile, type MlPolicy } from "../ml.js";

const SIM = new URL("../../sim/", import.meta.url);
const LOG = new URL("ml-training-log.md", SIM), OUT = new URL("ml-policy.json", SIM), TRACES = new URL("coach-traces.jsonl", SIM);
const log = (s: string) => { console.log(s); fs.appendFileSync(LOG, s + "\n"); };

export async function evaluate(pool: Pool, cands: (MlPolicy | null)[], field: any, games: number, seed: number, traces = 0) {
  const parts = await pool.runSplit({ type: "mleval", cands, field, seed, games, traces } as any, 250);
  return cands.map((_, i) => {
    const t = { win: 0, place: 0, score: 0, bal: 0, n: 0, traces: [] as any[] };
    for (const p of parts) { const r = p[i]; t.win += r.win; t.place += r.place; t.score += r.score; t.bal += r.bal; t.n += r.n; t.traces.push(...r.traces); }
    return { winRate: t.win / t.n, avgPlace: t.place / t.n, avgScore: t.score / t.n, leftover: t.bal / t.n, games: t.n, traces: t.traces };
  });
}
export const fmt = (r: any) => `win ${(100 * r.winRate).toFixed(1)}% | place ${r.avgPlace.toFixed(2)} | score ${r.avgScore.toFixed(1)} | leftover ${r.leftover.toFixed(1)}`;

async function main() {
  const minutes = Number(process.env.MINUTES ?? 20), BATCH = Number(process.env.BATCH ?? 1000), EVALN = Number(process.env.EVAL ?? 4000);
  const EVERY = Number(process.env.EVAL_EVERY ?? 5000); let lr = Number(process.env.LR ?? 0.02);
  const advice = fs.existsSync(new URL("coach-advice.json", SIM)) ? JSON.parse(fs.readFileSync(new URL("coach-advice.json", SIM), "utf8")) : null;
  const shaping = { place: 0.15, score: 0.2, leftover: 0, ...(advice?.rewardWeights ?? {}) };
  const selfPlay = advice?.selfPlay ?? 0.2;
  const field = loadField(); const pool = new Pool();
  let pol: MlPolicy = (process.env.RESUME === "1" && loadPolicyFile(OUT)) || newPolicy(16, 7);
  let theta = flatten(pol); const m = new Float64Array(theta.length), v = new Float64Array(theta.length); let step = 0;
  const t0 = Date.now(); let games = 0, sinceEval = 0, evalSeed = 900_001;
  log(`\n## Run ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CST — ${minutes} min, batch ${BATCH}, eval ${EVALN} games/policy every ${EVERY}, lr ${lr}, shaping ${JSON.stringify(shaping)}, selfPlay ${selfPlay}${process.env.RESUME === "1" ? ", resumed" : ""}`);
  const base = await evaluate(pool, [null, pol], field, EVALN, evalSeed);
  log(`- start | heuristic: ${fmt(base[0])} | ML: ${fmt(base[1])}`);
  let best = base[1]!.winRate - base[0]!.winRate, bestPol = pol;
  let seed = 1 + Math.floor(Math.random() * 1e6);
  while (Date.now() - t0 < minutes * 60_000) {
    const parts: any[] = await pool.runSplit({ type: "mltrain", policy: pol, field, seed, games: BATCH, selfPlay, shaping } as any, 50);
    seed += BATCH;
    const g = new Float64Array(theta.length); let n = 0;
    for (const p of parts) { p.grad.forEach((x: number, i: number) => (g[i] += x)); n += p.n; }
    step++; const b1 = 0.9, b2 = 0.999;
    for (let i = 0; i < g.length; i++) { const gi = g[i]! / BATCH; m[i] = b1 * m[i]! + (1 - b1) * gi; v[i] = b2 * v[i]! + (1 - b2) * gi * gi;
      theta[i] += lr * (m[i]! / (1 - b1 ** step)) / (Math.sqrt(v[i]! / (1 - b2 ** step)) + 1e-8); }
    pol = unflatten(pol, theta); theta = flatten(pol);
    games += n; sinceEval += n;
    if (sinceEval >= EVERY) {
      sinceEval = 0;
      const r = await evaluate(pool, [null, pol], field, EVALN, evalSeed);
      const d = r[1]!.winRate - r[0]!.winRate;
      const tag = d > best ? " **new best**" : "";
      if (d > best) { best = d; bestPol = JSON.parse(JSON.stringify(pol)); }
      log(`- ${games} train games, ${((Date.now() - t0) / 60000).toFixed(1)} min | heuristic: ${fmt(r[0])} | ML: ${fmt(r[1])} | Δwin ${(100 * d).toFixed(1)} pts${tag} | sd ${pol.logStd.map((s) => Math.exp(s).toFixed(2))}`);
      fs.writeFileSync(OUT, JSON.stringify({ ...bestPol, meta: { savedAt: new Date().toISOString(), trainGames: games, evalWinDelta: best, note: "see src/ml.ts for feature layout" } }));
      lr *= 0.97;
    }
  }
  // Fresh held-out seeds for the final honest comparison.
  const hard = await evaluate(pool, [null, bestPol], field, Number(process.env.FINAL ?? 20000), 4_242_000, 40);
  const weak = await evaluate(pool, [null, bestPol], null, 10000, 5_151_000);
  log(`- **final (held-out seeds, ${hard[0]!.games} games each, fitted field)** heuristic: ${fmt(hard[0])} | ML: ${fmt(hard[1])}`);
  log(`- final easy practice field (${weak[0]!.games} games each; NOT live accuracy) heuristic: ${fmt(weak[0])} | ML: ${fmt(weak[1])}`);
  log(`- total training games ${games} (each = 1 simulated match) in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  fs.writeFileSync(OUT, JSON.stringify({ ...bestPol, meta: { savedAt: new Date().toISOString(), trainGames: games, final: { hard: { heuristic: strip(hard[0]), ml: strip(hard[1]) }, easy: { heuristic: strip(weak[0]), ml: strip(weak[1]) } } } }));
  fs.writeFileSync(TRACES, [...hard[0]!.traces, ...hard[1]!.traces].map((t) => JSON.stringify(t)).join("\n") + "\n");
  pool.close();
}
const strip = (r: any) => { const { traces, ...x } = r; return x; };
if (process.argv[1]?.endsWith("ml-train.ts")) main();
