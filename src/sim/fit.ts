// Fit one opponent policy per frequently-seen live bot by the method of
// simulated moments: choose OppParams so that, inside the simulated field,
// the bot's public statistics (auction win share by phase, winning bid by
// phase, price paid, leftover coins, final score, words/length) match what
// the public tables show. Outcomes (place, win rate) are NOT fitted; they
// are held out for validation.
import fs from "node:fs";
import { Pool } from "./pool.js";
import { observed, FIT_KEYS, MOMENT_KEYS, finalize, newAcc } from "./moments.js";
import { OPP_DEFAULT, OPP_BOUNDS, OPP_KEYS, type OppParams } from "./bots.js";
import { Rng } from "./engine.js";

const FLOOR: Record<string, number> = { share0: 0.02, share1: 0.02, share2: 0.02, top0: 1, top1: 1, top2: 1, paid: 0.7, bal: 3, score: 4, nwords: 0.2, wlen: 0.15, frac6: 0.05 };
const GAMES = Number(process.env.FIT_GAMES ?? 100), GENS = Number(process.env.FIT_GENS ?? 18), LAMBDA = 10, PASSES = Number(process.env.FIT_PASSES ?? 2);

function clamp(p: OppParams): OppParams {
  const q = { ...p };
  for (const k of OPP_KEYS) { const [lo, hi] = OPP_BOUNDS[k]; q[k] = Math.min(hi, Math.max(lo, q[k])); }
  return q;
}
function mergeAccs(parts: any[]) { const acc = newAcc(); for (const a of parts) for (const [k, v] of Object.entries(a) as any) { const t = (acc.a[k] ??= [0, 0, 0]); t[0] += v[0]; t[1] += v[1]; t[2] += v[2]; } return acc; }

async function main() {
  const obs = observed(15);
  const bots = obs.bots.filter((b) => b.id !== 203); // never fit ourselves into the field
  console.log(`fitting ${bots.length} bots from ${obs.matchesUsed} complete public matches`);
  const pool = new Pool();
  let params: OppParams[] = bots.map(() => ({ ...OPP_DEFAULT }));
  const weights = bots.map((b) => b.matches);
  const loss = (m: any, b: (typeof bots)[0]) => FIT_KEYS.reduce((s, k) => {
    const o = b.m[k], x = m[k]; if (!Number.isFinite(o)) return s;
    const sc = Math.max(FLOOR[k]!, Number.isFinite(b.se[k]) ? b.se[k] : 0);
    return s + ((Number.isFinite(x) ? x : 0) - o) ** 2 / sc ** 2;
  }, 0);
  const report: any[] = [];
  const t0 = performance.now(); let games = 0;
  for (let pass = 0; pass < PASSES; pass++) {
    const field = { pool: params.map((p) => ({ ...p })), weights, names: bots.map((b) => b.name) };
    const next = await Promise.all(bots.map(async (b, bi) => {
      const rng = new Rng(1000 + bi + pass * 77);
      let mean = { ...params[bi]! };
      let sig: Record<string, number> = Object.fromEntries(OPP_KEYS.map((k) => [k, (OPP_BOUNDS[k][1] - OPP_BOUNDS[k][0]) * (pass ? 0.08 : 0.2)]));
      let best = { p: mean, l: Infinity, m: null as any };
      for (let g = 0; g < GENS; g++) {
        const cands = [mean, ...Array.from({ length: LAMBDA - 1 }, () => clamp(Object.fromEntries(OPP_KEYS.map((k) => [k, mean[k] + sig[k]! * (rng.next() * 2 - 1) * 1.7])) as any))];
        const seed = 50000 + g * 1000 + bi;
        const res = await pool.run({ type: "fit", cands, field, seed, games: GAMES });
        games += GAMES * cands.length;
        const scored = res.map((a: any, i: number) => { const m = finalize(mergeAccs([a]), GAMES).m; return { p: cands[i]!, l: loss(m, b), m }; }).sort((x: any, y: any) => x.l - y.l);
        // recombine top 3
        const elite = scored.slice(0, 3);
        mean = clamp(Object.fromEntries(OPP_KEYS.map((k) => [k, elite.reduce((s: number, e: any) => s + e.p[k], 0) / elite.length])) as any);
        if (scored[0].l < best.l) best = scored[0];
        for (const k of OPP_KEYS) sig[k]! *= 0.88;
      }
      return best;
    }));
    params = next.map((n) => n.p);
    const avg = next.reduce((s, n) => s + n.l, 0) / next.length;
    console.log(`pass ${pass}: mean moment loss ${avg.toFixed(1)} (${FIT_KEYS.length} moments, ~1 per moment = within noise); ${games} games, ${(games / ((performance.now() - t0) / 1000)).toFixed(0)} games/s`);
    if (pass === PASSES - 1) next.forEach((n, i) => report.push({ id: bots[i]!.id, name: bots[i]!.name, matches: bots[i]!.matches, loss: n.l, params: n.p, observed: bots[i]!.m, fitted: n.m }));
  }
  pool.close();
  fs.mkdirSync(new URL("../../sim/", import.meta.url), { recursive: true });
  fs.writeFileSync(new URL("../../sim/opponents.json", import.meta.url), JSON.stringify({ created: new Date().toISOString(), matchesUsed: obs.matchesUsed, observedUnsold: obs.unsold, gamesSimulated: games, bots: report }, null, 1));
  console.log("wrote sim/opponents.json");
  void MOMENT_KEYS;
}
main();
