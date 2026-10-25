// Independent brute-force reference for the fuzz audit.
//
// RULE: nothing in fuzz/reference may import from src/ (enforced by ESLint).
// It works on the plain JSON machine format and deliberately uses different
// algorithms from the app:
//   - acceptance: depth-first search over (state, position) pairs, not
//     set-based ε-closure stepping;
//   - language equality: on-the-fly product of the two determinized machines,
//     returning a counterexample string;
//   - minimal DFA size: Brzozowski's algorithm (reverse, determinize, twice),
//     not table-filling.

export const EPS = "ε";

export interface RefMachine {
  type: string;
  states: { id: string }[];
  alphabet: string[];
  start: string | null;
  accepting: string[];
  transitions: { from: string; to: string; symbol: string }[];
}

/** Thrown when a reference computation would exceed its size budget. */
export class RefLimitError extends Error {}

const LIMIT = 20000;

// ---------------------------------------------------------------- acceptance

/** Does `m` accept `w`? Iterative DFS over (state, consumed) with a visited set. */
export function refAccepts(m: RefMachine, w: string): boolean {
  if (m.start === null) return false;
  const input = Array.from(w);
  const accepting = new Set(m.accepting);
  const out = new Map<string, { to: string; symbol: string }[]>();
  for (const t of m.transitions) {
    if (!out.has(t.from)) out.set(t.from, []);
    out.get(t.from)!.push(t);
  }
  const seen = new Set<string>();
  const stack: [string, number][] = [[m.start, 0]];
  while (stack.length > 0) {
    const [state, pos] = stack.pop()!;
    const key = state + "\u0001" + pos;
    if (seen.has(key)) continue;
    seen.add(key);
    if (pos === input.length && accepting.has(state)) return true;
    for (const t of out.get(state) ?? []) {
      if (t.symbol === EPS) stack.push([t.to, pos]);
      else if (pos < input.length && t.symbol === input[pos]) stack.push([t.to, pos + 1]);
    }
  }
  return false;
}

// ------------------------------------------------------------ DFA structure

