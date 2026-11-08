// npm run coach: build a structured review packet from sim/coach-traces.jsonl
// (written at the end of every `npm run ml-train`). The coach (an LLM or a
// person/agent acting as one) reads sim/coach-packet.json and writes
// sim/coach-advice.json in the CoachAdvice shape below; `npm run ml-train`
// (with RESUME=1 to continue) then picks up rewardWeights/selfPlay. Notes go
// in sim/coach-log.md. No network or API key is used here.
import fs from "node:fs";

export interface CoachAdvice {
  createdAt: string;
  rewardWeights?: { place?: number; score?: number; leftover?: number }; // used by ml-train
  selfPlay?: number;                                                       // used by ml-train
  featureEmphasis?: string[];   // notes for the next feature change
  safetyRails?: string[];       // rails that must stay (enforced in strategy.ts)
  stopDoing?: string[];
  observations?: { grade: "blunder" | "good" | "note"; game?: number; text: string }[];
}
const SIM = new URL("../../sim/", import.meta.url);

export function loadTraces(): any[] {
  const p = new URL("coach-traces.jsonl", SIM);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
export function packet(traces: any[]) {
  const by = (pol: string) => traces.filter((t) => t.policy === pol);
  const agg = (ts: any[]) => {
    const d = ts.flatMap((t) => t.decisions);
    return { games: ts.length, wins: ts.filter((t) => t.win).length, avgLeftover: ts.reduce((a, t) => a + t.leftover, 0) / Math.max(1, ts.length),
      avgBid: d.reduce((a, x) => a + x.bid, 0) / Math.max(1, d.length),
      mlAboveHeuristic: d.filter((x) => x.bid > x.hBid).length, mlBelowHeuristic: d.filter((x) => x.bid < x.hBid).length,
      bigNonImprovingBids: d.filter((x) => !x.improves && x.bid >= 15).length,
      wordLens: ts.flatMap((t) => t.words.map((w: string) => w.length)) };
  };
  const sample = (ts: any[]) => [...ts.filter((t) => t.win).slice(0, 4), ...ts.filter((t) => !t.win).slice(0, 4)].map((t) => ({
    game: t.game, policy: t.policy, win: t.win, place: t.place, score: t.score, topOpp: t.topOpp, leftover: t.leftover, words: t.words,
    keyBids: t.decisions.filter((d: any) => d.bid >= 10 || (d.improves && d.lenAfter >= 6)).slice(0, 12),
  }));
  return { createdAt: new Date().toISOString(), summary: { heuristic: agg(by("heuristic")), ml: agg(by("ml")) }, samples: [...sample(by("heuristic")), ...sample(by("ml"))],
    instructions: "Grade blunders/good bids, then write sim/coach-advice.json (CoachAdvice) and append notes to sim/coach-log.md; rerun with RESUME=1 npm run ml-train." };
}
export function readAdvice(): CoachAdvice | null {
  const p = new URL("coach-advice.json", SIM);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}
if (process.argv[1]?.endsWith("coach.ts")) {
  const pk: any = packet(loadTraces());
  const ls = new URL("data/live/live-summary.json", SIM), lt = new URL("live-traces.jsonl", SIM);
  if (fs.existsSync(ls)) pk.livePublic = JSON.parse(fs.readFileSync(ls, "utf8")).summary;
  if (fs.existsSync(lt)) pk.liveOurGames = fs.readFileSync(lt, "utf8").split("\n").filter(Boolean).slice(-10).map((l) => { const t = JSON.parse(l); return { match: t.match, score: t.score, leftover: t.leftover, words: t.words, bigBids: t.decisions.filter((d: any) => d.bid >= 10) }; });
  fs.writeFileSync(new URL("coach-packet.json", SIM), JSON.stringify(pk, null, 1));
  console.log(JSON.stringify(pk.summary, (k, v) => (k === "wordLens" ? undefined : v), 1));
  console.log("wrote sim/coach-packet.json; current advice:", JSON.stringify(readAdvice()));
}
