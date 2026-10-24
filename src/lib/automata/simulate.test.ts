import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { accepts, epsilonClosure, simulate } from "./simulate";
import { arbAutomaton, arbInput, referenceAccepts } from "./test-utils";
import { Automaton, EPSILON } from "./types";

const example = (name: string) => EXAMPLES.find((e) => e.name === name)!.machine;

describe("simulate on example DFAs", () => {
  it("even number of 0s", () => {
    const m = example("Even number of 0s");
    expect(accepts(m, "")).toBe(true);
    expect(accepts(m, "0")).toBe(false);
    expect(accepts(m, "1001")).toBe(true);
    expect(accepts(m, "10100")).toBe(false); // three 0s
  });

  it("binary divisible by 3 matches arithmetic", () => {
    const m = example("Binary divisible by 3");
    for (let n = 0; n < 200; n++) {
      expect(accepts(m, n.toString(2))).toBe(n % 3 === 0);
    }
  });

  it("records one step per symbol plus the initial step", () => {
    const r = simulate(example("Even number of 0s"), "010");
    expect(r.steps.map((s) => s.active)).toEqual([["q0"], ["q1"], ["q1"], ["q0"]]);
    expect(r.steps.map((s) => s.symbol)).toEqual([null, "0", "1", "0"]);
    expect(r.steps[1].taken).toEqual([{ from: "q0", to: "q1", symbol: "0" }]);
    expect(r.accepted).toBe(true);
  });
});

describe("simulate on example NFAs", () => {
  it("ends in ab", () => {
    const m = example("Ends in ab");
    expect(accepts(m, "ab")).toBe(true);
    expect(accepts(m, "babab")).toBe(true);
    expect(accepts(m, "aba")).toBe(false);
    expect(accepts(m, "")).toBe(false);
    expect(simulate(m, "aab").steps.map((s) => s.active)).toEqual([
      ["q0"],
      ["q0", "q1"],
      ["q0", "q1"],
      ["q0", "q2"],
    ]);
  });

  it("third-from-last is 1", () => {
    const m = example("Third-from-last is 1");
    expect(accepts(m, "100")).toBe(true);
    expect(accepts(m, "0110")).toBe(true);
    expect(accepts(m, "011")).toBe(false);
    expect(accepts(m, "10")).toBe(false);
  });

  it("a* ∪ b* uses ε-closure for the start set", () => {
    const m = example("a* ∪ b* (ε-NFA)");
    expect(simulate(m, "").steps[0].active).toEqual(["q0", "q1", "q2"]);
    expect(accepts(m, "")).toBe(true);
    expect(accepts(m, "aaa")).toBe(true);
    expect(accepts(m, "bb")).toBe(true);
    expect(accepts(m, "ab")).toBe(false);
  });
});

describe("rejection reasons", () => {
  it("reports symbols outside the alphabet", () => {
    const r = simulate(example("Even number of 0s"), "0x1");
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/not in the alphabet/);
  });

  it("reports a stuck machine", () => {
    const r = simulate(example("a* ∪ b* (ε-NFA)"), "ab");
    expect(r.reason).toMatch(/stuck/);
  });

  it("handles a missing start state", () => {
    const m: Automaton = { ...example("Even number of 0s"), start: null };
    expect(simulate(m, "0")).toMatchObject({ accepted: false, steps: [] });
  });
});

describe("epsilonClosure", () => {
  it("follows chains and cycles of ε-transitions", () => {
    const m: Automaton = {
      type: "NFA",
      states: ["a", "b", "c", "d"].map((id) => ({ id, label: id })),
      alphabet: ["x"],
      start: "a",
      accepting: [],
      transitions: [
        { from: "a", to: "b", symbol: EPSILON },
        { from: "b", to: "c", symbol: EPSILON },
        { from: "c", to: "a", symbol: EPSILON },
        { from: "c", to: "d", symbol: "x" },
      ],
    };
    expect(epsilonClosure(m, ["b"])).toEqual(["a", "b", "c"]);
    expect(epsilonClosure(m, ["d"])).toEqual(["d"]);
    expect(epsilonClosure(m, [])).toEqual([]);
  });
});

describe("properties", () => {
  it("NFA simulation agrees with a brute-force path search", () => {
    fc.assert(
      fc.property(arbAutomaton("NFA"), arbInput, (m, w) => {
        expect(accepts(m, w)).toBe(referenceAccepts(m, w));
      }),
      { numRuns: 500 },
    );
  });

  it("DFA runs never have more than one active state", () => {
    fc.assert(
      fc.property(arbAutomaton("DFA"), arbInput, (m, w) => {
        for (const step of simulate(m, w).steps) expect(step.active.length).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("there is one step per input symbol plus the initial step", () => {
    fc.assert(
      fc.property(arbAutomaton("NFA"), arbInput, (m, w) => {
        expect(simulate(m, w).steps).toHaveLength(w.length + 1);
      }),
    );
  });
});