/** Problems that stop `m` from being a complete, deterministic DFA over its alphabet. */
export function refDfaProblems(m: RefMachine): string[] {
  const problems: string[] = [];
  const ids = new Set(m.states.map((s) => s.id));
  if (m.start === null || !ids.has(m.start)) problems.push("missing or unknown start state");
  for (const a of m.accepting) if (!ids.has(a)) problems.push(`unknown accepting state ${a}`);
  const count = new Map<string, number>();
  for (const t of m.transitions) {
    if (t.symbol === EPS) problems.push(`ε-transition from ${t.from}`);
    if (!ids.has(t.from) || !ids.has(t.to)) problems.push(`transition references unknown state`);
    if (!m.alphabet.includes(t.symbol) && t.symbol !== EPS) problems.push(`symbol ${t.symbol} not in alphabet`);
    const k = t.from + "\u0001" + t.symbol;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  for (const s of ids) {
    for (const a of m.alphabet) {
      const n = count.get(s + "\u0001" + a) ?? 0;
      if (n !== 1) problems.push(`state ${s} has ${n} transitions on ${a}`);
    }
  }
  return problems;
}

// ------------------------------------------------------- subset machinery

/** Minimal NFA view used by the determinizers below. */
interface Nfa {
  starts: string[];
  accepting: Set<string>;
  /** state -> symbol -> targets (symbol EPS for ε) */
  delta: Map<string, Map<string, string[]>>;
}

function toNfa(m: RefMachine): Nfa {
  const delta = new Map<string, Map<string, string[]>>();
  for (const t of m.transitions) {
    if (!delta.has(t.from)) delta.set(t.from, new Map());
    const row = delta.get(t.from)!;
    if (!row.has(t.symbol)) row.set(t.symbol, []);
    row.get(t.symbol)!.push(t.to);
  }
  return { starts: m.start === null ? [] : [m.start], accepting: new Set(m.accepting), delta };
}

function closure(n: Nfa, states: Iterable<string>): string[] {
  const seen = new Set<string>(states);
  const todo = [...seen];
  while (todo.length) {
    const s = todo.pop()!;
    for (const t of n.delta.get(s)?.get(EPS) ?? []) {
      if (!seen.has(t)) {
        seen.add(t);
        todo.push(t);
      }
    }
  }
  return [...seen].sort();
}

function step(n: Nfa, states: string[], symbol: string): string[] {
  const next: string[] = [];
  for (const s of states) for (const t of n.delta.get(s)?.get(symbol) ?? []) next.push(t);
  return closure(n, next);
}

const keyOf = (set: string[]) => set.join("\u0002");

// ------------------------------------------------------- language equality

/**
 * Shortest string accepted by exactly one of `a`, `b` (both may be NFAs),
 * or null if they accept the same language. Symbols outside both alphabets
 * are never accepted by either machine, so the union alphabet suffices.
 */
export function refCounterexample(a: RefMachine, b: RefMachine): string | null {
  const na = toNfa(a);
  const nb = toNfa(b);
  const alphabet = [...new Set([...a.alphabet, ...b.alphabet])].filter((x) => x !== EPS).sort();
  const accepts = (n: Nfa, set: string[]) => set.some((s) => n.accepting.has(s));
  const start: [string[], string[]] = [closure(na, na.starts), closure(nb, nb.starts)];
  const seen = new Map<string, string>([[keyOf(start[0]) + "|" + keyOf(start[1]), ""]]);
  const queue: { pair: [string[], string[]]; word: string }[] = [{ pair: start, word: "" }];
  for (let i = 0; i < queue.length; i++) {
    const { pair, word } = queue[i];
    if (accepts(na, pair[0]) !== accepts(nb, pair[1])) return word;
    for (const sym of alphabet) {
      const next: [string[], string[]] = [step(na, pair[0], sym), step(nb, pair[1], sym)];
      const k = keyOf(next[0]) + "|" + keyOf(next[1]);
      if (seen.has(k)) continue;
      if (seen.size > LIMIT) throw new RefLimitError("product exploration too large");
      seen.set(k, word + sym);
      queue.push({ pair: next, word: word + sym });
    }
  }
  return null;
}

// ------------------------------------------------------- minimal DFA size

interface Dfa {
  states: string[];
  start: string;
  accepting: Set<string>;
  delta: Map<string, Map<string, string>>;
}

/** Subset construction over reachable subsets, keeping ∅ as a real (dead) state. */
function determinize(n: Nfa, alphabet: string[]): Dfa {
  const start = closure(n, n.starts);
  const ids = new Map<string, string>([[keyOf(start), "S0"]]);
  const sets: string[][] = [start];
  const delta = new Map<string, Map<string, string>>();
  for (let i = 0; i < sets.length; i++) {
    const id = `S${i}`;
    const row = new Map<string, string>();
    for (const sym of alphabet) {
      const next = step(n, sets[i], sym);
      const k = keyOf(next);
      if (!ids.has(k)) {
        if (sets.length >= LIMIT) throw new RefLimitError("determinization too large");
        ids.set(k, `S${sets.length}`);
        sets.push(next);
      }
      row.set(sym, ids.get(k)!);
    }
    delta.set(id, row);
  }
  const accepting = new Set(sets.flatMap((set, i) => (set.some((s) => n.accepting.has(s)) ? [`S${i}`] : [])));
  return { states: sets.map((_, i) => `S${i}`), start: "S0", accepting, delta };
}

function reverse(d: Dfa): Nfa {
  const delta = new Map<string, Map<string, string[]>>();
  for (const [from, row] of d.delta) {
    for (const [sym, to] of row) {
      if (!delta.has(to)) delta.set(to, new Map());
      const r = delta.get(to)!;
      if (!r.has(sym)) r.set(sym, []);
      r.get(sym)!.push(from);
    }
  }
  return { starts: [...d.accepting], accepting: new Set([d.start]), delta };
}

/**
 * Number of states in the minimal complete DFA for L(m), via Brzozowski:
 * determinize(reverse(determinize(reverse(m)))). The first reversal is done on
 * the determinized machine so every step is a plain subset construction.
 */
export function refMinimalStateCount(m: RefMachine): number {
  const alphabet = m.alphabet.filter((x) => x !== EPS);
  const d1 = determinize(toNfa(m), alphabet);
  const d2 = determinize(reverse(d1), alphabet);
  const d3 = determinize(reverse(d2), alphabet);
  return d3.states.length;
}
