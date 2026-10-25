import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "./examples";
import { minimizeDfa } from "./minimize";
import {
  analyzePumping,
  legalSplits,
  pump,
  PUMPING_LANGUAGES,
  pumpingDecomposition,
  suggestPumpableStrings,
} from "./pumping";
import { accepts } from "./simulate";
import { allStrings, arbAutomaton } from "./test-utils";

const example = (name: string) => EXAMPLES.find((e) => e.name === name)!.machine;
const lang = (id: string) => PUMPING_LANGUAGES.find((l) => l.id === id)!;

describe("legalSplits", () => {
  it("lists every split with |y| ≥ 1 and |xy| ≤ p", () => {
    const splits = legalSplits("abcd", 2);
    expect(splits).toEqual([
      { x: "", y: "a", z: "bcd" },
      { x: "", y: "ab", z: "cd" },
      { x: "a", y: "b", z: "cd" },
    ]);
  });

  it("has p(p+1)/2 splits when |s| ≥ p", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 0, max: 5 }), (p, extra) => {
        const s = "a".repeat(p + extra);
        const splits = legalSplits(s, p);
        expect(splits).toHaveLength((p * (p + 1)) / 2);
        for (const sp of splits) {
          expect(sp.x + sp.y + sp.z).toBe(s);
          expect(sp.y.length).toBeGreaterThan(0);
          expect((sp.x + sp.y).length).toBeLessThanOrEqual(p);
        }
      }),
    );
  });
});

describe("classic languages", () => {
  it("membership tests behave as expected", () => {
    expect(lang("0n1n").contains("000111")).toBe(true);
    expect(lang("0n1n").contains("0101")).toBe(false);
    expect(lang("equal").contains("0101")).toBe(true);
    expect(lang("palindromes").contains("01110")).toBe(true);
    expect(lang("ww").contains("01010101")).toBe(true);
    expect(lang("ww").contains("0110")).toBe(false);
    expect(lang("n_gt_m").contains("aab")).toBe(true);
    expect(lang("n_gt_m").contains("ab")).toBe(false);
    expect(lang("squares").contains("a".repeat(9))).toBe(true);
    expect(lang("primes").contains("a".repeat(7))).toBe(true);
    expect(lang("primes").contains("a".repeat(9))).toBe(false);
    expect(lang("balanced").contains("(()())")).toBe(true);
    expect(lang("balanced").contains("())(")).toBe(false);
  });

  it("for every non-regular language, the suggested string defeats every split (p = 1..7)", () => {
    for (const L of PUMPING_LANGUAGES.filter((l) => !l.regular)) {
      for (let p = 1; p <= 7; p++) {
        const s = L.suggest(p);
        const r = analyzePumping(L.contains, s, p, L.maxI?.(s) ?? 5);
        expect(r.inLanguage, `${L.id} p=${p}`).toBe(true);
        expect(r.longEnough, `${L.id} p=${p}`).toBe(true);
        expect(r.allSplitsFail, `${L.id} p=${p}`).toBe(true);
      }
    }
  });

  it("for the regular contrast language, some split always pumps", () => {
    const L = lang("01star");
    for (let p = 2; p <= 7; p++) {
      expect(analyzePumping(L.contains, L.suggest(p), p).allSplitsFail).toBe(false);
    }
  });

  it("a badly chosen string is reported as not working", () => {
    // (01)^p is in "equal 0s and 1s", but y = 01 pumps fine.
    const r = analyzePumping(lang("equal").contains, "01".repeat(4), 4);
    expect(r.allSplitsFail).toBe(false);
    expect(r.splits.some((s) => s.y === "01" && s.failsAt === null)).toBe(true);
  });

  it("reports strings that are not in L or too short", () => {
    expect(analyzePumping(lang("0n1n").contains, "0011", 3)).toMatchObject({ inLanguage: true, longEnough: true });
    expect(analyzePumping(lang("0n1n").contains, "01", 3)).toMatchObject({ longEnough: false, splits: [] });
    expect(analyzePumping(lang("0n1n").contains, "0001", 3)).toMatchObject({ inLanguage: false, splits: [] });
  });
});

describe("pumpingDecomposition on DFAs", () => {
  it("finds the loop for 'even number of 0s'", () => {
    const d = pumpingDecomposition(example("Even number of 0s"), "1001")!;
    expect(d.p).toBe(2);
    expect(d.x + d.y + d.z).toBe("1001");
    expect(d.y.length).toBeGreaterThan(0);
    expect((d.x + d.y).length).toBeLessThanOrEqual(2);
    expect(d.loopState).toBe("q0");
  });

  it("returns null for rejected or short strings", () => {
    expect(pumpingDecomposition(example("Even number of 0s"), "0")).toBeNull();
    expect(pumpingDecomposition(example("Binary divisible by 3"), "11")).toBeNull(); // shorter than p = 3
  });

  it("property: the split is legal and every pumped string is accepted", () => {
    fc.assert(
      fc.property(arbAutomaton("DFA"), (dfa) => {
        for (const s of suggestPumpableStrings(dfa, 4)) {
          const d = pumpingDecomposition(dfa, s);
          expect(d, `string "${s}"`).not.toBeNull();
          expect(d!.x + d!.y + d!.z).toBe(s);
          expect(d!.y.length).toBeGreaterThan(0);
          expect([...d!.x + d!.y].length).toBeLessThanOrEqual(d!.p);
          for (let i = 0; i <= 4; i++) expect(accepts(dfa, pump(d!, i)), `i=${i}`).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe("suggestPumpableStrings", () => {
  it("returns accepted strings of length ≥ p, shortest first", () => {
    const dfa = example("Even number of 0s");
    expect(suggestPumpableStrings(dfa, 4)).toEqual(["00", "11", "001", "010"]);
  });

  it("is empty exactly when no accepted string has length in [p, 2p) (finite language)", () => {
    fc.assert(
      fc.property(arbAutomaton("DFA"), (dfa) => {
        const p = dfa.states.length;
        const brute = allStrings(dfa.alphabet, 2 * p - 1).filter((w) => w.length >= p && accepts(dfa, w));
        expect(suggestPumpableStrings(dfa, 1).length > 0).toBe(brute.length > 0);
      }),
    );
  });

  it("works on minimized DFAs too", () => {
    const m = minimizeDfa(example("Binary divisible by 3")).minimized;
    expect(suggestPumpableStrings(m, 3).every((w) => w.length >= 3 && accepts(m, w))).toBe(true);
  });
});
