"use client";

import { useState } from "react";
import { Automaton, EPSILON, ParseError, parseAutomaton, stateLabel } from "@/lib/automata";
import { Button, inputClass, SectionTitle } from "./ui";

interface Props {
  machine: Automaton;
  onImport: (m: Automaton) => void;
}

/** The machine as a formal 5-tuple and transition table, plus JSON import/export. */
export default function FormalPanel({ machine: m, onImport }: Props) {
  const label = (id: string) => stateLabel(m, id);
  const set = (ids: string[]) => (ids.length === 0 ? "∅" : `{${ids.map(label).join(", ")}}`);
  const columns = m.type === "NFA" ? [...m.alphabet, EPSILON] : m.alphabet;

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Formal definition</SectionTitle>
        <div className="space-y-1 font-mono text-sm text-slate-800">
          <p>M = (Q, Σ, δ, q₀, F)</p>
          <p>Q = {set(m.states.map((s) => s.id))}</p>
          <p>Σ = {m.alphabet.length ? `{${m.alphabet.join(", ")}}` : "∅"}</p>
          <p>q₀ = {m.start ? label(m.start) : "(none)"}</p>
          <p>F = {set(m.accepting)}</p>
          <p>
            δ : Q × {m.type === "NFA" ? "Σ_ε → P(Q)" : "Σ → Q"} (table below)
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <SectionTitle>Transition table δ</SectionTitle>
        <table className="w-full border-collapse text-left font-mono text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-xs text-slate-500">
              <th className="py-1 pr-3">state</th>
              {columns.map((c) => (
                <th key={c} className="py-1 pr-3">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.states.map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="py-1 pr-3 whitespace-nowrap">
                  {m.start === s.id && "→"}
                  {m.accepting.includes(s.id) && "*"}
                  {s.label}
                </td>
                {columns.map((c) => {
                  const targets = m.transitions.filter((t) => t.from === s.id && t.symbol === c).map((t) => t.to);
                  const text =
                    m.type === "DFA" ? (targets.length === 0 ? "—" : targets.map(label).join(", ")) : set(targets);
                  return (
                    <td key={c} className={`py-1 pr-3 ${targets.length === 0 ? "text-slate-400" : ""}`}>
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">→ start state, * accepting state.</p>
      </div>

      <JsonBox machine={m} onImport={onImport} />
    </div>
  );
}

function JsonBox({ machine, onImport }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = text ?? JSON.stringify(machine, null, 2);

  return (
    <div>
      <SectionTitle>JSON (export / import)</SectionTitle>
      <textarea
        className={`${inputClass} h-48 font-mono text-xs`}
        value={shown}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button onClick={() => navigator.clipboard.writeText(shown)}>Copy</Button>
        <Button
          variant="primary"
          disabled={text === null}
          onClick={() => {
            try {
              onImport(parseAutomaton(JSON.parse(text!)));
              setText(null);
            } catch (e) {
              setError(e instanceof ParseError || e instanceof SyntaxError ? e.message : "Could not import.");
            }
          }}
        >
          Load JSON into editor
        </Button>
        {text !== null && (
          <Button variant="ghost" onClick={() => (setText(null), setError(null))}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
