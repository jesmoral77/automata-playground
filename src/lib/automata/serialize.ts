// Parsing untrusted JSON (from the database, an API request, or a file)
// into an Automaton. Throws ParseError with a readable message on bad input.

import { Automaton, State, Transition } from "./types";

export class ParseError extends Error {}

const MAX_STATES = 200;
const MAX_TRANSITIONS = 2000;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, what: string, max = 64): string {
  if (typeof v !== "string") throw new ParseError(`${what} must be a string.`);
  if (v.length > max) throw new ParseError(`${what} is too long.`);
  return v;
}

function strArray(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new ParseError(`${what} must be an array.`);
  return v.map((x, i) => str(x, `${what}[${i}]`));
}

function optNumber(v: unknown, what: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ParseError(`${what} must be a number.`);
  return v;
}

export function parseAutomaton(input: unknown): Automaton {
  if (!isObject(input)) throw new ParseError("Machine must be an object.");
  const type = input.type;
  if (type !== "DFA" && type !== "NFA") throw new ParseError('type must be "DFA" or "NFA".');

  if (!Array.isArray(input.states)) throw new ParseError("states must be an array.");
  if (input.states.length > MAX_STATES) throw new ParseError(`At most ${MAX_STATES} states are allowed.`);
  const states: State[] = input.states.map((s, i) => {
    if (!isObject(s)) throw new ParseError(`states[${i}] must be an object.`);
    const state: State = { id: str(s.id, `states[${i}].id`), label: str(s.label, `states[${i}].label`) };
    const x = optNumber(s.x, `states[${i}].x`);
    const y = optNumber(s.y, `states[${i}].y`);
    if (x !== undefined) state.x = x;
    if (y !== undefined) state.y = y;
    return state;
  });

  if (!Array.isArray(input.transitions)) throw new ParseError("transitions must be an array.");
  if (input.transitions.length > MAX_TRANSITIONS) {
    throw new ParseError(`At most ${MAX_TRANSITIONS} transitions are allowed.`);
  }
  const transitions: Transition[] = input.transitions.map((t, i) => {
    if (!isObject(t)) throw new ParseError(`transitions[${i}] must be an object.`);
    return {
      from: str(t.from, `transitions[${i}].from`),
      to: str(t.to, `transitions[${i}].to`),
      symbol: str(t.symbol, `transitions[${i}].symbol`, 8),
    };
  });

  const start = input.start === null ? null : str(input.start, "start");
  return {
    type,
    states,
    alphabet: strArray(input.alphabet, "alphabet"),
    start,
    accepting: strArray(input.accepting, "accepting"),
    transitions,
  };
}
