import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { accepts } from "./simulate";
import { subsetConstruction } from "./subset";
import { allStrings, arbAutomaton } from "./test-utils";
import { validate } from "./validate";

const example = (name: string) => EXAMPLES.find((e) => e.name === name)!.machine;

describe("subsetConstruction on examples", () => {
  it("ends in ab -> 3-state DFA", () => {
    const { dfa, rows } = subsetConstruction(example("Ends in ab"));
    expect(rows.map((r) => r.name)).toEqual(["{q0}", "{q0,q1}", "{q0,q2}"]);
    expect(rows.map((r) => r.isAccepting)).toEqual([false, false, true]);
    expect(rows[0].transitions).toEqual({ a: "D1", b: "D0" });
    expect(dfa.type).toBe("DFA");
    expect(dfa.start).toBe("D0");
  });

  it("third-from-last is 1 -> 8 states", () => {
    const { rows } = subsetConstruction(example("Third-from-last is 1"));
    expect(rows).toHaveLength(8);
  });

  it("ε-NFA start state is the ε-closure, and ∅ appears as a dead state", () => {
    const { rows, steps } = subsetConstruction(example("a* ∪ b* (ε-NFA)"));
    expect(rows[0].name).toBe("{q0,q1,q2}");
    expect(steps[0]).toEqual({ kind: "start", closure: ["q0", "q1", "q2"], dfaState: "D0" });
    expect(rows.map((r) => r.name)).toContain("∅");
    const dead = rows.find((r) => r.name === "∅")!;
    expect(dead.isAccepting).toBe(false);
    expect(Object.values(dead.transitions).every((to) => to === dead.id)).toBe(true);
  });

  it("records one transition step per (DFA state, symbol)", () => {
    const nfa = example("Third-from-last is 1");
    const { rows, steps } = subsetConstruction(nfa);
    expect(steps.filter((s) => s.kind === "transition")).toHaveLength(rows.length * nfa.alphabet.length);
    expect(steps.filter((s) => s.kind === "transition" && s.isNew)).toHaveLength(rows.length - 1);
  });
});

describe("subsetConstruction properties", () => {
  it("the DFA accepts exactly the same strings as the NFA (all strings up to length 6)", () => {
    fc.assert(
      fc.property(arbAutomaton("NFA"), (nfa) => {
        const { dfa } = subsetConstruction(nfa);
        for (const w of allStrings(nfa.alphabet, 6)) {
          expect(accepts(dfa, w), `input "${w}"`).toBe(accepts(nfa, w));
        }
      }),
      { numRuns: 300 },
    );
  });

  it("produces a valid, complete DFA", () => {
    fc.assert(
      fc.property(arbAutomaton("NFA"), (nfa) => {
        const { dfa } = subsetConstruction(nfa);
        expect(validate(dfa)).not.toContainEqual(expect.objectContaining({ severity: "error" }));
        // Complete: no "missing transition" warnings.
        expect(validate(dfa).filter((i) => i.message.includes("no transition"))).toEqual([]);
      }),
    );
  });

  it("never creates more than 2^n states", () => {
    fc.assert(
      fc.property(arbAutomaton("NFA"), (nfa) => {
        expect(subsetConstruction(nfa).rows.length).toBeLessThanOrEqual(2 ** nfa.states.length);
      }),
    );
  });
});
