import { parentPort } from "node:worker_threads";
import { playMatch, Rng, type Bot } from "./engine.js";
import { casualThinker, mlThinker, fittedOpponent, officialSim, OPP_DEFAULT, type OppParams, type MlTrace } from "./bots.js";
import { type MlPolicy, nParams } from "../ml.js";
import { DEFAULT_PARAMS } from "../strategy.js";
import { addSim, newAcc } from "./moments.js";
import type { StrategyParams } from "../strategy.js";

export interface FieldSpec { pool: OppParams[]; weights: number[]; names?: string[] }
export type Job =
  | { type: "fit"; cands: OppParams[]; field: FieldSpec; seed: number; games: number }
  | { type: "practice"; cands: (Partial<StrategyParams> | null)[]; seed: number; games: number; field: FieldSpec }
  | { type: "mltrain"; policy: MlPolicy; field: FieldSpec; seed: number; games: number; selfPlay: number; shaping: { place: number; score: number; leftover: number } }
  | { type: "mleval"; cands: (MlPolicy | null)[]; field: FieldSpec | null; seed: number; games: number; traces?: number }
  | { type: "ct"; cands: (Partial<StrategyParams> | null)[]; field: FieldSpec; seed: number; games: number; selfPlay: number; selfParams: Partial<StrategyParams> | null; officialSims?: number; ctSeats?: number };

function pick(rng: Rng, w: number[], cum: number[]): number {
  const x = rng.next() * cum[cum.length - 1]!;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m]! > x) hi = m; else lo = m + 1; }
  return lo;
}
function cumsum(w: number[]) { let s = 0; return w.map((x) => (s += x)); }
const SIMS = [officialSim("Cheapskate", "Cheapo-sim"), officialSim("ValueBidder", "Valor-sim"), officialSim("Aggressive", "Brutus-sim")];

function fieldBots(f: FieldSpec, cum: number[], rng: Rng, k: number, exclude = -1): { bots: Bot[]; ids: number[] } {
  const bots: Bot[] = [], ids: number[] = [];
  while (bots.length < k) {
    const i = pick(rng, f.weights, cum);
    if (i === exclude || ids.includes(i)) continue; // a bot is in a lobby at most once
    ids.push(i); bots.push(fittedOpponent(f.pool[i]!, f.names?.[i] ?? "opp" + i));
  }
  return { bots, ids };
}

export function runJob(job: Job): any {
  const cum = cumsum(job.field?.weights ?? [1]);
  if (job.type === "fit") {
    return job.cands.map((c) => {
      const acc = newAcc();
      for (let g = 0; g < job.games; g++) {
        const setup = new Rng(job.seed + g * 7919);
        const { bots } = fieldBots(job.field, cum, setup, 5);
        const r = playMatch([fittedOpponent(c, "target"), ...bots], new Rng(job.seed * 31 + g), { log: true });
        addSim(acc, r, 0);
      }
      return acc.a;
    });
  }
  if (job.type === "mltrain") return mlTrain(job, cum);
  if (job.type === "mleval") return mlEval(job, cum);
  if (job.type === "practice") {
    // Practice field: official Cheapskate, ValueBidder, Aggressive sims, a default
    // fitted-family opponent (FieldA) and a copy of the deployed CasualThinker defaults (FieldB).
    return job.cands.map((c) => {
      let win = 0, place = 0, score = 0, n = 0;
      for (let g = 0; g < job.games; g++) {
        const setup = new Rng(job.seed + g * 7919);
        const all: Bot[] = [SIMS[0]!, SIMS[1]!, SIMS[2]!, fittedOpponent(OPP_DEFAULT, "FieldA"), casualThinker(DEFAULT_PARAMS, "FieldB")];
        const seat = setup.int(0, 5); all.splice(seat, 0, casualThinker(c));
        const s = playMatch(all, new Rng(job.seed * 31 + g)).seats[seat]!;
        win += s.win ? 1 : 0; place += s.place; score += s.score; n++;
      }
      return { win, place, score, n, bal: 0, oppScore: 0, wlen: 0, nw: 0, f6: 0 };
    });
  }
  // ct: same seeds for every candidate (common random numbers)
  return job.cands.map((c) => {
    let win = 0, place = 0, score = 0, bal = 0, n = 0, oppScore = 0, wlen = 0, nw = 0, f6 = 0;
    const perOpp: Record<number, [number, number]> = {};
    for (let g = 0; g < job.games; g++) {
      const setup = new Rng(job.seed + g * 7919);
      const self = setup.next() < job.selfPlay ? 1 : 0;
      const sims = job.officialSims ?? 0;
      const { bots, ids } = fieldBots(job.field, cum, setup, 5 - self - sims);
      for (let i = 0; i < self; i++) bots.push(casualThinker(job.selfParams, "CT-copy"));
      for (let i = 0; i < sims; i++) bots.push(SIMS[setup.int(0, 2)]!);
      const seat = setup.int(0, 5);
      const all = [...bots]; all.splice(seat, 0, casualThinker(c));
      const r = playMatch(all, new Rng(job.seed * 31 + g));
      const s = r.seats[seat]!;
      win += s.win ? 1 : 0; place += s.place; score += s.score; bal += s.balance; n++;
      for (const w of s.words) { wlen += w; nw++; if (w >= 6) f6++; }
      r.seats.forEach((o, j) => { if (j !== seat) oppScore += o.score / 5; });
      ids.forEach((id) => { const e = (perOpp[id] ??= [0, 0]); e[0]++; e[1] += s.place < r.seats[all.indexOf(bots[ids.indexOf(id)]!)]!.place ? 1 : 0; });
    }
    return { win, place, score, bal, n, oppScore, wlen, nw, f6, perOpp };
  });
}

