// Letter values and the module's integer length multiplier.
// totalReward = floor(baseLetterSum * num / denom). See spacetimedb/src/letters.ts.

export const VALUE: readonly number[] = [
  1, 3, 3, 2, 1, 4, 2, 4, 1, 8, 5, 1, 3, 1, 1, 3, 10, 1, 1, 1, 1, 4, 4, 8, 4, 10,
];

export const LETTER_VALUE: Record<string, number> = {};
for (let i = 0; i < 26; i++) {
  LETTER_VALUE[String.fromCharCode(65 + i)] = VALUE[i]!;
}

// Standard Scrabble bag, no blanks. 98 tiles. Matches DEFAULT_BAG.
export const BAG_COUNTS: readonly number[] = [
  9, 2, 2, 4, 12, 2, 3, 2, 9, 1, 1, 4, 2, 6, 8, 2, 1, 6, 4, 6, 4, 2, 2, 1, 2, 1,
];

export function lengthMultiplier(len: number): [number, number] {
  if (len <= 3) return [1, 1];
  if (len === 4) return [3, 2];
  if (len === 5) return [2, 1];
  if (len === 6) return [5, 2];
  return [3, 1];
}

export function totalReward(base: number, len: number): number {
  if (len < 2 || base <= 0) return 0;
  const [num, denom] = lengthMultiplier(len);
  return Math.floor((base * num) / denom);
}

export function scoreWord(word: string): number {
  let base = 0;
  for (let i = 0; i < word.length; i++) {
    const li = word.charCodeAt(i) - 65;
    if (li < 0 || li > 25) return 0;
    base += VALUE[li]!;
  }
  return totalReward(base, word.length);
}
