// NFA -> DFA via subset construction, recording every step for display.

import { stateLabel } from "./edit";
import { epsilonClosure, move } from "./simulate";
import { Automaton, Transition } from "./types";

/** One row of the subset-construction table. */
export interface SubsetRow {
  /** Id of the DFA state (D0, D1, ...). */
  id: string;
  /** The NFA states this DFA state stands for. */
  nfaStates: string[];
  /** Display name like "{q0,q1}" or "∅". */
  name: string;
  isStart: boolean;
  isAccepting: boolean;
  /** symbol -> target DFA state id */
  transitions: Record<string, string>;
}

export type SubsetStep =
  | {
      kind: "start";
      /** ε-closure of the NFA start state. */
      closure: string[];
      dfaState: string;
    }
  | {
      kind: "transition";
      fromDfaState: string;
      symbol: string;
      /** move(S, symbol) before closure */
      moved: string[];
      /** ε-closure(move(S, symbol)) */
      closure: string[];
      toDfaState: string;
      /** True if this set had not been seen before (a new DFA state was created). */
      isNew: boolean;
    };

export interface SubsetResult {
  dfa: Automaton;
  rows: SubsetRow[];
  steps: SubsetStep[];
}

/** Display name for a set of NFA states, e.g. "{q0,q2}" or "∅". */
export function setName(nfa: Automaton, ids: string[]): string {
  if (ids.length === 0) return "∅";
  return `{${ids.map((id) => stateLabel(nfa, id)).join(",")}}`;
}

/**
 * Subset construction. Only reachable subsets are built. The empty set is
 * included as a dead state when some transition leads to it, so the result is
 * always a complete DFA over the NFA's alphabet.
 */
export function subsetConstruction(nfa: Automaton): SubsetResult {
  const rows: SubsetRow[] = [];
  const steps: SubsetStep[] = [];
  const byKey = new Map<string, SubsetRow>();
  const accepting = new Set(nfa.accepting);

  const getOrCreate = (ids: string[]): { row: SubsetRow; isNew: boolean } => {
    const key = ids.join("\u0000");
    const existing = byKey.get(key);
    if (existing) return { row: existing, isNew: false };
    const row: SubsetRow = {
      id: `D${rows.length}`,
      nfaStates: ids,
      name: setName(nfa, ids),
      isStart: rows.length === 0,
      isAccepting: ids.some((s) => accepting.has(s)),
      transitions: {},
    };
    rows.push(row);
    byKey.set(key, row);
    return { row, isNew: true };
  };

  if (nfa.start === null) {
    return { dfa: { type: "DFA", states: [], alphabet: [...nfa.alphabet], start: null, accepting: [], transitions: [] }, rows, steps };
  }

  const startClosure = epsilonClosure(nfa, [nfa.start]);
  const start = getOrCreate(startClosure).row;
  steps.push({ kind: "start", closure: startClosure, dfaState: start.id });

  // Rows are processed in creation order (a FIFO worklist).
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const symbol of nfa.alphabet) {
      const moved = move(nfa, row.nfaStates, symbol);
      const closure = epsilonClosure(nfa, moved);
      const { row: target, isNew } = getOrCreate(closure);
      row.transitions[symbol] = target.id;
      steps.push({
        kind: "transition",
        fromDfaState: row.id,
        symbol,
        moved,
        closure,
        toDfaState: target.id,
        isNew,
      });
    }
  }

  const transitions: Transition[] = rows.flatMap((r) =>
    nfa.alphabet.map((symbol) => ({ from: r.id, to: r.transitions[symbol], symbol })),
  );
  const dfa: Automaton = {
    type: "DFA",
    states: rows.map((r) => ({ id: r.id, label: r.name })),
    alphabet: [...nfa.alphabet],
    start: start.id,
    accepting: rows.filter((r) => r.isAccepting).map((r) => r.id),
    transitions,
  };
  return { dfa, rows, steps };
}
