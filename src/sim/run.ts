// npm run sim: throughput benchmark + validation of the simulated field
// against public live outcomes (place / win rate / score were NOT fitted).
import fs from "node:fs";
import { Pool } from "./pool.js";
import { loadField, sum, summary } from "./train.js";
import { DEFAULT_PARAMS } from "../strategy.js";
import { playMatch, Rng } from "./engine.js";
import { fittedOpponent } from "./bots.js";
import { observed } from "./moments.js";

async function main() {
  const N = Number(process.env.GAMES ?? 20000);
  const field = loadField();
  const o = JSON.parse(fs.readFileSync(new URL("../../sim/opponents.json", import.meta.url), "utf8"));
  const pool = new Pool();
  const trained = fs.existsSync(new URL("../../sim/trained.json", import.meta.url)) ? JSON.parse(fs.readFileSync(new URL("../../sim/trained.json", import.meta.url), "utf8")).params : null;
  const t0 = performance.now();
  const cands = trained ? [DEFAULT_PARAMS, trained] : [DEFAULT_PARAMS];
  const parts = await pool.runSplit({ type: "ct", cands, field, seed: 123_456, games: N, selfPlay: 0 }, 250);
  const sec = (performance.now() - t0) / 1000;
  console.log(`CasualThinker games: ${N * cands.length} in ${sec.toFixed(1)} s = ${(N * cands.length / sec).toFixed(0)} games/s on ${pool.workers.length} workers`);
  cands.forEach((_, i) => console.log(i ? "trained " : "current ", JSON.stringify(summary(sum(parts, i)))));
  pool.close();
  const ct = observed(1).bots.find((b) => b.id === 203);
  if (ct) console.log(`live CasualThinker (public, ${ct.matches} complete matches, mixed strategy versions): place ${ct.m.place.toFixed(2)} win ${(ct.m.winrate * 100).toFixed(1)}% score ${ct.m.score.toFixed(1)} leftover ${ct.m.bal.toFixed(1)}`);

  // Field-only validation: each fitted bot's simulated outcomes vs its public outcomes.
  const rng = new Rng(99); const stats = field.pool.map(() => ({ n: 0, place: 0, win: 0, score: 0 }));
  const cum: number[] = []; let s = 0; for (const w of field.weights) cum.push((s += w));
  const V = Number(process.env.FIELD_GAMES ?? 6000);
  for (let g = 0; g < V; g++) {
    const ids: number[] = [];
    while (ids.length < 6) { const x = rng.next() * s; const i = cum.findIndex((c) => c > x); if (!ids.includes(i)) ids.push(i); }
    const r = playMatch(ids.map((i) => fittedOpponent(field.pool[i]!, field.names![i]!)), rng);
    r.seats.forEach((st, j) => { const e = stats[ids[j]!]!; e.n++; e.place += st.place; e.win += st.win ? 1 : 0; e.score += st.score; });
  }
  const rows = o.bots.map((b: any, i: number) => ({ name: b.name, matches: b.matches, obsPlace: b.observed.place, simPlace: stats[i]!.place / stats[i]!.n, obsWin: b.observed.winrate, simWin: stats[i]!.win / stats[i]!.n, obsScore: b.observed.score, simScore: stats[i]!.score / stats[i]!.n }));
  const corr = (a: number[], b: number[]) => { const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length; let n = 0, da = 0, db = 0; a.forEach((x, i) => { n += (x - ma) * (b[i]! - mb); da += (x - ma) ** 2; db += (b[i]! - mb) ** 2; }); return n / Math.sqrt(da * db); };
  const mae = (a: number[], b: number[]) => a.reduce((x, y, i) => x + Math.abs(y - b[i]!), 0) / a.length;
  const v = {
    placeCorr: corr(rows.map((r: any) => r.obsPlace), rows.map((r: any) => r.simPlace)), placeMAE: mae(rows.map((r: any) => r.obsPlace), rows.map((r: any) => r.simPlace)),
    winCorr: corr(rows.map((r: any) => r.obsWin), rows.map((r: any) => r.simWin)), winMAE: mae(rows.map((r: any) => r.obsWin), rows.map((r: any) => r.simWin)),
    scoreCorr: corr(rows.map((r: any) => r.obsScore), rows.map((r: any) => r.simScore)), scoreMAE: mae(rows.map((r: any) => r.obsScore), rows.map((r: any) => r.simScore)),
    obsMeanScore: rows.reduce((x: number, r: any) => x + r.obsScore * r.matches, 0) / rows.reduce((x: number, r: any) => x + r.matches, 0),
    simMeanScore: rows.reduce((x: number, r: any) => x + r.simScore * r.matches, 0) / rows.reduce((x: number, r: any) => x + r.matches, 0),
  };
  console.log("field validation (held-out outcomes):", JSON.stringify(v));
  fs.writeFileSync(new URL("../../sim/validation.json", import.meta.url), JSON.stringify({ created: new Date().toISOString(), summary: v, rows, ct: ct ? { matches: ct.matches, m: ct.m } : null, simCurrent: summary(sum(parts, 0)), simTrained: trained ? summary(sum(parts, 1)) : null, gamesPerSec: N * cands.length / sec }, null, 1));
}
main();
