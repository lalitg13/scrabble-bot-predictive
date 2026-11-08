// Live online learning (off the auction critical path).
// During a match: liveBid() = policy mean + small exploration noise, recording
// d log pi per decision (microseconds). After the match ends: endMatch() does ONE
// REINFORCE step (advantage = own final score vs running baseline; live only sees
// our own seat, so no opponent scores) with a tiny, norm-clipped step, then writes
// sim/ml-policy.json atomically. Typically < 5 ms. The coach runs as a detached
// background process on a debounce and is never awaited.
import fs from "node:fs";
import { spawn } from "node:child_process";
import { type MlPolicy, mlFeatures, mlBid, addLogpGrad, flatten, unflatten, nParams, POLICY_PATH } from "./ml.js";
import { evaluateBid, applyWinRails, activePolicy, setActivePolicy, type BidContext } from "./strategy.js";

const SIM = new URL("../sim/", import.meta.url);
const STATE = new URL("online-state.json", SIM), LIVE = new URL("live-traces.jsonl", SIM);
const EXPLORE = Number(process.env.CT_EXPLORE ?? 0), LR = Number(process.env.CT_ONLINE_LR ?? 0.01);
type Ep = { g: Float64Array; decisions: any[]; words: string[] };
const eps = new Map<string, Ep>();
let state: { baseline: number; games: number } = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { baseline: 75, games: 0 };
let coachRunning = false, lastCoach = 0;
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());

export function liveBid(match: string, ctx: BidContext): number {
  const p = activePolicy(); const d = evaluateBid(ctx);
  if (!p || !d.internals) return d.bid; // hard rails: dead QZJX / no money -> heuristic 0
  const x = mlFeatures(d.bid, d.internals);
  const noise = EXPLORE > 0 ? [EXPLORE * gauss(), EXPLORE * gauss()] : null;
  const r = mlBid(p, x, d.bid, d.internals.balance, ctx.auctionType, noise);
  const bid = applyWinRails(d, r.bid);
  let ep = eps.get(match); if (!ep) eps.set(match, (ep = { g: new Float64Array(nParams(p)), decisions: [], words: [] }));
  if (EXPLORE > 0) {
    const scaled = { ...p, logStd: p.logStd.map((s) => s + Math.log(EXPLORE)) };
    addLogpGrad(scaled, ep.g, x, r.hid, r.mu, r.a);
  } else {
    addLogpGrad(p, ep.g, x, r.hid, r.mu, r.a);
  }
  ep.decisions.push({ bag: ctx.bagRemaining, letter: ctx.letter, bal: d.internals.balance, hBid: d.bid, bid, raw: r.bid, lenAfter: d.internals.lenAfter, improves: d.internals.improves });
  return bid;
}
export function noteWord(match: string, w: string) { eps.get(match)?.words.push(w); }

export function endMatch(match: string, score: number, balance: number, extra?: { place?: number; win?: boolean; topOpp?: number }): string {
  const t0 = performance.now(); const ep = eps.get(match); eps.delete(match);
  const p = activePolicy(); if (!ep || !p) return "no-policy";
  const leftoverPen = 0.2 * (balance / 100);
  const adv = extra?.place
    ? (extra.win ? 1 : 0) + 0.2 * (3.5 - extra.place) - leftoverPen + 0.15 * ((score - (extra.topOpp ?? score)) / 100)
    : (score - state.baseline) / 100 - leftoverPen;
  state.baseline = 0.95 * state.baseline + 0.05 * score; state.games++;
  let norm = 0; for (const v of ep.g) norm += v * v; norm = Math.sqrt(norm) || 1;
  const step = LR * Math.max(-1, Math.min(1, adv)) / Math.max(1, norm / 10);
  const th = flatten(p); for (let i = 0; i < th.length; i++) th[i] += step * ep.g[i]!;
  const np: MlPolicy = { ...unflatten(p, th), logStd: p.logStd, meta: { ...(p.meta ?? {}), onlineGames: state.games, onlineUpdatedAt: new Date().toISOString() } };
  if (process.env.CT_FREEZE_POLICY !== "1") {
    setActivePolicy(np);
    const tmp = new URL("ml-policy.json.tmp", SIM);
    fs.writeFileSync(tmp, JSON.stringify(np)); fs.renameSync(tmp, POLICY_PATH);
  }
  fs.writeFileSync(STATE, JSON.stringify(state));
  fs.appendFileSync(LIVE, JSON.stringify({ match, at: new Date().toISOString(), score, leftover: balance, adv, place: extra?.place, win: extra?.win, topOpp: extra?.topOpp, words: ep.words, decisions: ep.decisions }) + "\n");
  kickCoach();
  return `online update ${(performance.now() - t0).toFixed(1)} ms (adv ${adv.toFixed(2)}, games ${state.games}` + (extra?.place ? `, place ${extra.place}` : '') + `)`;
}
/** Detached, debounced (>=10 min) background coach packet; never awaited. */
function kickCoach() {
  if (coachRunning) return; // run after every game; skip only if a coach pass is already going
  coachRunning = true; lastCoach = Date.now();
  const c = spawn(process.execPath, ["--import", "tsx", new URL("./sim/coach.ts", import.meta.url).pathname], { stdio: "ignore", env: { ...process.env, COACH_LIVE: "1" } });
  c.on("exit", () => (coachRunning = false)); c.on("error", () => (coachRunning = false)); c.unref();
}
