// Helpers shared by the test files (not used by the app).

import fc from "fast-check";
import { Automaton, EPSILON, MachineType } from "./types";

/** Random machine over {a, b} with 1-5 states. NFAs may include ε-transitions. */
export function arbAutomaton(type: MachineType): fc.Arbitrary<Automaton> {
  return fc.integer({ min: 1, max: 5 }).chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `q${i}`);
    const state = fc.constantFrom(...ids);
    const symbols = type === "NFA" ? ["a", "b", EPSILON] : ["a", "b"];
    const transitions =
      type === "NFA"
        ? fc.uniqueArray(
            fc.record({ from: state, to: state, symbol: fc.constantFrom(...symbols) }),
            { maxLength: 12, selector: (t) => `${t.from}|${t.to}|${t.symbol}` },
          )
        : // DFA: for each (state, symbol) pick a target or leave it missing.
          fc
            .array(fc.option(state, { nil: undefined }), { minLength: n * 2, maxLength: n * 2 })
            .map((targets) =>
              targets.flatMap((to, i) =>
                to === undefined ? [] : [{ from: ids[Math.floor(i / 2)], to, symbol: ["a", "b"][i % 2] }],
              ),
            );
    return fc.record({
      type: fc.constant(type),
      states: fc.constant(ids.map((id) => ({ id, label: id }))),
      alphabet: fc.constant(["a", "b"]),
      start: state,
      accepting: fc.subarray(ids),
      transitions,
    });
  });
}

export const arbInput = fc.string({ unit: fc.constantFrom("a", "b"), maxLength: 8 });

/**
 * Independent reference implementation of NFA acceptance (depth-first search
 * over (state, position) pairs). Deliberately written differently from
 * simulate() so the two can check each other.
 */
export function referenceAccepts(m: Automaton, input: string): boolean {
  if (m.start === null) return false;
  const seen = new Set<string>();
  const visit = (state: string, pos: number): boolean => {
    const key = `${state}@${pos}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (pos === input.length && m.accepting.includes(state)) return true;
    for (const t of m.transitions) {
      if (t.from !== state) continue;
      if (t.symbol === EPSILON && visit(t.to, pos)) return true;
      if (pos < input.length && t.symbol === input[pos] && visit(t.to, pos + 1)) return true;
    }
    return false;
  };
  return visit(m.start, 0);
}

/** All strings over `alphabet` of length 0..maxLen. */
export function allStrings(alphabet: string[], maxLen: number): string[] {
  const out = [""];
  let layer = [""];
  for (let len = 1; len <= maxLen; len++) {
    layer = layer.flatMap((w) => alphabet.map((a) => w + a));
    out.push(...layer);
  }
  return out;
}
