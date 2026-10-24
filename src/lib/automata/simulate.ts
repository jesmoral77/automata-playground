import { Automaton, EPSILON, Transition } from "./types";

/** Sort state ids into the order they appear in the machine (stable, readable). */
export function orderStates(m: Automaton, ids: Iterable<string>): string[] {
  const set = new Set(ids);
  const ordered = m.states.map((s) => s.id).filter((id) => set.has(id));
  // Include unknown ids too (should not happen for valid machines).
  for (const id of set) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}

/** All states reachable from `ids` using only ε-transitions (including `ids`). */
export function epsilonClosure(m: Automaton, ids: Iterable<string>): string[] {
  const seen = new Set(ids);
  const stack = [...seen];
  while (stack.length) {
    const s = stack.pop()!;
    for (const t of m.transitions) {
      if (t.from === s && t.symbol === EPSILON && !seen.has(t.to)) {
        seen.add(t.to);
        stack.push(t.to);
      }
    }
  }
  return orderStates(m, seen);
}

/** States reachable from `ids` by reading exactly `symbol` (no closure). */
export function move(m: Automaton, ids: Iterable<string>, symbol: string): string[] {
  const from = new Set(ids);
  const out = new Set<string>();
  for (const t of m.transitions) if (from.has(t.from) && t.symbol === symbol) out.add(t.to);
  return orderStates(m, out);
}

export interface SimStep {
  /** Number of symbols consumed so far (0 = before reading anything). */
  position: number;
  /** The symbol read to reach this step (null for the initial step). */
  symbol: string | null;
  /** Active states after reading `symbol` and taking ε-closure. */
  active: string[];
  /** Transitions taken on `symbol` to get here (not including ε-moves). */
  taken: Transition[];
}

export interface SimResult {
  accepted: boolean;
  steps: SimStep[];
  /** Why the run ended without acceptance, when there is a specific reason. */
  reason?: string;
}

/**
 * Run the machine on `input`, one character per symbol.
 * Works for both DFAs and NFAs (a DFA is just an NFA with one active state).
 */
export function simulate(m: Automaton, input: string): SimResult {
  if (m.start === null) {
    return { accepted: false, steps: [], reason: "No start state is set." };
  }
  let active = epsilonClosure(m, [m.start]);
  const steps: SimStep[] = [{ position: 0, symbol: null, active, taken: [] }];
  let reason: string | undefined;

  const symbols = [...input];
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const current = new Set(active);
    const taken = m.transitions.filter((t) => current.has(t.from) && t.symbol === symbol);
    active = epsilonClosure(m, taken.map((t) => t.to));
    steps.push({ position: i + 1, symbol, active, taken });
    if (active.length === 0 && reason === undefined) {
      reason = m.alphabet.includes(symbol)
        ? `No transition available on "${symbol}" at position ${i + 1}; the machine is stuck.`
        : `"${symbol}" is not in the alphabet.`;
    }
  }

  const accepting = new Set(m.accepting);
  const accepted = active.some((s) => accepting.has(s));
  if (!accepted && reason === undefined) {
    reason = "The input ended in no accepting state.";
  }
  return { accepted, steps, reason: accepted ? undefined : reason };
}

export function accepts(m: Automaton, input: string): boolean {
  return simulate(m, input).accepted;
}
