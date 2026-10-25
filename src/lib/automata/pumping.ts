// Pumping lemma for regular languages:
//   If L is regular, there is a p such that every s in L with |s| >= p can be
//   split s = xyz with |y| > 0 and |xy| <= p, and xy^i z is in L for all i >= 0.
//
// Two helpers:
//  - analyzePumping: the "proof game" for showing a language is NOT regular.
//    Given s and p, try every legal split and look for an i that leaves L.
//  - pumpingDecomposition: on an actual DFA, find the split guaranteed by the
//    lemma (the first repeated state while reading s), showing why it holds.

import { Automaton, EPSILON } from "./types";

export interface Split {
  x: string;
  y: string;
  z: string;
}

export interface PumpTry {
  i: number;
  word: string;
  inLanguage: boolean;
}

export interface SplitAnalysis extends Split {
  /** Pumped words tried (i = 0, 2, 3, ...), stopping at the first one outside L. */
  tries: PumpTry[];
  /** The i that pumps s out of L, or null if none was found up to maxI. */
  failsAt: number | null;
}

export interface PumpingAnalysis {
  inLanguage: boolean;
  longEnough: boolean;
  splits: SplitAnalysis[];
  /** True when every split can be pumped out of L: s works for the proof. */
  allSplitsFail: boolean;
}

export function pump({ x, y, z }: Split, i: number): string {
  return x + y.repeat(i) + z;
}

/** Every split s = xyz with |y| >= 1 and |xy| <= p. */
export function legalSplits(s: string, p: number): Split[] {
  const chars = [...s];
  const out: Split[] = [];
  for (let end = 1; end <= Math.min(p, chars.length); end++) {
    for (let start = 0; start < end; start++) {
      out.push({
        x: chars.slice(0, start).join(""),
        y: chars.slice(start, end).join(""),
        z: chars.slice(end).join(""),
      });
    }
  }
  return out;
}

export function analyzePumping(
  contains: (w: string) => boolean,
  s: string,
  p: number,
  maxI = 5,
): PumpingAnalysis {
  const inLanguage = contains(s);
  const longEnough = [...s].length >= p;
  if (!inLanguage || !longEnough) return { inLanguage, longEnough, splits: [], allSplitsFail: false };

  const splits = legalSplits(s, p).map((split) => {
    const tries: PumpTry[] = [];
    let failsAt: number | null = null;
    for (let i = 0; i <= maxI; i++) {
      if (i === 1) continue; // i = 1 is s itself
      const word = pump(split, i);
      const inL = contains(word);
      tries.push({ i, word, inLanguage: inL });
      if (!inL) {
        failsAt = i;
        break;
      }
    }
    return { ...split, tries, failsAt };
  });
  return { inLanguage, longEnough, splits, allSplitsFail: splits.every((sp) => sp.failsAt !== null) };
}

// ---------------------------------------------------------------------------
// Classic languages for the proof game.

export interface PumpingLanguage {
  id: string;
  name: string;
  alphabet: string[];
  regular: boolean;
  contains: (w: string) => boolean;
  /** The textbook choice of s for a given p. */
  suggest: (p: number) => string;
  /** Largest i worth trying for this language and string. */
  maxI?: (s: string) => number;
  /** Short explanation of why the suggested string works (or why it can't). */
  explanation: string;
}

const count = (w: string, c: string) => [...w].filter((x) => x === c).length;
const only = (w: string, alphabet: string[]) => [...w].every((c) => alphabet.includes(c));

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

