// Anagram search over the ENABLE wordlist.
//
// Words live in a 26-way trie. A rack walk only follows letters the rack
// still holds, and a subtree letter-mask skips branches that cannot contain
// a queried tile. An admissible upper bound (every remaining tile worth the
// rack's best letter, at the longest multiplier) drops branches that cannot
// beat the best reward already found.
//
// Build is once per dictionary. Lookups are the hot path inside the auction.

import { VALUE, totalReward } from "./scoring.js";

const ALPHABET = 26;
const VOWEL = new Uint8Array(ALPHABET);
for (const ch of "AEIOU") VOWEL[ch.charCodeAt(0) - 65] = 1;
const S_INDEX = "S".charCodeAt(0) - 65;

export type DictIndex = {
  child: Int32Array;
  term: Uint8Array;
  subMask: Uint32Array;
  nodes: number;
  terminals: number;
};

export function buildIndex(words: readonly string[]): DictIndex {
  let cap = 1 << 19;
  let child = new Int32Array(cap * ALPHABET);
  child.fill(-1);
  let term = new Uint8Array(cap);
  let nodes = 1;
  let terminals = 0;

  const grow = (minNodes: number) => {
    if (minNodes <= cap) return;
    let next = cap;
    while (next < minNodes) next *= 2;
    const nextChild = new Int32Array(next * ALPHABET);
    nextChild.fill(-1);
    nextChild.set(child);
    const nextTerm = new Uint8Array(next);
    nextTerm.set(term);
    child = nextChild;
    term = nextTerm;
    cap = next;
  };

  for (const raw of words) {
    const word = raw.trim().toUpperCase();
    if (word.length < 2) continue;
    let node = 0;
    let ok = true;
    for (let i = 0; i < word.length; i++) {
      const li = word.charCodeAt(i) - 65;
      if (li < 0 || li > 25) {
        ok = false;
        break;
      }
      const at = node * ALPHABET + li;
      let nxt = child[at]!;
      if (nxt === -1) {
        nxt = nodes++;
        grow(nodes);
        child[at] = nxt;
      }
      node = nxt;
    }
    if (!ok) continue;
    if (term[node] === 0) {
      term[node] = 1;
      terminals++;
    }
  }

  const packedChild = new Int32Array(nodes * ALPHABET);
  packedChild.set(child.subarray(0, nodes * ALPHABET));
  const packedTerm = new Uint8Array(nodes);
  packedTerm.set(term.subarray(0, nodes));
  const subMask = new Uint32Array(nodes);

  const bubble = (node: number): number => {
    let mask = 0;
    const base = node * ALPHABET;
    for (let i = 0; i < ALPHABET; i++) {
      const nxt = packedChild[base + i]!;
      if (nxt === -1) continue;
      mask |= (1 << i) | bubble(nxt);
    }
    subMask[node] = mask;
    return mask;
  };
  bubble(0);

  return {
    child: packedChild,
    term: packedTerm,
    subMask,
    nodes,
    terminals,
  };
}

export type Play = {
  word: string;
  reward: number;
  length: number;
  used: Uint8Array;
  leaveScore: number;
};

const KEEP = 16;

function leaveFlexibility(rack: Uint8Array, used: Uint8Array): number {
  let vowels = 0;
  let cons = 0;
  let esses = 0;
  let tiles = 0;
  for (let i = 0; i < ALPHABET; i++) {
    const left = rack[i]! - used[i]!;
    if (left <= 0) continue;
    tiles += left;
    if (VOWEL[i]) vowels += left;
    else cons += left;
    if (i === S_INDEX) esses += left;
  }
  if (tiles === 0) return 0.5;
  const ratio = vowels / tiles;
  const balance = 1 - Math.min(1, Math.abs(ratio - 0.4) / 0.4);
  const both = vowels > 0 && cons > 0 ? 1 : 0;
  return both * 3 + balance * 2 + Math.min(esses, 2) * 0.8 + Math.min(tiles, 6) * 0.05;
}

function wordFrom(path: Uint8Array, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(65 + path[i]!);
  return s;
}

/**
 * Highest-reward plays on `rack`. Ties keep the leaves with the best
 * vowel/consonant flexibility; at most KEEP of those are returned so the
 * caller can prefer a leave that still spells a word.
 */
// Pure-function memo caches. Results depend only on (index, rack), so caching
// cannot change which words are valid or chosen; it only skips repeat search.
const MEMO_LIMIT = 200_000;
const memoBest = new WeakMap<DictIndex, Map<string, Play[]>>();
const memoCan = new WeakMap<DictIndex, Map<string, boolean>>();
const memoUses = new WeakMap<DictIndex, Map<string, boolean>>();
function rackKey(rack: Uint8Array): string {
  return String.fromCharCode.apply(null, rack as unknown as number[]);
}
function memoFor<T>(m: WeakMap<DictIndex, Map<string, T>>, index: DictIndex): Map<string, T> {
  let c = m.get(index);
  if (!c) { c = new Map(); m.set(index, c); }
  if (c.size > MEMO_LIMIT) c.clear();
  return c;
}

