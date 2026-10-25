// Seeded, reproducible generation of random NFAs and input strings.
// A case is fully determined by (seed, strategy, index).

export const EPS = "ε";

/** mulberry32: small, fast, deterministic 32-bit PRNG. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T,>(xs: T[]): T => xs[Math.floor(next() * xs.length)],
  };
}
export type Rng = ReturnType<typeof rng>;

/** Derive an independent sub-seed for case `index` of a run. */
export function caseSeed(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

export interface Strategy {
  name: string;
  description: string;
  states: [number, number];
  alphabetSize: [number, number];
  /** Expected number of targets per (state, symbol). */
  density: number;
  /** Probability that each state gets an ε-transition (rolled per state, up to 2). */
  epsilonRate: number;
  /** Probability that a state is accepting (-1: all-or-nothing, decided per case). */
  acceptRate: number;
  /** Generate DFA-shaped machines (≤1 target per (state, symbol), no ε). */
  dfaShaped?: boolean;
  /** Max length of random test strings. */
  maxStringLength: number;
  /** Chance that a test string contains a symbol outside the alphabet. */
  foreignSymbolRate: number;
}

export const STRATEGIES: Strategy[] = [
  { name: "baseline", description: "1-5 states over {a,b}, moderate density, some ε", states: [1, 5], alphabetSize: [2, 2], density: 0.8, epsilonRate: 0.15, acceptRate: 0.3, maxStringLength: 8, foreignSymbolRate: 0.02 },
  { name: "wide-alphabet", description: "4-6 symbols", states: [1, 5], alphabetSize: [4, 6], density: 0.6, epsilonRate: 0.1, acceptRate: 0.3, maxStringLength: 7, foreignSymbolRate: 0.02 },
  { name: "epsilon-heavy", description: "many ε-transitions, including ε-cycles", states: [2, 6], alphabetSize: [1, 2], density: 0.5, epsilonRate: 0.6, acceptRate: 0.25, maxStringLength: 8, foreignSymbolRate: 0.02 },
  { name: "edge-cases", description: "1-2 states, all/no accepting states, empty strings, foreign symbols", states: [1, 2], alphabetSize: [1, 2], density: 0.9, epsilonRate: 0.3, acceptRate: -1, maxStringLength: 4, foreignSymbolRate: 0.15 },
  { name: "dense", description: "about 2 targets per (state, symbol)", states: [3, 6], alphabetSize: [2, 3], density: 2.0, epsilonRate: 0.2, acceptRate: 0.3, maxStringLength: 8, foreignSymbolRate: 0.02 },
  { name: "sparse", description: "few transitions, many dead ends and unreachable states", states: [3, 7], alphabetSize: [2, 3], density: 0.3, epsilonRate: 0.05, acceptRate: 0.3, maxStringLength: 8, foreignSymbolRate: 0.02 },
  { name: "dfa-partial", description: "DFA-shaped machines with missing transitions (exercises the dead state)", states: [1, 6], alphabetSize: [1, 3], density: 0.7, epsilonRate: 0, acceptRate: 0.35, dfaShaped: true, maxStringLength: 8, foreignSymbolRate: 0.05 },
  { name: "large", description: "7-9 states, larger subset constructions", states: [7, 9], alphabetSize: [2, 2], density: 0.7, epsilonRate: 0.15, acceptRate: 0.3, maxStringLength: 10, foreignSymbolRate: 0.01 },
];

export function strategyByName(name: string): Strategy {
  const s = STRATEGIES.find((x) => x.name === name);
  if (!s) throw new Error(`Unknown strategy "${name}". Known: ${STRATEGIES.map((x) => x.name).join(", ")}`);
  return s;
}

export interface Machine {
  type: "DFA" | "NFA";
  states: { id: string; label: string }[];
  alphabet: string[];
  start: string | null;
  accepting: string[];
  transitions: { from: string; to: string; symbol: string }[];
}

export interface FuzzCase {
  machine: Machine;
  strings: string[];
}

const SYMBOL_POOL = ["a", "b", "c", "d", "e", "f"];

export function generateCase(strategy: Strategy, seed: number): FuzzCase {
  const r = rng(seed);
  const n = r.int(...strategy.states);
  const k = r.int(...strategy.alphabetSize);
  const alphabet = r.chance(0.5) && k <= 2 ? ["0", "1"].slice(0, k) : SYMBOL_POOL.slice(0, k);
  const ids = Array.from({ length: n }, (_, i) => `q${i}`);
  const transitions: Machine["transitions"] = [];
  const add = (from: string, to: string, symbol: string) => {
    if (!transitions.some((t) => t.from === from && t.to === to && t.symbol === symbol)) {
      transitions.push({ from, to, symbol });
    }
  };

  for (const from of ids) {
    for (const symbol of alphabet) {
      if (strategy.dfaShaped) {
        if (r.chance(strategy.density)) add(from, r.pick(ids), symbol);
      } else {
        // Poisson-ish number of targets with mean `density`.
        let targets = 0;
        while (r.chance(strategy.density / (strategy.density + 1))) targets++;
        for (let i = 0; i < targets; i++) add(from, r.pick(ids), symbol);
      }
    }
    if (!strategy.dfaShaped) {
      for (let i = 0; i < 2; i++) if (r.chance(strategy.epsilonRate)) add(from, r.pick(ids), EPS);
    }
  }

  const accepting =
    strategy.acceptRate < 0
      ? r.pick([[], ids, ids.filter(() => r.chance(0.5))])
      : ids.filter(() => r.chance(strategy.acceptRate));
  const machine: Machine = {
    type: strategy.dfaShaped ? "DFA" : "NFA",
    states: ids.map((id) => ({ id, label: id })),
    alphabet,
    start: r.pick(ids),
    accepting,
    transitions,
  };

  const strings = [""];
  for (let i = 0; i < 6; i++) {
    const len = r.int(0, strategy.maxStringLength);
    let w = "";
    for (let j = 0; j < len; j++) w += r.chance(strategy.foreignSymbolRate) ? "z" : r.pick(alphabet);
    strings.push(w);
  }
  return { machine, strings };
}

/** Every string over `alphabet` up to the longest length that keeps the total ≤ `budget`. */
export function exhaustiveStrings(alphabet: string[], budget = 300): string[] {
  const out = [""];
  if (alphabet.length === 0) return out;
  let layer = [""];
  while (out.length + layer.length * alphabet.length <= budget) {
    layer = layer.flatMap((w) => alphabet.map((a) => w + a));
    out.push(...layer);
  }
  return out;
}
