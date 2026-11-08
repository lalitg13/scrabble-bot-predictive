// Public-evidence moments per bot, and the same moments from simulated games.
import fs from "node:fs";
import type { MatchResult } from "./engine.js";

export const MOMENT_KEYS = ["share0", "share1", "share2", "top0", "top1", "top2", "paid", "bal", "score", "nwords", "wlen", "frac6", "place", "winrate"] as const;
export type Moments = Record<(typeof MOMENT_KEYS)[number], number> & { n: number };
// Fitting uses everything except outcomes (place/winrate are held out for validation).
export const FIT_KEYS = ["share0", "share1", "share2", "top0", "top1", "top2", "paid", "bal", "score", "nwords", "wlen", "frac6"] as const;

const phase = (bag: number) => (bag >= 45 ? 0 : bag >= 23 ? 1 : 2);

class Acc {
  a: Record<string, [number, number, number]> = {};
  add(k: string, x: number) { const v = (this.a[k] ??= [0, 0, 0]); v[0]++; v[1] += x; v[2] += x * x; }
  mean(k: string) { const v = this.a[k]; return v && v[0] ? v[1] / v[0] : NaN; }
  se(k: string) { const v = this.a[k]; if (!v || v[0] < 2) return NaN; const m = v[1] / v[0]; return Math.sqrt(Math.max(0, v[2] / v[0] - m * m) / v[0]); }
}
export function finalize(acc: Acc, n: number): { m: Moments; se: Moments } {
  const m = { n } as Moments, se = { n } as Moments;
  for (const k of MOMENT_KEYS) { m[k] = acc.mean(k); se[k] = acc.se(k); }
  return { m, se };
}

/** Add one seat's view of a finished sim match. */
export function addSim(acc: Acc, r: MatchResult, seat: number) {
  const s = r.seats[seat]!;
  const won = [0, 0, 0], tot = [0, 0, 0];
  for (const a of r.log!) {
    const ph = phase(a.bag); tot[ph]++;
    if (a.winner === seat) { won[ph]++; acc.add("top" + ph, a.top); acc.add("paid", a.paid); }
  }
  for (let p = 0; p < 3; p++) if (tot[p]) acc.add("share" + p, won[p] / tot[p]);
  acc.add("bal", s.balance); acc.add("score", s.score); acc.add("nwords", s.words.length);
  for (const w of s.words) { acc.add("wlen", w); acc.add("frac6", w >= 6 ? 1 : 0); }
  acc.add("place", s.place); acc.add("winrate", s.win ? 1 : 0);
}
export function newAcc() { return new Acc(); }

/** Observed moments from sim/data/evidence.json (public tables only). */
export function observed(minMatches = 15, file = new URL("../../sim/data/evidence.json", import.meta.url)) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const names = new Map<number, string>(d.bot.map((b: any) => [b.id, b.name]));
  const top = new Map<number, number>(d.tb.map((t: any) => [t.auction_id, t.top_bid]));
  const byMatch = new Map<number, any[]>();
  for (const r of d.mp) { (byMatch.get(r.match_id) ?? byMatch.set(r.match_id, []).get(r.match_id)!).push(r); }
  const auc = new Map<number, any[]>();
  for (const a of d.ar) (auc.get(a.match_id) ?? auc.set(a.match_id, []).get(a.match_id)!).push(a);
  const words = new Map<string, any[]>();
  for (const w of d.wp) { const k = w.match_id + ":" + w.bot_id; (words.get(k) ?? words.set(k, []).get(k)!).push(w); }
  // Only complete matches: 6 seats and a full auction log (68 auctions).
  const accs = new Map<number, Acc>(); const counts = new Map<number, number>();
  let used = 0; const field = new Acc();
  for (const [mid, seats] of byMatch) {
    const as = (auc.get(mid) ?? []).sort((x, y) => x.auction_id - y.auction_id);
    if (seats.length !== 6 || as.length !== 68) continue;
    used++;
    const sorted = seats.map((s) => s.score).sort((a, b) => b - a);
    field.add("unsold", as.filter((a) => a.winner_bot_id == null).length / 68);
    for (const s of seats) {
      const acc = accs.get(s.bot_id) ?? accs.set(s.bot_id, new Acc()).get(s.bot_id)!;
      counts.set(s.bot_id, (counts.get(s.bot_id) ?? 0) + 1);
      const won = [0, 0, 0], tot = [0, 0, 0];
      as.forEach((a, k) => {
        const bag = 67 - k; const ph = phase(bag); tot[ph]++;
        if (a.winner_bot_id === s.bot_id) { won[ph]++; const t = top.get(a.auction_id); if (t != null) acc.add("top" + ph, t); acc.add("paid", a.paid); }
      });
      for (let p = 0; p < 3; p++) acc.add("share" + p, won[p] / tot[p]);
      acc.add("bal", s.balance); acc.add("score", s.score);
      const ws = words.get(mid + ":" + s.bot_id) ?? [];
      acc.add("nwords", ws.length);
      for (const w of ws) { acc.add("wlen", w.word.length); acc.add("frac6", w.word.length >= 6 ? 1 : 0); }
      acc.add("place", 1 + sorted.indexOf(s.score)); acc.add("winrate", s.score === sorted[0] ? 1 : 0);
    }
  }
  const bots = [...counts].filter(([, n]) => n >= minMatches).sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, name: names.get(id) ?? String(id), matches: n, ...finalize(accs.get(id)!, n) }));
  return { bots, matchesUsed: used, unsold: field.mean("unsold") };
}