export const PUMPING_LANGUAGES: PumpingLanguage[] = [
  {
    id: "0n1n",
    name: "{ 0ⁿ1ⁿ | n ≥ 0 }",
    alphabet: ["0", "1"],
    regular: false,
    contains: (w) => /^0*1*$/.test(w) && count(w, "0") === count(w, "1"),
    suggest: (p) => "0".repeat(p) + "1".repeat(p),
    explanation:
      "With s = 0ᵖ1ᵖ, the condition |xy| ≤ p forces y to be all 0s. Pumping (any i ≠ 1) changes the number of 0s but not the number of 1s.",
  },
  {
    id: "equal",
    name: "{ w | w has equally many 0s and 1s }",
    alphabet: ["0", "1"],
    regular: false,
    contains: (w) => only(w, ["0", "1"]) && count(w, "0") === count(w, "1"),
    suggest: (p) => "0".repeat(p) + "1".repeat(p),
    explanation:
      "Same string as for 0ⁿ1ⁿ: y is all 0s, so pumping up (i = 2) gives more 0s than 1s. (A string like (01)ᵖ would not work — y = 01 pumps fine.)",
  },
  {
    id: "palindromes",
    name: "{ w | w is a palindrome over {0,1} }",
    alphabet: ["0", "1"],
    regular: false,
    contains: (w) => only(w, ["0", "1"]) && w === [...w].reverse().join(""),
    suggest: (p) => "0".repeat(p) + "1" + "0".repeat(p),
    explanation:
      "With s = 0ᵖ10ᵖ, y lies in the first block of 0s. Pumping changes only the left block, so the 1 is no longer in the middle.",
  },
  {
    id: "ww",
    name: "{ ww | w ∈ {0,1}* }",
    alphabet: ["0", "1"],
    regular: false,
    contains: (w) => {
      if (!only(w, ["0", "1"]) || w.length % 2 !== 0) return false;
      return w.slice(0, w.length / 2) === w.slice(w.length / 2);
    },
    suggest: (p) => "0".repeat(p) + "1" + "0".repeat(p) + "1",
    explanation:
      "With s = 0ᵖ10ᵖ1, y is in the first block of 0s. Pumping makes the two halves different (or the length odd).",
  },
  {
    id: "n_gt_m",
    name: "{ aⁿbᵐ | n > m }",
    alphabet: ["a", "b"],
    regular: false,
    contains: (w) => /^a*b*$/.test(w) && count(w, "a") > count(w, "b"),
    suggest: (p) => "a".repeat(p + 1) + "b".repeat(p),
    explanation:
      "With s = aᵖ⁺¹bᵖ, y is all a's. Pumping UP keeps n > m, so pump DOWN: i = 0 removes at least one a, leaving n ≤ m.",
  },
  {
    id: "squares",
    name: "{ aⁿ | n is a perfect square }",
    alphabet: ["a"],
    regular: false,
    contains: (w) => only(w, ["a"]) && Number.isInteger(Math.sqrt(w.length)),
    suggest: (p) => "a".repeat(p * p),
    explanation:
      "With s = a^(p²) and 1 ≤ |y| ≤ p, pumping once (i = 2) gives a length strictly between p² and (p+1)², so it is not a square.",
  },
  {
    id: "primes",
    name: "{ aⁿ | n is prime }",
    alphabet: ["a"],
    regular: false,
    contains: (w) => only(w, ["a"]) && isPrime(w.length),
    suggest: (p) => {
      let q = Math.max(p + 2, 2);
      while (!isPrime(q)) q++;
      return "a".repeat(q);
    },
    maxI: (s) => s.length + 1,
    explanation:
      "With s = a^q for a prime q ≥ p + 2, choose i = q + 1: the length becomes q + q·|y| = q(1 + |y|), which is not prime. Often a smaller i already works.",
  },
  {
    id: "balanced",
    name: "{ w | w is balanced parentheses }",
    alphabet: ["(", ")"],
    regular: false,
    contains: (w) => {
      let depth = 0;
      for (const c of w) {
        if (c === "(") depth++;
        else if (c === ")") depth--;
        else return false;
        if (depth < 0) return false;
      }
      return depth === 0;
    },
    suggest: (p) => "(".repeat(p) + ")".repeat(p),
    explanation: "With s = (ᵖ)ᵖ, y is all opening parentheses, so pumping unbalances the string.",
  },
  {
    id: "01star",
    name: "(01)*  — regular, for contrast",
    alphabet: ["0", "1"],
    regular: true,
    contains: (w) => /^(01)*$/.test(w),
    suggest: (p) => "01".repeat(Math.max(1, p)),
    explanation:
      "This language IS regular, so no string can make every split fail: y = 01 always pumps. Finding a split that pumps never proves a language is regular, though — the lemma only works in one direction.",
  },
];

