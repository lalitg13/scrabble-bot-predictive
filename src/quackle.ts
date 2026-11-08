// Quackle algorithms adapted for auction Scrabble (no board).
// Source: https://github.com/quackle/quackle  (README + libquackle engine)
//
// What transfers, and what does not:
// - ScorePlusLeaveEvaluator (evaluator.cpp): equity = play score + leave value
//   (tile worths + pairwise synergy + vowel/consonant balance).
// - Resolvent (resolvent.cpp): empty bag -> endgame; few tiles left ->
//   pre-endgame; otherwise midgame (SmartBogowin).
// - SmartBogowin (bogowinplayer.cpp): rank choices by win probability, not
//   raw points. Quackle's table is two-player; here winProb6 uses a 6-player
//   logistic so a tied score is about 1-in-6, not 50/50.
// - Simulator (sim.cpp): after static evaluation, prefer the candidate with
//   the higher averaged win rate.
// - CatchallEvaluator (catchall.cpp): when the bag is nearly empty, convert
//   remaining resources; leaving tiles unplayed is punished.
// - Board search, GADDAG generation, opening vcPlace, and Quackle's trained
//   superleave/syn2/bogowin data files do not apply (different game, and
//   those tables are theirs). Worths, pair synergy, and the VC table below
//   are auction-specific originals that follow the same formulas.
//
// Live auctions last about a second, so we evaluate these closed-form
// instead of running Quackle's multi-second Monte Carlo on each bid.

const ALPHABET = 26;
const VOWEL = new Uint8Array(ALPHABET);
for (const ch of "AEIOU") VOWEL[ch.charCodeAt(0) - 65] = 1;

export type GamePhase = "midgame" | "preendgame" | "endgame";

/** Resolvent-style phase split. SmartBogowin full-playouts start at bag <= 14 (rackSize*2); Quackle's Preendgame hook is bag <= 2 (marked TODO in their code). Empty bag is endgame. */
export const PREENDGAME_BAG = 14;
export const ENDGAME_BAG = 0;

export function phase(bagRemaining: number | undefined): GamePhase {
  if (bagRemaining === undefined) return "midgame";
  if (bagRemaining <= ENDGAME_BAG) return "endgame";
  if (bagRemaining <= PREENDGAME_BAG) return "preendgame";
  return "midgame";
}

// Auction-tuned letter worths: how useful a leftover tile is for building
// another anagram, not its board-hook value.
const WORTH = new Float64Array(ALPHABET);
(() => {
  const w: Record<string, number> = {
    A: 2.4, E: 3.0, I: 2.4, O: 2.0, U: 1.1,
    R: 2.2, S: 2.8, T: 2.1, N: 2.1, L: 1.8, D: 1.4,
    C: 0.9, P: 1.0, M: 1.0, H: 0.8, G: 0.7, B: 0.6,
    F: 0.4, Y: 0.5, W: 0.2, K: 0.3, V: -0.4,
    X: 1.2, J: 0.8, Z: 1.3, Q: 0.6,
  };
  for (const [ch, v] of Object.entries(w)) WORTH[ch.charCodeAt(0) - 65] = v;
})();

// syn2 analog: extra value for holding two complementary letters together.
const SYN = new Float64Array(ALPHABET * ALPHABET);
function addSyn(a: string, b: string, v: number): void {
  const i = a.charCodeAt(0) - 65;
  const j = b.charCodeAt(0) - 65;
  SYN[i * ALPHABET + j] += v;
  if (i !== j) SYN[j * ALPHABET + i] += v;
}
for (const [pair, v] of [
  ["QU", 8.0], ["ER", 1.6], ["IN", 1.5], ["ED", 1.3], ["ST", 1.4],
  ["RE", 1.5], ["AN", 1.2], ["OR", 1.2], ["ES", 1.3], ["AL", 1.1],
  ["ON", 1.1], ["TI", 1.2], ["EN", 1.4], ["AT", 1.1], ["TE", 1.2],
  ["AR", 1.2], ["LE", 1.1], ["TH", 0.8], ["CH", 0.7],
] as const) addSyn(pair[0]!, pair[1]!, v);
// Same-letter "syn2": extra copies of most tiles fight each other.
for (const ch of "AEIOU") addSyn(ch, ch, -1.2);
for (const ch of "BCDFGJKMNPVWXYZ") addSyn(ch, ch, -1.6);
addSyn("S", "S", 0.4);
addSyn("R", "R", -0.4);
addSyn("L", "L", -0.6);
addSyn("T", "T", -0.5);
addSyn("N", "N", -0.5);

