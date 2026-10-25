// DFA minimization with the table-filling (Myhill–Nerode) algorithm,
// recording each round and a distinguishing string for every marked pair.

import { stateLabel } from "./edit";
import { Automaton, EPSILON, State, Transition } from "./types";

/** Why a pair of states is distinguishable. */
export interface PairMark {
  p: string;
  q: string;
  /** Round in which the pair was marked (0 = one accepting, one not). */
  round: number;
  /** A string accepted from exactly one of p, q. */
  witness: string;
  /** For round > 0: the symbol and the already-marked pair it leads to. */
  via?: { symbol: string; p: string; q: string };
}

export interface MinimizeResult {
  /** The complete DFA the table is built on (unreachable states removed, dead state added if needed). */
  prepared: Automaton;
  /** Labels of states removed because they are unreachable from the start state. */
  removedUnreachable: string[];
  /** Id of the dead state added to make the DFA complete, if one was needed. */
  addedDeadState: string | null;
  /** marks[pairKey(p, q)] for every distinguishable pair. */
  marks: Record<string, PairMark>;
  /** rounds[k] = pairs newly marked in round k. */
  rounds: PairMark[][];
  /** Groups of equivalent states (ids of `prepared`), in state order. */
  classes: string[][];
  minimized: Automaton;
  /** True if no states were removed or merged. */
  alreadyMinimal: boolean;
}

/** Order-independent key for a pair of states. */
export function pairKey(m: Automaton, a: string, b: string): string {
  const ia = m.states.findIndex((s) => s.id === a);
  const ib = m.states.findIndex((s) => s.id === b);
  return ia < ib ? `${a}|${b}` : `${b}|${a}`;
}

function reachableStates(m: Automaton): Set<string> {
  const seen = new Set<string>();
  if (m.start === null) return seen;
  const stack = [m.start];
  seen.add(m.start);
  while (stack.length) {
    const s = stack.pop()!;
    for (const t of m.transitions) {
      if (t.from === s && !seen.has(t.to)) {
        seen.add(t.to);
        stack.push(t.to);
      }
    }
  }
  return seen;
}

/** Remove unreachable states and add a dead state for missing transitions. */
function prepare(dfa: Automaton) {
  const reachable = reachableStates(dfa);
  const removedUnreachable = dfa.states.filter((s) => !reachable.has(s.id)).map((s) => s.label);
  const states: State[] = dfa.states.filter((s) => reachable.has(s.id));
  const transitions: Transition[] = dfa.transitions.filter((t) => reachable.has(t.from) && t.symbol !== EPSILON);

  let dead: string | null = null;
  const missing: { from: string; symbol: string }[] = [];
  for (const s of states) {
    for (const a of dfa.alphabet) {
      if (!transitions.some((t) => t.from === s.id && t.symbol === a)) missing.push({ from: s.id, symbol: a });
    }
  }
  if (missing.length > 0) {
    const used = new Set(dfa.states.flatMap((s) => [s.id, s.label]));
    dead = "dead";
    for (let i = 1; used.has(dead); i++) dead = `dead${i}`;
    states.push({ id: dead, label: dead });
    for (const { from, symbol } of missing) transitions.push({ from, to: dead, symbol });
    for (const a of dfa.alphabet) transitions.push({ from: dead, to: dead, symbol: a });
  }

  const prepared: Automaton = {
    type: "DFA",
    states,
    alphabet: [...dfa.alphabet],
    start: dfa.start,
    accepting: dfa.accepting.filter((a) => reachable.has(a)),
    transitions,
  };
  return { prepared, removedUnreachable, addedDeadState: dead };
}

/**
 * Minimize a DFA. Throws if the machine is not a DFA with a start state
 * (callers should check validate() first; missing transitions are fine).
 */
export function minimizeDfa(dfa: Automaton): MinimizeResult {
  if (dfa.type !== "DFA") throw new Error("Minimization needs a DFA. Convert the NFA first.");
  if (dfa.start === null) throw new Error("The DFA has no start state.");

  const { prepared: m, removedUnreachable, addedDeadState } = prepare(dfa);
  const ids = m.states.map((s) => s.id);
  const accepting = new Set(m.accepting);
  const delta = new Map<string, string>();
  for (const t of m.transitions) delta.set(`${t.from}|${t.symbol}`, t.to);
  const next = (s: string, a: string) => delta.get(`${s}|${a}`)!;

  const marks: Record<string, PairMark> = {};
  const rounds: PairMark[][] = [];
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < i; j++) pairs.push([ids[j], ids[i]]);

  // Round 0: accepting vs. non-accepting.
  rounds.push([]);
  for (const [p, q] of pairs) {
    if (accepting.has(p) !== accepting.has(q)) {
      const mark = { p, q, round: 0, witness: "" };
      marks[pairKey(m, p, q)] = mark;
      rounds[0].push(mark);
    }
  }

  // Round k: mark (p, q) if some symbol leads to a pair marked in an earlier round.
  for (let round = 1; ; round++) {
    const newly: PairMark[] = [];
    for (const [p, q] of pairs) {
      if (marks[pairKey(m, p, q)]) continue;
      for (const a of m.alphabet) {
        const p2 = next(p, a);
        const q2 = next(q, a);
        if (p2 === q2) continue;
        const prior = marks[pairKey(m, p2, q2)];
        if (prior && prior.round < round) {
          newly.push({ p, q, round, witness: a + prior.witness, via: { symbol: a, p: p2, q: q2 } });
          break;
        }
      }
    }
    if (newly.length === 0) break;
    for (const mark of newly) marks[pairKey(m, mark.p, mark.q)] = mark;
    rounds.push(newly);
  }

  // Unmarked pairs are equivalent: group them (union-find).
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const [p, q] of pairs) {
    if (!marks[pairKey(m, p, q)]) {
      const rp = find(p);
      const rq = find(q);
      if (rp === rq) continue;
      // Keep the earlier state as the root so each class is named after its first member.
      const [keep, drop] = ids.indexOf(rp) < ids.indexOf(rq) ? [rp, rq] : [rq, rp];
      parent.set(drop, keep);
    }
  }
  const classMap = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    classMap.set(root, [...(classMap.get(root) ?? []), id]);
  }
  const classes = [...classMap.values()];

  // Build the minimized DFA. Each class is named after its first member.
  const rep = new Map<string, string>();
  for (const c of classes) for (const id of c) rep.set(id, c[0]);
  const keepPositions = addedDeadState === null;
  const minimized: Automaton = {
    type: "DFA",
    states: classes.map((c) => {
      const first = m.states.find((s) => s.id === c[0])!;
      const label = c.length === 1 ? first.label : `{${c.map((id) => stateLabel(m, id)).join(",")}}`;
      return keepPositions && first.x !== undefined && first.y !== undefined
        ? { id: c[0], label, x: first.x, y: first.y }
        : { id: c[0], label };
    }),
    alphabet: [...m.alphabet],
    start: rep.get(m.start!)!,
    accepting: classes.filter((c) => accepting.has(c[0])).map((c) => c[0]),
    transitions: classes.flatMap((c) => m.alphabet.map((a) => ({ from: c[0], to: rep.get(next(c[0], a))!, symbol: a }))),
  };

  return {
    prepared: m,
    removedUnreachable,
    addedDeadState,
    marks,
    rounds,
    classes,
    minimized,
    alreadyMinimal: removedUnreachable.length === 0 && classes.every((c) => c.length === 1),
  };
}
