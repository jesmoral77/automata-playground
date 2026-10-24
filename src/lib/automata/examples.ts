// Classic textbook machines to start from.

import { Automaton, EPSILON } from "./types";

export interface Example {
  name: string;
  description: string;
  machine: Automaton;
}

const t = (from: string, to: string, symbol: string) => ({ from, to, symbol });
const s = (id: string, x: number, y: number) => ({ id, label: id, x, y });

export const EXAMPLES: Example[] = [
  {
    name: "Even number of 0s",
    description: "DFA over {0,1} accepting strings with an even number of 0s.",
    machine: {
      type: "DFA",
      states: [s("q0", 150, 200), s("q1", 400, 200)],
      alphabet: ["0", "1"],
      start: "q0",
      accepting: ["q0"],
      transitions: [t("q0", "q1", "0"), t("q1", "q0", "0"), t("q0", "q0", "1"), t("q1", "q1", "1")],
    },
  },
  {
    name: "Binary divisible by 3",
    description: "DFA reading a binary number (most significant bit first); accepts multiples of 3.",
    machine: {
      type: "DFA",
      states: [s("r0", 150, 200), s("r1", 375, 200), s("r2", 600, 200)],
      alphabet: ["0", "1"],
      start: "r0",
      accepting: ["r0"],
      transitions: [
        t("r0", "r0", "0"), t("r0", "r1", "1"),
        t("r1", "r2", "0"), t("r1", "r0", "1"),
        t("r2", "r1", "0"), t("r2", "r2", "1"),
      ],
    },
  },
  {
    name: "Ends in ab",
    description: "NFA over {a,b} accepting strings that end in \"ab\".",
    machine: {
      type: "NFA",
      states: [s("q0", 150, 200), s("q1", 350, 200), s("q2", 550, 200)],
      alphabet: ["a", "b"],
      start: "q0",
      accepting: ["q2"],
      transitions: [t("q0", "q0", "a"), t("q0", "q0", "b"), t("q0", "q1", "a"), t("q1", "q2", "b")],
    },
  },
  {
    name: "Third-from-last is 1",
    description: "NFA over {0,1} whose equivalent DFA needs 8 states — a classic subset-construction blow-up.",
    machine: {
      type: "NFA",
      states: [s("q0", 120, 200), s("q1", 300, 200), s("q2", 480, 200), s("q3", 660, 200)],
      alphabet: ["0", "1"],
      start: "q0",
      accepting: ["q3"],
      transitions: [
        t("q0", "q0", "0"), t("q0", "q0", "1"), t("q0", "q1", "1"),
        t("q1", "q2", "0"), t("q1", "q2", "1"),
        t("q2", "q3", "0"), t("q2", "q3", "1"),
      ],
    },
  },
  {
    name: "a* ∪ b* (ε-NFA)",
    description: "ε-NFA accepting strings of only a's or only b's, using ε-transitions to branch.",
    machine: {
      type: "NFA",
      states: [s("q0", 150, 220), s("q1", 380, 120), s("q2", 380, 320)],
      alphabet: ["a", "b"],
      start: "q0",
      accepting: ["q1", "q2"],
      transitions: [t("q0", "q1", EPSILON), t("q0", "q2", EPSILON), t("q1", "q1", "a"), t("q2", "q2", "b")],
    },
  },
];