export function reward(s: { win: boolean; place: number; score: number; balance: number }, sh: { place: number; score: number; leftover: number }) {
  return (s.win ? 1 : 0) + sh.place * (6 - s.place) / 5 + sh.score * s.score / 100 - sh.leftover * s.balance / 100;
}
function lobby(job: { field: FieldSpec | null; seed: number }, g: number, cum: number[], me: Bot, selfPlay: number, selfBot: () => Bot) {
  const setup = new Rng(job.seed + g * 7919);
  let all: Bot[];
  if (!job.field) all = [SIMS[0]!, SIMS[1]!, SIMS[2]!, fittedOpponent(OPP_DEFAULT, "FieldA"), fittedOpponent({ ...OPP_DEFAULT, a: 7, s: 0.9, lmin: 4 }, "FieldB")];
  else { const self = setup.next() < selfPlay ? 1 : 0; all = fieldBots(job.field, cum, setup, 5 - self).bots; if (self) all.push(selfBot()); }
  const seat = setup.int(0, 5); all.splice(seat, 0, me);
  return { all, seat, matchRng: new Rng(job.seed * 31 + g) };
}
function mlTrain(job: Extract<Job, { type: "mltrain" }>, cum: number[]) {
  // Paired rollouts on identical deals/lobbies; advantage = R1 - R2 (CRN baseline).
  const G = new Float64Array(nParams(job.policy)); let win = 0, place = 0, score = 0, n = 0;
  for (let g = 0; g < job.games; g++) {
    const res: { R: number; grad: Float64Array }[] = [];
    for (let k = 0; k < 2; k++) {
      const grad = new Float64Array(G.length);
      const me = mlThinker(job.policy, "CT-ML", { g: grad, noise: new Rng((job.seed + g) * 2654435761 + k * 97 + 13) });
      const { all, seat, matchRng } = lobby(job, g, cum, me, job.selfPlay, () => mlThinker(job.policy, "CT-copy"));
      const s = playMatch(all, matchRng).seats[seat]!;
      res.push({ R: reward(s, job.shaping), grad }); win += s.win ? 1 : 0; place += s.place; score += s.score; n++;
    }
    const adv = (res[0]!.R - res[1]!.R) / 2;
    if (adv) for (let i = 0; i < G.length; i++) G[i] += adv * (res[0]!.grad[i]! - res[1]!.grad[i]!);
  }
  return { grad: Array.from(G), win, place, score, n };
}
function mlEval(job: Extract<Job, { type: "mleval" }>, cum: number[]) {
  return job.cands.map((c, ci) => {
    let win = 0, place = 0, score = 0, bal = 0, n = 0; const traces: any[] = [];
    for (let g = 0; g < job.games; g++) {
      const tr: MlTrace | undefined = g < (job.traces ?? 0) ? { decisions: [], words: [] } : undefined;
      const me = mlThinker(c, c ? "CT-ML" : "CT-heur", undefined, tr);
      const { all, seat, matchRng } = lobby(job, g, cum, me, 0, () => me);
      const r = playMatch(all, matchRng); const s = r.seats[seat]!;
      win += s.win ? 1 : 0; place += s.place; score += s.score; bal += s.balance; n++;
      if (tr) traces.push({ seed: job.seed, game: g, policy: c ? "ml" : "heuristic", win: s.win, place: s.place, score: s.score, leftover: s.balance,
        topOpp: Math.max(...r.seats.filter((_, j) => j !== seat).map((o) => o.score)), opponents: all.filter((_, j) => j !== seat).map((b) => b.name), words: tr.words, decisions: tr.decisions.filter((d) => d.bid > 0 || d.hBid > 0) });
    }
    return { win, place, score, bal, n, traces };
  });
}

if (parentPort) parentPort.on("message", (m: { id: number; job: Job }) => {
  parentPort!.postMessage({ id: m.id, res: runJob(m.job) });
});
