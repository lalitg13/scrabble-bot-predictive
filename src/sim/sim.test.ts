import test from "node:test";
import assert from "node:assert/strict";
import { letterValue, DEFAULT_BAG, lengthMultiplier } from "./official/letters.js";
import { VALUE, BAG_COUNTS, scoreWord } from "../scoring.js";
import { playMatch, Rng, type Bot, wordReward } from "./engine.js";
import { officialFindBestPlayable } from "./bots.js";

const L = (c: string) => c.charCodeAt(0) - 65;
const fixed = (amt: (l: number, bag: number) => number, word: (r: Uint8Array, bag: number) => Uint8Array | null = () => null, name = "b"): Bot =>
  ({ name, bid: (v, l) => Math.min(v.balance, amt(l, v.bagRemaining)), word: (v) => word(v.rack, v.bagRemaining) });

test("letter values and bag equal official letters.ts", () => {
  for (let i = 0; i < 26; i++) assert.equal(VALUE[i], letterValue(String.fromCharCode(65 + i)));
  assert.deepEqual([...BAG_COUNTS], DEFAULT_BAG.map(([, n]) => n));
  assert.equal(BAG_COUNTS.reduce((a, b) => a + b, 0), 98);
});
test("word reward equals official floor(base*num/denom) for all lengths", () => {
  for (const w of ["AT", "CAT", "QUIZ", "JAZZY", "QUARTZ", "ZYZZYVA", "OXYPHENBUTAZONE"]) {
    let base = 0n; for (const c of w) base += BigInt(letterValue(c));
    const [n, d] = lengthMultiplier(w.length);
    assert.equal(scoreWord(w), Number((base * n) / d));
    const u = new Uint8Array(26); for (const c of w) u[L(c)]!++;
    assert.equal(wordReward(u).reward, Number((base * n) / d));
  }
});
test("all tiles bought -> 30 dealt + 68 auctions; unsold tiles are discarded, not returned", () => {
  const r = playMatch(Array.from({ length: 6 }, (_, i) => fixed(() => 1 + i)), new Rng(3), { log: true });
  assert.equal(r.auctions, 68); assert.equal(r.unsold, 0);
  const r2 = playMatch(Array.from({ length: 6 }, () => fixed(() => 0)), new Rng(3), { log: true });
  assert.equal(r2.auctions, 68); assert.equal(r2.unsold, 68);
});
test("Vickrey: winner pays second bid; lone bidder pays reserve 1; balances never negative", () => {
  const r = playMatch([fixed(() => 9), fixed(() => 4), ...Array.from({ length: 4 }, () => fixed(() => 0))], new Rng(5), { log: true });
  const first = r.log![0]!;
  assert.equal(first.winner, 0); assert.equal(first.top, 9); assert.equal(first.paid, 4);
  const lone = playMatch([fixed(() => 7), ...Array.from({ length: 5 }, () => fixed(() => 0))], new Rng(5), { log: true });
  assert.ok(lone.log!.every((a) => a.paid === 1 && a.winner === 0));
  assert.equal(lone.seats[0]!.balance, 100 - 68);
});
test("FirstPrice pays the top bid", () => {
  const r = playMatch([fixed(() => 9), fixed(() => 4), ...Array.from({ length: 4 }, () => fixed(() => 0))], new Rng(5), { log: true, auctionType: "FirstPrice" });
  assert.equal(r.log![0]!.paid, 9);
});
test("equal top bids are split at random", () => {
  let a = 0; const rng = new Rng(11);
  for (let g = 0; g < 200; g++) { const r = playMatch([fixed(() => 1), fixed(() => 1), ...Array.from({ length: 4 }, () => fixed(() => 0))], rng, { log: true }); a += r.log![0]!.winner === 0 ? 1 : 0; }
  assert.ok(a > 70 && a < 130, String(a));
});
test("no submitWord after the final auction closes (match ends in that reducer)", () => {
  let lastBidSeen = false, violation = false;
  const spy: Bot = { name: "spy", bid: (v) => { if (v.bagRemaining === 0) lastBidSeen = true; return Math.min(v.balance, 5); },
    word: (v) => { if (lastBidSeen) violation = true; return officialPlay(v.rack); } };
  playMatch([spy, ...Array.from({ length: 5 }, () => fixed(() => 0))], new Rng(2));
  assert.ok(lastBidSeen); assert.equal(violation, false);
});
test("words score into both balance and score; ties share the win", () => {
  const r = playMatch(Array.from({ length: 6 }, () => fixed(() => 0, (rack) => officialPlay(rack))), new Rng(9));
  for (const s of r.seats) assert.equal(s.balance, 100 + s.score);
  const top = Math.max(...r.seats.map((s) => s.score));
  assert.equal(r.seats.filter((s) => s.win).length, r.seats.filter((s) => s.score === top).length);
});
function officialPlay(rack: Uint8Array) { const w = officialFindBestPlayable(rack, 2); if (!w) return null; const u = new Uint8Array(26); for (const c of w) u[L(c)]!++; return u; }
