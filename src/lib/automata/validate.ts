import { stateLabel } from "./edit";
import { Automaton, EPSILON } from "./types";

export interface Issue {
  /** "error": not a valid machine of this type. "warning": allowed but worth knowing. */
  severity: "error" | "warning";
  message: string;
}

/**
 * Check the machine against the formal definition of its type.
 * A DFA with missing transitions is reported as a warning: the simulator treats
 * a missing transition as going to an implicit dead (trap) state.
 */
export function validate(m: Automaton): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ severity: "error", message });
  const warn = (message: string) => issues.push({ severity: "warning", message });
  const ids = new Set(m.states.map((s) => s.id));
  const label = (id: string) => stateLabel(m, id);

  if (m.states.length === 0) err("The machine has no states.");
  if (m.start === null) err("No start state is set.");
  else if (!ids.has(m.start)) err(`Start state "${m.start}" does not exist.`);

  const labels = new Map<string, number>();
  for (const s of m.states) labels.set(s.label, (labels.get(s.label) ?? 0) + 1);
  for (const [l, n] of labels) if (n > 1) err(`State name "${l}" is used ${n} times.`);

  for (const a of m.accepting) if (!ids.has(a)) err(`Accepting state "${a}" does not exist.`);

  for (const sym of m.alphabet) {
    if ([...sym].length !== 1) err(`Alphabet symbol "${sym}" must be a single character.`);
    if (sym === EPSILON) err("ε cannot be part of the alphabet.");
  }

  for (const t of m.transitions) {
    if (!ids.has(t.from) || !ids.has(t.to)) {
      err(`Transition on "${t.symbol}" refers to a missing state.`);
      continue;
    }
    if (t.symbol === EPSILON) {
      if (m.type === "DFA") err(`DFAs cannot have ε-transitions (${label(t.from)} → ${label(t.to)}).`);
    } else if (!m.alphabet.includes(t.symbol)) {
      err(`Symbol "${t.symbol}" on ${label(t.from)} → ${label(t.to)} is not in the alphabet.`);
    }
  }

  if (m.type === "DFA") {
    for (const s of m.states) {
      for (const sym of m.alphabet) {
        const targets = m.transitions.filter((t) => t.from === s.id && t.symbol === sym);
        if (targets.length > 1) {
          err(`DFA state ${s.label} has ${targets.length} transitions on "${sym}" (must have exactly one).`);
        } else if (targets.length === 0) {
          warn(`DFA state ${s.label} has no transition on "${sym}" (treated as going to a dead state).`);
        }
      }
    }
  }

  if (m.accepting.length === 0 && m.states.length > 0) {
    warn("There are no accepting states, so the machine accepts nothing.");
  }

  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
