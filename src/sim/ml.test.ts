import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { newPolicy, loadPolicyFile, mlFeatures, mlBid, NF, POLICY_PATH } from "../ml.js";
import { decideBid } from "../strategy.js";
import { mlThinker, fittedOpponent, OPP_DEFAULT } from "./bots.js";
import { playMatch, Rng } from "./engine.js";

const rack = new Map([["A", 1], ["T", 1], ["R", 1]]);
test("policy file loads (if present) and has the documented layout", () => {
  const p = loadPolicyFile(POLICY_PATH);
  if (fs.existsSync(POLICY_PATH)) { assert.ok(p); assert.equal(p!.nf, NF); }
});
test("ML policy outputs a legal bid 0..balance", () => {
  const p = loadPolicyFile() ?? newPolicy();
  for (const bal of [0, 1, 7, 100]) for (const L of "AEQSZ") {
    const b = decideBid({ letter: L, myBalance: bal, myRack: rack, bagRemaining: 30 }, p);
    assert.ok(Number.isInteger(b) && b >= 0 && b <= bal, `${L} ${bal} -> ${b}`);
  }
  const x = mlFeatures(10, { li: 0, tiles: 3, vowels: 1, duplicate: 0, bag: 40, balance: 5, rewardBefore: 0, rewardAfter: 4, lenBefore: 0, lenAfter: 4, improves: true, completesLong: false, delta: 3 });
  assert.ok(mlBid(p, x, 10, 5, "Vickrey", [3, 3]).bid <= 5);
});
test("dead Q stays a skip under the policy", () => {
  assert.equal(decideBid({ letter: "Q", myBalance: 100, myRack: new Map([["E", 1]]), bagRemaining: 30 }, loadPolicyFile() ?? newPolicy()), 0);
});
test("untrained policy equals the heuristic", () => {
  assert.equal(decideBid({ letter: "S", myBalance: 60, myRack: rack, bagRemaining: 30 }, newPolicy()), decideBid({ letter: "S", myBalance: 60, myRack: rack, bagRemaining: 30 }, null));
});
test("playMatch runs a policy bot", () => {
  const bots = [mlThinker(loadPolicyFile() ?? newPolicy()), ...Array.from({ length: 5 }, (_, i) => fittedOpponent(OPP_DEFAULT, "o" + i))];
  const r = playMatch(bots, new Rng(4));
  assert.equal(r.seats.length, 6); assert.ok(r.seats[0]!.balance >= 0);
});