// Vowel/consonant leave table, same shape as Quackle's evaluator lookup:
// rows = vowels 0..7, cols = consonants 0..7. Extreme imbalance is bad;
// 2–3 of each is the sweet spot for building another word.
const VC: number[][] = [
  [0.0, -0.8, -2.0, -4.0, -7.0, -11.0, -16.0, -21.0],
  [-1.2, 0.4, 0.8, 0.2, -1.8, -5.0, -9.0, -13.0],
  [-3.0, 0.2, 1.6, 2.0, 0.2, -2.4, -6.0, -9.0],
  [-6.0, -2.0, 0.6, 2.4, 1.0, -1.0, -3.5, -6.0],
  [-10.0, -5.5, -2.2, 0.4, 0.0, -1.5, -3.0, -5.0],
  [-14.0, -9.5, -6.0, -2.0, -1.0, -2.0, -3.0, -4.0],
  [-18.0, -14.0, -9.0, -4.0, -2.5, -3.0, -4.0, -5.0],
  [-22.0, -17.0, -12.0, -7.0, -5.0, -5.0, -6.0, -7.0],
];

/** ScorePlusLeaveEvaluator.leaveValue for an anagram rack (counts[0]=A). */
export function leaveValue(counts: Uint8Array): number {
  let value = 0;
  let synergy = 0;
  let vowels = 0;
  let cons = 0;
  let holdingBad = false;
  const present: number[] = [];
  for (let i = 0; i < ALPHABET; i++) {
    const n = counts[i] ?? 0;
    if (n <= 0) continue;
    value += WORTH[i]! * n;
    if (WORTH[i]! < -5.5) holdingBad = true;
    if (VOWEL[i]) vowels += n;
    else cons += n;
    present.push(i);
    if (n >= 2) synergy += SYN[i * ALPHABET + i]! * (n - 1);
  }
  for (let a = 0; a < present.length; a++) {
    for (let b = a + 1; b < present.length; b++) {
      synergy += SYN[present[a]! * ALPHABET + present[b]!]!;
    }
  }
  const qi = 16; // Q
  const ui = 20; // U
  if ((counts[qi] ?? 0) > 0 && (counts[ui] ?? 0) === 0) {
    value -= 8;
    holdingBad = true;
  }
  // evaluator.cpp: extra credit when the leave's pairs click and no clunker is held.
  if (synergy > 3.0 && !holdingBad) synergy += 1.5 * (synergy - 3.0);
  value += synergy;
  value += VC[Math.min(7, vowels)]![Math.min(7, cons)]!;
  if (value < -40) value = -40;
  return value;
}

/** equity = immediate word reward + leave, Quackle's static evaluator. */
export function scorePlusLeave(reward: number, leaveCounts: Uint8Array): number {
  return reward + leaveValue(leaveCounts);
}

/**
 * 6-player stand-in for Quackle's bogowin(lead, unseen, blanks) table.
 * At spread 0 the win chance is about 1/6. `unseen` is bag + rack tiles,
 * matching Quackle's (bag.size() + 7) idea.
 */
export function winProb6(spread: number, unseen: number): number {
  const tau = 14 + 0.45 * Math.max(1, unseen);
  return 1 / (1 + 5 * Math.exp(-spread / tau));
}

/** SmartBogowin.bogopoints idea: how much a change in expected score is worth in win chance. */
export function winLift(spread: number, unseen: number, equityDelta: number): number {
  return winProb6(spread + equityDelta, unseen) - winProb6(spread, unseen);
}

/**
 * Catchall timing: when few tiles remain, leftover resources should convert.
 * Returns a small equity adjustment for still holding a playable word.
 */
export function timingHeuristic(bagRemaining: number, wordLength: number): number {
  const leftInBagPlusRack = bagRemaining - wordLength + 7;
  if (leftInBagPlusRack >= 13 || leftInBagPlusRack < 0) return 0;
  const weights = [0, -3, 0, 0.5, 1.5, 2.5, 3.5, 5, 8, 6, 3, 1, 0];
  return weights[leftInBagPlusRack] ?? 0;
}

/** SmartBogowin pruneTo: keep candidates within this many equity points of the static leader. */
export const STATIC_PRUNE = 33;

/**
 * CatchallEvaluator::endgameResult. Going out scores the play as-is.
 * Leaving tiles is punished as -8 - 2.61 * leftover face value, because
 * unplayed tiles (and in our game, unspent coins) convert to nothing.
 */
export function endgameDeadwood(leaveFace: number, emptied: boolean): number {
  if (emptied) return 0;
  return -8 - 2.61 * leaveFace;
}

/** SmartBogowin sequential-test margin: 1.96 * 35 / sqrt(iterations). */
export function simConfidence(iterations: number): number {
  return 1.96 * 35 / Math.sqrt(Math.max(1, iterations));
}