export function bestPlays(index: DictIndex, rack: Uint8Array): Play[] {
  const cache = memoFor(memoBest, index);
  const key = rackKey(rack);
  let hit = cache.get(key);
  if (!hit) { hit = bestPlaysRaw(index, rack); cache.set(key, hit); }
  return hit;
}

function bestPlaysRaw(index: DictIndex, rack: Uint8Array): Play[] {
  const total = rack.reduce((sum, n) => sum + n, 0);
  if (total < 2) return [];

  let maxTile = 0;
  for (let i = 0; i < ALPHABET; i++) {
    if (rack[i]! > 0 && VALUE[i]! > maxTile) maxTile = VALUE[i]!;
  }

  const path = new Uint8Array(64);
  const used = new Uint8Array(ALPHABET);
  let bestReward = 0;
  let cands: Play[] = [];

  const consider = (len: number, base: number) => {
    const reward = totalReward(base, len);
    if (reward < bestReward) return;
    const leaveScore = leaveFlexibility(rack, used);
    const play: Play = {
      word: wordFrom(path, len),
      reward,
      length: len,
      used: used.slice(),
      leaveScore,
    };
    if (reward > bestReward) {
      bestReward = reward;
      cands = [play];
      return;
    }
    if (cands.length < KEEP) {
      cands.push(play);
      return;
    }
    let worst = 0;
    for (let i = 1; i < cands.length; i++) {
      const w = cands[i]!;
      const cur = cands[worst]!;
      if (
        w.leaveScore < cur.leaveScore ||
        (w.leaveScore === cur.leaveScore && w.word > cur.word)
      ) {
        worst = i;
      }
    }
    const cur = cands[worst]!;
    if (
      leaveScore > cur.leaveScore ||
      (leaveScore === cur.leaveScore && play.word < cur.word)
    ) {
      cands[worst] = play;
    }
  };

  const dfs = (node: number, len: number, base: number, rem: number) => {
    if (len >= 2 && index.term[node]) consider(len, base);
    if (rem === 0) return;
    const optimistic = totalReward(base + rem * maxTile, len + rem);
    if (optimistic < bestReward) return;
    const baseOff = node * ALPHABET;
    for (let i = 0; i < ALPHABET; i++) {
      if (used[i]! >= rack[i]!) continue;
      const nxt = index.child[baseOff + i];
      if (nxt === undefined || nxt === -1) continue;
      path[len] = i;
      used[i] = (used[i] ?? 0) + 1;
      dfs(nxt, len + 1, base + VALUE[i]!, rem - 1);
      used[i] = (used[i] ?? 1) - 1;
    }
  };

  dfs(0, 0, 0, total);
  return cands;
}

export function canPlay(index: DictIndex, counts: Uint8Array): boolean {
  const cache = memoFor(memoCan, index);
  const key = rackKey(counts);
  let hit = cache.get(key);
  if (hit === undefined) { hit = canPlayRaw(index, counts); cache.set(key, hit); }
  return hit;
}

function canPlayRaw(index: DictIndex, counts: Uint8Array): boolean {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total < 2) return false;
  const dfs = (node: number, len: number): boolean => {
    if (len >= 2 && index.term[node]) return true;
    const baseOff = node * ALPHABET;
    for (let i = 0; i < ALPHABET; i++) {
      if (counts[i]! === 0) continue;
      const nxt = index.child[baseOff + i];
      if (nxt === undefined || nxt === -1) continue;
      counts[i] = (counts[i] ?? 1) - 1;
      const hit = dfs(nxt, len + 1);
      counts[i] = (counts[i] ?? 0) + 1;
      if (hit) return true;
    }
    return false;
  };
  return dfs(0, 0);
}

/** True when some dictionary word spelled from `counts` uses `letter`. */
export function usesLetter(
  index: DictIndex,
  counts: Uint8Array,
  letter: number,
): boolean {
  const cache = memoFor(memoUses, index);
  const key = rackKey(counts) + String.fromCharCode(97 + letter);
  let hit = cache.get(key);
  if (hit === undefined) { hit = usesLetterRaw(index, counts, letter); cache.set(key, hit); }
  return hit;
}

function usesLetterRaw(
  index: DictIndex,
  counts: Uint8Array,
  letter: number,
): boolean {
  if (counts[letter]! <= 0) return false;
  const bit = 1 << letter;
  const dfs = (node: number, need: boolean): boolean => {
    if (!need && index.term[node]) return true;
    const baseOff = node * ALPHABET;
    for (let i = 0; i < ALPHABET; i++) {
      if (counts[i]! === 0) continue;
      const nxt = index.child[baseOff + i];
      if (nxt === undefined || nxt === -1) continue;
      if (need && i !== letter && (index.subMask[nxt]! & bit) === 0) continue;
      counts[i] = (counts[i] ?? 1) - 1;
      const hit = dfs(nxt, need && i !== letter);
      counts[i] = (counts[i] ?? 0) + 1;
      if (hit) return true;
    }
    return false;
  };
  return dfs(0, true);
}
