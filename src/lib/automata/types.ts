// Core data model. Plain JSON so the same shape is used by the UI, the
// database, and the tests.

export type MachineType = "DFA" | "NFA";

/** The symbol used for epsilon (empty-string) transitions. */
export const EPSILON = "ε";

export interface State {
  id: string;
  label: string;
  /** Diagram position. Optional: generated machines are auto-laid-out. */
  x?: number;
  y?: number;
}

/** One transition on one symbol. An edge labelled "a, b" is two transitions. */
export interface Transition {
  from: string;
  to: string;
  symbol: string;
}

export interface Automaton {
  type: MachineType;
  states: State[];
  /** Input alphabet (never contains EPSILON). */
  alphabet: string[];
  start: string | null;
  accepting: string[];
  transitions: Transition[];
}

export function emptyAutomaton(type: MachineType = "DFA"): Automaton {
  return { type, states: [], alphabet: [], start: null, accepting: [], transitions: [] };
}