// ---------------------------------------------------------------------------
// The lemma on a concrete DFA.

export interface Decomposition extends Split {
  /** Pumping length used: the number of states of the DFA. */
  p: number;
  /** States visited while reading s (run[k] = state after k symbols). */
  run: string[];
  /** The state that repeats: reading y loops from it back to itself. */
  loopState: string;
}

function step(dfa: Automaton, state: string, symbol: string): string | null {
  return dfa.transitions.find((t) => t.from === state && t.symbol === symbol)?.to ?? null;
}

function accepted(dfa: Automaton, s: string): { ok: boolean; run: string[] } {
  if (dfa.start === null) return { ok: false, run: [] };
  const run = [dfa.start];
  for (const c of s) {
    const nxt = step(dfa, run[run.length - 1], c);
    if (nxt === null) return { ok: false, run };
    run.push(nxt);
  }
  return { ok: dfa.accepting.includes(run[run.length - 1]), run };
}

/**
 * The split the pumping lemma promises for an accepted string s with
 * |s| ≥ p = number of states. By the pigeonhole principle some state repeats
 * among the first p + 1 states of the run; y is the input read between the
 * two visits. Returns null if s is rejected or shorter than p.
 */
export function pumpingDecomposition(dfa: Automaton, s: string): Decomposition | null {
  if (dfa.type !== "DFA" || dfa.transitions.some((t) => t.symbol === EPSILON)) return null;
  const p = dfa.states.length;
  const chars = [...s];
  if (chars.length < p) return null;
  const { ok, run } = accepted(dfa, s);
  if (!ok) return null;
  const firstSeen = new Map<string, number>();
  for (let j = 0; j <= p; j++) {
    const i = firstSeen.get(run[j]);
    if (i !== undefined) {
      return {
        x: chars.slice(0, i).join(""),
        y: chars.slice(i, j).join(""),
        z: chars.slice(j).join(""),
        p,
        run,
        loopState: run[j],
      };
    }
    firstSeen.set(run[j], j);
  }
  return null; // unreachable: p + 1 run positions over p states must repeat
}

/**
 * Up to `limit` accepted strings with length ≥ p (shortest, then alphabetical).
 * If the language has any, one exists with length < 2p, so that is the search bound.
 * An empty result means the language is finite.
 */
export function suggestPumpableStrings(dfa: Automaton, limit = 6): string[] {
  const p = dfa.states.length;
  if (dfa.start === null || p === 0) return [];
  const alphabet = [...dfa.alphabet].sort();
  const accepting = new Set(dfa.accepting);
  const maxLen = 2 * p - 1;

  // canFinish[k] = states from which an accepting state is reachable in exactly k steps.
  const canFinish: Set<string>[] = [new Set(accepting)];
  for (let k = 1; k <= maxLen; k++) {
    const prev = canFinish[k - 1];
    canFinish.push(
      new Set(
        dfa.states
          .map((s) => s.id)
          .filter((s) => alphabet.some((a) => {
            const n = step(dfa, s, a);
            return n !== null && prev.has(n);
          })),
      ),
    );
  }

  const out: string[] = [];
  for (let len = p; len <= maxLen && out.length < limit; len++) {
    const dfs = (state: string, prefix: string, remaining: number) => {
      if (out.length >= limit) return;
      if (remaining === 0) {
        out.push(prefix);
        return;
      }
      for (const a of alphabet) {
        const n = step(dfa, state, a);
        if (n !== null && canFinish[remaining - 1].has(n)) dfs(n, prefix + a, remaining - 1);
      }
    };
    if (canFinish[len].has(dfa.start)) dfs(dfa.start, "", len);
  }
  return out;
}
