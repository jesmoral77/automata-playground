import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { minimizeDfa, pairKey } from "./minimize";
import { accepts } from "./simulate";
import { subsetConstruction } from "./subset";
import { allStrings, arbAutomaton } from "./test-utils";
import { Automaton } from "./types";
import { hasErrors, validate } from "./validate";

const example = (name: string) => EXAMPLES.find((e) => e.name === name)!.machine;
const t = (from: string, to: string, symbol: string) => ({ from, to, symbol });
const states = (...ids: string[]) => ids.map((id) => ({ id, label: id }));

/** "Even number of 0s" with every state duplicated, plus an unreachable state U. */
const redundant: Automaton = {
  type: "DFA",
  states: states("A", "B", "C", "D", "U"),
  alphabet: ["0", "1"],
  start: "A",
  accepting: ["A", "C", "U"],
  transitions: [
    t("A", "B", "0"), t("A", "C", "1"),
    t("B", "C", "0"), t("B", "D", "1"),
    t("C", "D", "0"), t("C", "A", "1"),
    t("D", "A", "0"), t("D", "B", "1"),
    t("U", "A", "0"), t("U", "A", "1"),
  ],
};

/** Every string up to length 6 gets the same answer from both machines. */
function sameLanguage(a: Automaton, b: Automaton) {
  for (const w of allStrings(a.alphabet, 6)) expect(accepts(b, w), `input "${w}"`).toBe(accepts(a, w));
}

describe("minimizeDfa on examples", () => {
  it("merges duplicated states and drops unreachable ones", () => {
    const r = minimizeDfa(redundant);
    expect(r.removedUnreachable).toEqual(["U"]);
    expect(r.addedDeadState).toBeNull();
    expect(r.classes).toEqual([["A", "C"], ["B", "D"]]);
    expect(r.minimized.states.map((s) => s.label)).toEqual(["{A,C}", "{B,D}"]);
    expect(r.alreadyMinimal).toBe(false);
    sameLanguage(redundant, r.minimized);
  });

  it("records round 0 marks with the empty witness", () => {
    const r = minimizeDfa(redundant);
    expect(r.rounds[0]).toHaveLength(4); // {A,C} x {B,D}
    expect(r.marks[pairKey(r.prepared, "A", "B")]).toMatchObject({ round: 0, witness: "" });
    expect(r.marks[pairKey(r.prepared, "A", "C")]).toBeUndefined();
  });

  it("leaves minimal DFAs alone", () => {
    for (const name of ["Even number of 0s", "Binary divisible by 3"]) {
      const r = minimizeDfa(example(name));
      expect(r.alreadyMinimal, name).toBe(true);
      expect(r.minimized.states).toHaveLength(example(name).states.length);
    }
  });

  it("the subset DFA for 'third-from-last is 1' is already minimal (8 states)", () => {
    const r = minimizeDfa(subsetConstruction(example("Third-from-last is 1")).dfa);
    expect(r.minimized.states).toHaveLength(8);
  });

  it("adds a dead state for missing transitions", () => {
    const partial: Automaton = {
      type: "DFA",
      states: states("q0", "q1"),
      alphabet: ["a", "b"],
      start: "q0",
      accepting: ["q1"],
      transitions: [t("q0", "q1", "a")],
    };
    const r = minimizeDfa(partial);
    expect(r.addedDeadState).toBe("dead");
    expect(r.minimized.states).toHaveLength(3);
    sameLanguage(partial, r.minimized);
  });

  it("needs a DFA", () => {
    expect(() => minimizeDfa(example("Ends in ab"))).toThrow(/DFA/);
  });
});

describe("minimizeDfa properties", () => {
  it("preserves the language", () => {
    fc.assert(
      fc.property(arbAutomaton("DFA"), (dfa) => sameLanguage(dfa, minimizeDfa(dfa).minimized)),
      { numRuns: 300 },
    );
  });

  it("produces a valid complete DFA that is no bigger than the (completed) input", () => {
    fc.assert(
      fc.property(arbAutomaton("DFA"), (dfa) => {
        const r = minimizeDfa(dfa);
        expect(hasErrors(validate(r.minimized))).toBe(false);
        expect(validate(r.minimized).filter((i) => i.message.includes("no transition"))).toEqual([]);
        expect(r.minimized.states.length).toBeLessThanOrEqual(r.prepared.states.length);
      }),
    );
  });

  it("is idempotent: minimizing a minimal DFA changes nothing", () => {
    fc.assert(
      fc.property(arbAutomaton("DFA"), (dfa) => {
        const once = minimizeDfa(dfa).minimized;
        const twice = minimizeDfa(once);
        expect(twice.alreadyMinimal).toBe(true);
        expect(twice.minimized.states).toHaveLength(once.states.length);
      }),
    );
  });

  it("every witness string really distinguishes its pair", () => {
    fc.assert(
      fc.property(arbAutomaton("DFA"), (dfa) => {
        const r = minimizeDfa(dfa);
        for (const mark of Object.values(r.marks)) {
          const from = (s: string) => accepts({ ...r.prepared, start: s }, mark.witness);
          expect(from(mark.p)).not.toBe(from(mark.q));
        }
      }),
    );
  });

  it("finds the same minimal size for an NFA's DFA and a 'doubled' copy of it", () => {
    // Doubling every state (twins with the same behaviour) must not change the minimal size.
    fc.assert(
      fc.property(arbAutomaton("NFA"), fc.infiniteStream(fc.boolean()), (nfa, coins) => {
        const dfa = subsetConstruction(nfa).dfa;
        const twin = (id: string) => `${id}'`;
        const doubled: Automaton = {
          ...dfa,
          states: [...dfa.states, ...dfa.states.map((s) => ({ id: twin(s.id), label: twin(s.label) }))],
          accepting: [...dfa.accepting, ...dfa.accepting.map(twin)],
          transitions: [...dfa.transitions, ...dfa.transitions.map((x) => ({ ...x, from: twin(x.from) }))].map((x) =>
            coins.next().value ? { ...x, to: twin(x.to) } : x,
          ),
        };
        expect(minimizeDfa(doubled).minimized.states).toHaveLength(minimizeDfa(dfa).minimized.states.length);
      }),
      { numRuns: 200 },
    );
  });
});
