"use client";

import { useMemo, useState } from "react";
import { Automaton, hasErrors, Issue, stateLabel, SubsetResult, SubsetStep, subsetConstruction } from "@/lib/automata";
import AutomatonCanvas from "./AutomatonCanvas";
import { Badge, Button, SectionTitle } from "./ui";

interface Props {
  machine: Automaton;
  issues: Issue[];
  onOpenInEditor: (dfa: Automaton, name: string) => void;
}

export default function SubsetPanel({ machine, issues, onOpenInEditor }: Props) {
  const [conversion, setConversion] = useState<{ source: Automaton; result: SubsetResult } | null>(null);
  const [step, setStep] = useState(0);
  const errors = hasErrors(issues);

  const run = () => {
    setConversion({ source: machine, result: subsetConstruction(machine) });
    setStep(0);
  };
  const stale = conversion !== null && conversion.source !== machine;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-700">
        Subset construction builds a DFA whose states are <em>sets</em> of NFA states. Start from the ε-closure of the start
        state; for each new set S and each symbol a, the next set is ε-closure(move(S, a)).
      </p>
      {machine.type === "DFA" && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          This machine is already a DFA. Switch the type to NFA at the top to convert an NFA, or run it anyway to see each
          state become a one-element set.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={run} disabled={errors || machine.start === null}>
          {conversion ? "Re-run on current machine" : "Run subset construction"}
        </Button>
        {errors && <span className="text-sm text-red-700">Fix the errors in the Edit tab first.</span>}
        {!errors && stale && <span className="text-sm text-amber-800">The machine changed since this run.</span>}
      </div>
      {conversion && (
        <SubsetResultView
          nfa={conversion.source}
          result={conversion.result}
          step={step}
          setStep={setStep}
          onOpenInEditor={onOpenInEditor}
        />
      )}
    </div>
  );
}

function describe(nfa: Automaton, s: SubsetStep, names: Map<string, string>): string {
  const set = (ids: string[]) => (ids.length === 0 ? "∅" : `{${ids.map((id) => stateLabel(nfa, id)).join(",")}}`);
  if (s.kind === "start") {
    return `Start: ε-closure({${stateLabel(nfa, nfa.start!)}}) = ${set(s.closure)}. This is DFA state ${s.dfaState}.`;
  }
  const target = `${s.toDfaState} = ${names.get(s.toDfaState)}`;
  return (
    `${s.fromDfaState} on "${s.symbol}": move = ${set(s.moved)}, ε-closure = ${set(s.closure)} → ` +
    (s.isNew ? `new state ${target}.` : `existing state ${target}.`)
  );
}

function SubsetResultView({
  nfa,
  result,
  step,
  setStep,
  onOpenInEditor,
}: {
  nfa: Automaton;
  result: SubsetResult;
  step: number;
  setStep: (n: number) => void;
  onOpenInEditor: (dfa: Automaton, name: string) => void;
}) {
  const { rows, steps, dfa } = result;
  const last = steps.length - 1;
  const names = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);
  const current = steps[step];

  // Which rows exist and which table cells are filled as of this step.
  const visible = useMemo(() => {
    const created = new Set<string>();
    const filled = new Set<string>();
    for (const s of steps.slice(0, step + 1)) {
      if (s.kind === "start") created.add(s.dfaState);
      else {
        created.add(s.toDfaState);
        filled.add(`${s.fromDfaState}|${s.symbol}`);
      }
    }
    return { created, filled };
  }, [steps, step]);

  const finished = step === last;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setStep(0)} disabled={step === 0} aria-label="First step" title="First step">⏮</Button>
        <Button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>◀ Prev</Button>
        <Button onClick={() => setStep(Math.min(last, step + 1))} disabled={finished}>Next ▶</Button>
        <Button onClick={() => setStep(last)} disabled={finished}>Finish ⏭</Button>
        <span className="text-sm text-slate-600">
          Step {step + 1} / {steps.length}
        </span>
      </div>

      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 font-mono text-sm text-slate-800">
        {describe(nfa, current, names)}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left font-mono text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-xs text-slate-500">
              <th className="py-1 pr-2">DFA</th>
              <th className="py-1 pr-3">NFA states</th>
              {nfa.alphabet.map((a) => (
                <th key={a} className="py-1 pr-3">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => visible.created.has(r.id))
              .map((r) => {
                const isCurrentRow = current.kind === "transition" ? current.fromDfaState === r.id : current.dfaState === r.id;
                return (
                  <tr key={r.id} className={`border-b border-slate-100 ${isCurrentRow ? "bg-amber-50" : ""}`}>
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {r.isStart && "→"}
                      {r.isAccepting && "*"}
                      {r.id}
                    </td>
                    <td className="py-1 pr-3">{r.name}</td>
                    {nfa.alphabet.map((a) => {
                      const shown = visible.filled.has(`${r.id}|${a}`);
                      const isCurrentCell = current.kind === "transition" && current.fromDfaState === r.id && current.symbol === a;
                      return (
                        <td key={a} className={`py-1 pr-3 ${isCurrentCell ? "font-bold text-amber-800" : ""}`}>
                          {shown ? r.transitions[a] : ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">→ start state, * accepting state (contains an NFA accepting state).</p>
      </div>

      {finished && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Resulting DFA</SectionTitle>
            <Badge tone="blue">
              {rows.length} state{rows.length === 1 ? "" : "s"} (NFA had {nfa.states.length})
            </Badge>
          </div>
          <div className="h-72 rounded-md border border-slate-200">
            <AutomatonCanvas machine={dfa} readOnly fitKey={rows.length} />
          </div>
          <Button variant="primary" onClick={() => onOpenInEditor(dfa, "Converted DFA")}>
            Open this DFA in the editor
          </Button>
        </div>
      )}
    </div>
  );
}
