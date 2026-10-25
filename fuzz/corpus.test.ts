// Replays the regression corpus as part of `npm test`, so a past bug can never
// silently come back. Open (unfixed) entries are reported as failures too.

import { describe, expect, it } from "vitest";
import { checkCase } from "./check";
import { readCorpus } from "./corpus";
import { generateCase, STRATEGIES } from "./generate";
import { refAccepts } from "./reference/reference";

describe("fuzz regression corpus", () => {
  const corpus = readCorpus();
  it("is readable", () => expect(Array.isArray(corpus)).toBe(true));
  for (const entry of corpus) {
    it(`${entry.id} (${entry.kind}) still passes`, () => {
      expect(checkCase(entry.case).mismatches).toEqual([]);
    });
  }
});

describe("fuzz harness sanity", () => {
  it("generation is reproducible for a given seed", () => {
    for (const s of STRATEGIES) expect(generateCase(s, 42)).toEqual(generateCase(s, 42));
  });

  it("the reference agrees with hand-checked answers", () => {
    const endsInAb = {
      type: "NFA",
      states: [{ id: "q0" }, { id: "q1" }, { id: "q2" }],
      alphabet: ["a", "b"],
      start: "q0",
      accepting: ["q2"],
      transitions: [
        { from: "q0", to: "q0", symbol: "a" },
        { from: "q0", to: "q0", symbol: "b" },
        { from: "q0", to: "q1", symbol: "a" },
        { from: "q1", to: "q2", symbol: "b" },
      ],
    };
    expect(refAccepts(endsInAb, "bab")).toBe(true);
    expect(refAccepts(endsInAb, "aba")).toBe(false);
    expect(refAccepts(endsInAb, "")).toBe(false);
  });
});
