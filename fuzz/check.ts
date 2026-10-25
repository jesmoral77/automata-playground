// Compare the app's automata code (src/lib/automata) with the independent
// reference (fuzz/reference) on one case. This file is the only bridge
// between the two.

import { accepts, minimizeDfa, subsetConstruction, type Automaton } from "../src/lib/automata";
import { exhaustiveStrings, type FuzzCase } from "./generate";
import {
  EPS,
  refAccepts,
  refCounterexample,
  refDfaProblems,
  RefLimitError,
  refMinimalStateCount,
  type RefMachine,
} from "./reference/reference";

export type MismatchKind =
  | "simulate"
  | "subset-invalid"
  | "subset-language"
  | "minimize-invalid"
  | "minimize-language"
  | "minimize-not-minimal"
  | "crash";

export interface Mismatch {
  kind: MismatchKind;
  detail: string;
}

export interface CheckResult {
  mismatches: Mismatch[];
  /** Checks skipped because the reference hit its size budget. */
  skipped: number;
}

function isDfaShaped(m: RefMachine): boolean {
  const seen = new Set<string>();
  for (const t of m.transitions) {
    if (t.symbol === EPS) return false;
    const k = t.from + "\u0001" + t.symbol;
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

export function checkCase(c: FuzzCase): CheckResult {
  const mismatches: Mismatch[] = [];
  let skipped = 0;
  const nfa = c.machine as unknown as Automaton;
  const ref = c.machine as RefMachine;
  const guard = (kind: MismatchKind, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      if (e instanceof RefLimitError) skipped++;
      else mismatches.push({ kind: "crash", detail: `${kind}: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  // 1. Simulation: app vs DFS reference on the case's strings plus every short string.
  guard("simulate", () => {
    const strings = [...new Set([...c.strings, ...exhaustiveStrings(ref.alphabet)])];
    for (const w of strings) {
      const app = accepts(nfa, w);
      const expected = refAccepts(ref, w);
      if (app !== expected) {
        mismatches.push({ kind: "simulate", detail: `input "${w}": app ${app}, reference ${expected}` });
        break;
      }
    }
  });

  // 2. Subset construction: must be a complete DFA with exactly the NFA's language.
  let dfa: Automaton | null = null;
  guard("subset-language", () => {
    dfa = subsetConstruction(nfa).dfa;
    const problems = refDfaProblems(dfa as unknown as RefMachine);
    if (problems.length) mismatches.push({ kind: "subset-invalid", detail: problems.slice(0, 3).join("; ") });
    const cex = refCounterexample(ref, dfa as unknown as RefMachine);
    if (cex !== null) mismatches.push({ kind: "subset-language", detail: `languages differ on "${cex}"` });
  });

  // 3. Minimization of the subset DFA (and of the machine itself when it is DFA-shaped).
  const minimizeTargets: [string, Automaton][] = [];
  if (dfa) minimizeTargets.push(["subset DFA", dfa]);
  if (isDfaShaped(ref)) minimizeTargets.push(["machine as partial DFA", { ...nfa, type: "DFA" }]);
  for (const [label, target] of minimizeTargets) {
    guard("minimize-language", () => {
      const min = minimizeDfa(target).minimized;
      const problems = refDfaProblems(min as unknown as RefMachine);
      if (problems.length) {
        mismatches.push({ kind: "minimize-invalid", detail: `${label}: ${problems.slice(0, 3).join("; ")}` });
      }
      const cex = refCounterexample(ref, min as unknown as RefMachine);
      if (cex !== null) mismatches.push({ kind: "minimize-language", detail: `${label}: languages differ on "${cex}"` });
      const expected = refMinimalStateCount(ref);
      if (min.states.length !== expected) {
        mismatches.push({
          kind: "minimize-not-minimal",
          detail: `${label}: app has ${min.states.length} states, minimal complete DFA has ${expected}`,
        });
      }
    });
  }

  return { mismatches, skipped };
}

/**
 * Greedily shrink a failing case (drop transitions, then states, accepting
 * marks, strings) while it still fails with the same first mismatch kind.
 */
export function shrinkCase(c: FuzzCase, maxSteps = 400): FuzzCase {
  const kind = checkCase(c).mismatches[0]?.kind;
  if (!kind) return c;
  const stillFails = (x: FuzzCase) => checkCase(x).mismatches.some((m) => m.kind === kind);
  let best = structuredClone(c);
  let steps = 0;
  let improved = true;
  while (improved && steps < maxSteps) {
    improved = false;
    const candidates: FuzzCase[] = [];
    const m = best.machine;
    m.transitions.forEach((_, i) =>
      candidates.push({ ...best, machine: { ...m, transitions: m.transitions.filter((_, j) => j !== i) } }),
    );
    for (const s of m.states) {
      if (s.id === m.start) continue;
      candidates.push({
        ...best,
        machine: {
          ...m,
          states: m.states.filter((x) => x.id !== s.id),
          accepting: m.accepting.filter((a) => a !== s.id),
          transitions: m.transitions.filter((t) => t.from !== s.id && t.to !== s.id),
        },
      });
    }
    m.accepting.forEach((a) => candidates.push({ ...best, machine: { ...m, accepting: m.accepting.filter((x) => x !== a) } }));
    m.alphabet.forEach((sym) => {
      if (!m.transitions.some((t) => t.symbol === sym)) {
        candidates.push({ ...best, machine: { ...m, alphabet: m.alphabet.filter((x) => x !== sym) } });
      }
    });
    best.strings.forEach((_, i) => candidates.push({ ...best, strings: best.strings.filter((__, j) => j !== i) }));
    for (const cand of candidates) {
      if (++steps > maxSteps) break;
      if (stillFails(cand)) {
        best = structuredClone(cand);
        improved = true;
        break;
      }
    }
  }
  return best;
}
