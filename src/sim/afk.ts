// Time-boxed train-every-5k loop. Each cycle: 5,000 games for the incumbent
// and 5,000 for one mutated candidate on the SAME deals/fields (paired).
// Keep the candidate only if win rate rises and average place is not worse.
import fs from "node:fs";
import { Pool } from "./pool.js";
import { loadField, sum, summary, CT_BOUNDS } from "./train.js";
import { DEFAULT_PARAMS, type StrategyParams } from "../strategy.js";
import { Rng } from "./engine.js";

const STOP = new Date(process.env.STOP_AT ?? "2026-11-07T20:12:00-06:00").getTime();
const GAMES = 5000;
const T = new URL("../../sim/trained.json", import.meta.url);
const LJ = new URL("../../sim/afk-training-log.json", import.meta.url);
const LM = new URL("../../sim/afk-training-log.md", import.meta.url);
const cst = () => new Date().toLocaleString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", second: "2-digit" }) + " CST";
type K = keyof StrategyParams; const KEYS = Object.keys(CT_BOUNDS) as K[];
function clampP(p: any) { const q: any = { ...p }; for (const k of KEYS) { const [lo, hi, int] = CT_BOUNDS[k]!; q[k] = Math.min(hi, Math.max(lo, q[k])); if (int) q[k] = Math.round(q[k]); } return q as StrategyParams; }
function gauss(r: Rng) { return Math.sqrt(-2 * Math.log(r.next() + 1e-12)) * Math.cos(2 * Math.PI * r.next()); }

async function main() {
  const trained = JSON.parse(fs.readFileSync(T, "utf8"));
  let best: StrategyParams = { ...DEFAULT_PARAMS, ...trained.params };
  const start = { ...best };
  const field = loadField(); const pool = new Pool(); const rng = new Rng(Date.now() & 0xffffff);
  const log: any[] = fs.existsSync(LJ) ? JSON.parse(fs.readFileSync(LJ, "utf8")) : [];
  if (!fs.existsSync(LM)) fs.writeFileSync(LM, "# AFK training log (simulated games vs fitted live-opponent field)\n\n");
  let total = 0, accepted = 0, scale = 0.06;
  const practice = async (p: StrategyParams, tag: string) => {
    const parts = await pool.runSplit({ type: "practice", cands: [p], field, seed: 31_000_000 + total, games: 10000 }, 250);
    total += 10000; const s = summary(sum(parts, 0));
    const e = { time: cst(), type: "practice-field", tag, games: 10000, winRate: s.winRate, avgPlace: s.avgPlace, avgScore: s.avgScore };
    log.push(e); fs.appendFileSync(LM, `- ${e.time} practice field (${tag}, 10k games, weak official sims + FieldA + FieldB): win ${(s.winRate * 100).toFixed(1)}%, place ${s.avgPlace.toFixed(2)}, score ${s.avgScore.toFixed(1)}\n`);
    return s;
  };
  await practice(start, "start");
  for (let cycle = 1; Date.now() < STOP; cycle++) {
    const cand = clampP(Object.fromEntries(KEYS.map((k) => [k, (rng.next() < 0.35 ? best[k] + (CT_BOUNDS[k]![1] - CT_BOUNDS[k]![0]) * scale * gauss(rng) : best[k])])));
    const parts = await pool.runSplit({ type: "ct", cands: [best, cand], field, seed: 5_000_000 + cycle * 104729, games: GAMES, selfPlay: 0.25, selfParams: DEFAULT_PARAMS }, 250);
    total += 2 * GAMES;
    const b = summary(sum(parts, 0)), c = summary(sum(parts, 1));
    const keep = c.winRate > b.winRate && c.avgPlace <= b.avgPlace;
    const deltas: Record<string, [number, number]> = {};
    if (keep) { for (const k of KEYS) if (cand[k] !== best[k]) deltas[k] = [best[k], cand[k]]; best = cand; accepted++;
      fs.writeFileSync(T, JSON.stringify({ ...trained, updated: new Date().toISOString(), params: best }, null, 1)); }
    else scale = Math.max(0.02, scale * 0.995);
    const cur = keep ? c : b;
    const e = { time: cst(), cycle, totalGames: total, winRate: cur.winRate, avgPlace: cur.avgPlace, avgScore: cur.avgScore, candidateWinRate: c.winRate, changed: keep, deltas };
    log.push(e); fs.writeFileSync(LJ, JSON.stringify(log, null, 1));
    fs.appendFileSync(LM, `- ${e.time} cycle ${cycle}: ${total} games; best win ${(cur.winRate * 100).toFixed(1)}%, place ${cur.avgPlace.toFixed(2)}, score ${cur.avgScore.toFixed(1)}; candidate ${(c.winRate * 100).toFixed(1)}% -> ${keep ? "KEPT " + Object.entries(deltas).map(([k, [a, z]]) => `${k} ${+a.toFixed(3)}->${+z.toFixed(3)}`).join(", ") : "rejected"}\n`);
    console.log(fs.readFileSync(LM, "utf8").trim().split("\n").pop());
    if (cycle % 40 === 0) await practice(best, `cycle ${cycle}`);
  }
  // Final paired confirmation on fresh deals: start-of-session vs final best.
  const parts = await pool.runSplit({ type: "ct", cands: [start, best], field, seed: 88_000_000, games: 20000, selfPlay: 0.25, selfParams: DEFAULT_PARAMS }, 250);
  total += 40000;
  const s0 = summary(sum(parts, 0)), s1 = summary(sum(parts, 1));
  const p1 = await practice(best, "end");
  const fin = { time: cst(), type: "final", totalGames: total, accepted, startHard: s0, endHard: s1, endPractice: p1, params: best };
  log.push(fin); fs.writeFileSync(LJ, JSON.stringify(log, null, 1));
  fs.appendFileSync(LM, `\n**Final (${fin.time})**: ${total} games this session, ${accepted} accepted changes. Hard field (20k paired fresh games): start win ${(s0.winRate * 100).toFixed(1)}% place ${s0.avgPlace.toFixed(2)} -> end win ${(s1.winRate * 100).toFixed(1)}% place ${s1.avgPlace.toFixed(2)}.\n`);
  console.log("FINAL", JSON.stringify(fin));
  pool.close();
}
main();
