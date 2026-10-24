import { describe, expect, it } from "vitest";
import {
  addState,
  addTransitions,
  groupEdges,
  parseSymbols,
  removeState,
  setEdgeSymbols,
  toggleAccepting,
} from "./edit";
import { EXAMPLES } from "./examples";
import { ParseError, parseAutomaton } from "./serialize";
import { emptyAutomaton, EPSILON } from "./types";
import { hasErrors, validate } from "./validate";

describe("validate", () => {
  it("accepts every example machine without errors", () => {
    for (const e of EXAMPLES) expect(hasErrors(validate(e.machine)), e.name).toBe(false);
  });

  it("rejects ε-transitions in a DFA", () => {
    const m = addTransitions(addState(emptyAutomaton("DFA")), "q0", "q0", [EPSILON]);
    expect(validate(m).some((i) => i.severity === "error" && i.message.includes("ε"))).toBe(true);
  });

  it("rejects two transitions on one symbol in a DFA, but allows it in an NFA", () => {
    let m = addState(addState(emptyAutomaton("DFA")));
    m = addTransitions(m, "q0", "q0", ["a"]);
    m = addTransitions(m, "q0", "q1", ["a"]);
    expect(hasErrors(validate(m))).toBe(true);
    expect(hasErrors(validate({ ...m, type: "NFA" }))).toBe(false);
  });

  it("warns about missing DFA transitions", () => {
    const m = addTransitions(addState(addState(emptyAutomaton("DFA"))), "q0", "q1", ["a"]);
    const warnings = validate(m).filter((i) => i.severity === "warning");
    expect(warnings.some((w) => w.message.includes("q1") && w.message.includes('"a"'))).toBe(true);
  });

  it("requires a start state", () => {
    expect(hasErrors(validate({ ...EXAMPLES[0].machine, start: null }))).toBe(true);
  });
});

describe("editing", () => {
  it("names states q0, q1, ... and makes the first one the start", () => {
    const m = addState(addState(emptyAutomaton()));
    expect(m.states.map((s) => s.id)).toEqual(["q0", "q1"]);
    expect(m.start).toBe("q0");
  });

  it("removing a state removes its transitions and start/accepting marks", () => {
    let m = addState(addState(emptyAutomaton()));
    m = toggleAccepting(addTransitions(m, "q0", "q1", ["a"]), "q0");
    m = removeState(m, "q0");
    expect(m).toMatchObject({ start: null, accepting: [], transitions: [] });
  });

  it("adding transitions grows the alphabet but never adds ε", () => {
    const m = addTransitions(addState(emptyAutomaton("NFA")), "q0", "q0", ["a", EPSILON, "b"]);
    expect(m.alphabet).toEqual(["a", "b"]);
  });

  it("parseSymbols understands ε aliases and ignores blanks/duplicates", () => {
    expect(parseSymbols("a, b,,a , eps")).toEqual(["a", "b", EPSILON]);
    expect(parseSymbols("epsilon")).toEqual([EPSILON]);
  });

  it("setEdgeSymbols replaces an edge's label and groupEdges groups by state pair", () => {
    let m = addState(addState(emptyAutomaton("NFA")));
    m = addTransitions(m, "q0", "q1", ["a", "b"]);
    m = setEdgeSymbols(m, "q0", "q1", ["c"]);
    expect(groupEdges(m)).toEqual([{ from: "q0", to: "q1", symbols: ["c"] }]);
  });
});

describe("parseAutomaton", () => {
  it("round-trips every example through JSON", () => {
    for (const e of EXAMPLES) {
      expect(parseAutomaton(JSON.parse(JSON.stringify(e.machine)))).toEqual(e.machine);
    }
  });

  it("rejects malformed input with a readable error", () => {
    expect(() => parseAutomaton(null)).toThrow(ParseError);
    expect(() => parseAutomaton({ ...EXAMPLES[0].machine, type: "PDA" })).toThrow(/type/);
    expect(() => parseAutomaton({ ...EXAMPLES[0].machine, states: "nope" })).toThrow(/states/);
  });
});
