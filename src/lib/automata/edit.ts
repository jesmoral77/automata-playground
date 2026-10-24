// Pure editing operations. Each returns a new Automaton and never mutates.

import { Automaton, EPSILON, Transition } from "./types";

/** Next unused name of the form q0, q1, q2, ... */
export function nextStateName(m: Automaton): string {
  const used = new Set(m.states.flatMap((s) => [s.id, s.label]));
  let i = 0;
  while (used.has(`q${i}`)) i++;
  return `q${i}`;
}

export function addState(m: Automaton, x?: number, y?: number): Automaton {
  const name = nextStateName(m);
  const states = [...m.states, { id: name, label: name, x, y }];
  // The first state becomes the start state automatically.
  return { ...m, states, start: m.start ?? name };
}

export function removeState(m: Automaton, id: string): Automaton {
  return {
    ...m,
    states: m.states.filter((s) => s.id !== id),
    start: m.start === id ? null : m.start,
    accepting: m.accepting.filter((a) => a !== id),
    transitions: m.transitions.filter((t) => t.from !== id && t.to !== id),
  };
}

export function renameState(m: Automaton, id: string, label: string): Automaton {
  return { ...m, states: m.states.map((s) => (s.id === id ? { ...s, label } : s)) };
}

export function moveState(m: Automaton, id: string, x: number, y: number): Automaton {
  return { ...m, states: m.states.map((s) => (s.id === id ? { ...s, x, y } : s)) };
}

export function setStart(m: Automaton, id: string | null): Automaton {
  return { ...m, start: id };
}

export function toggleAccepting(m: Automaton, id: string): Automaton {
  const accepting = m.accepting.includes(id)
    ? m.accepting.filter((a) => a !== id)
    : [...m.accepting, id];
  return { ...m, accepting };
}

/**
 * Parse a user-typed symbol list like "a, b" or "0,1,ε" into symbols.
 * "ε", "eps", "epsilon" and "λ" all mean epsilon.
 */
export function parseSymbols(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const s = raw.trim();
    if (!s) continue;
    const sym = ["ε", "eps", "epsilon", "λ"].includes(s.toLowerCase()) ? EPSILON : s;
    if (!out.includes(sym)) out.push(sym);
  }
  return out;
}

function sameTransition(a: Transition, b: Transition) {
  return a.from === b.from && a.to === b.to && a.symbol === b.symbol;
}

/** Add transitions from -> to on each symbol; new symbols join the alphabet. */
export function addTransitions(
  m: Automaton,
  from: string,
  to: string,
  symbols: string[],
): Automaton {
  const transitions = [...m.transitions];
  const alphabet = [...m.alphabet];
  for (const symbol of symbols) {
    const t = { from, to, symbol };
    if (!transitions.some((u) => sameTransition(u, t))) transitions.push(t);
    if (symbol !== EPSILON && !alphabet.includes(symbol)) alphabet.push(symbol);
  }
  return { ...m, transitions, alphabet };
}

/** Replace every transition from -> to with the given symbols (edge relabel). */
export function setEdgeSymbols(
  m: Automaton,
  from: string,
  to: string,
  symbols: string[],
): Automaton {
  const without = {
    ...m,
    transitions: m.transitions.filter((t) => !(t.from === from && t.to === to)),
  };
  return addTransitions(without, from, to, symbols);
}

export function removeEdge(m: Automaton, from: string, to: string): Automaton {
  return setEdgeSymbols(m, from, to, []);
}

export function setAlphabet(m: Automaton, symbols: string[]): Automaton {
  return { ...m, alphabet: symbols.filter((s) => s !== EPSILON) };
}

/** Group transitions by (from, to) for drawing one labelled edge per pair. */
export function groupEdges(m: Automaton): { from: string; to: string; symbols: string[] }[] {
  const map = new Map<string, { from: string; to: string; symbols: string[] }>();
  for (const t of m.transitions) {
    const key = `${t.from}\u0000${t.to}`;
    const e = map.get(key) ?? { from: t.from, to: t.to, symbols: [] };
    if (!e.symbols.includes(t.symbol)) e.symbols.push(t.symbol);
    map.set(key, e);
  }
  return [...map.values()];
}

export function stateLabel(m: Automaton, id: string): string {
  return m.states.find((s) => s.id === id)?.label ?? id;
}
