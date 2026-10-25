"use client";

import { useState } from "react";
import {
  Automaton,
  hasErrors,
  Issue,
  minimizeDfa,
  MinimizeResult,
  pairKey,
  stateLabel,
  subsetConstruction,
} from "@/lib/automata";
import AutomatonCanvas from "./AutomatonCanvas";
import { Badge, Button, SectionTitle } from "./ui";

interface Props {
  machine: Automaton;
  issues: Issue[];
  onOpenInEditor: (dfa: Automaton) => void;
}

export default function MinimizePanel({ machine, issues, onOpenInEditor }: Props) {
  const [run, setRun] = useState<{ source: Automaton; fromNfa: boolean; result: MinimizeResult } | null>(null);
  const [round, setRound] = useState(0);
  const errors = hasErrors(issues);

  const start = () => {
    const fromNfa = machine.type === "NFA";
    const dfa = fromNfa ? subsetConstruction(machine).dfa : machine;
    const result = minimizeDfa(dfa);
    setRun({ source: machine, fromNfa, result });
    setRound(result.rounds.length); // show the finished table first
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-700">
        The <strong>table-filling algorithm</strong> finds which states are distinguishable. Round 0 marks every pair where
        one state accepts and the other doesn&apos;t. Each later round marks a pair if some symbol takes it to an
        already-marked pair. Pairs that are never marked are equivalent and get merged.
      </p>
      {machine.type === "NFA" && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          This is an NFA, so it will first be converted to a DFA with subset construction, then minimized.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={start} disabled={errors || machine.start === null}>
          {run ? "Re-run on current machine" : "Minimize"}
        </Button>
        {errors && <span className="text-sm text-red-700">Fix the errors in the Edit tab first.</span>}
        {!errors && run && run.source !== machine && (
          <span className="text-sm text-amber-800">The machine changed since this run.</span>
        )}
      </div>
      {run && (
        <ResultView
          result={run.result}
          fromNfa={run.fromNfa}
          originalCount={run.source.states.length}
          round={round}
          setRound={setRound}
          onOpenInEditor={onOpenInEditor}
        />
      )}
    </div>
  );
}

function ResultView({
  result,
  fromNfa,
  originalCount,
  round,
  setRound,
  onOpenInEditor,
}: {
  result: MinimizeResult;
  fromNfa: boolean;
  originalCount: number;
  round: number;
  setRound: (n: number) => void;
  onOpenInEditor: (dfa: Automaton) => void;
}) {
  const m = result.prepared;
  const label = (id: string) => stateLabel(m, id);
  const [picked, setPicked] = useState<[string, string] | null>(null);
  const lastRound = result.rounds.length; // "round = lastRound" means the finished table
  const finished = round >= lastRound;

  const pickedMark = picked ? result.marks[pairKey(m, picked[0], picked[1])] : undefined;
  const ids = m.states.map((s) => s.id);

  return (
    <div className="space-y-5">
      {(result.removedUnreachable.length > 0 || result.addedDeadState || fromNfa) && (
        <div>
          <SectionTitle>Preparation</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {fromNfa && <li>Converted the NFA to a {m.states.length}-state DFA with subset construction.</li>}
            {result.removedUnreachable.length > 0 && (
              <li>
                Removed unreachable state{result.removedUnreachable.length > 1 ? "s" : ""}:{" "}
                <span className="font-mono">{result.removedUnreachable.join(", ")}</span>
              </li>
            )}
            {result.addedDeadState && (
              <li>
                Added a dead state <span className="font-mono">{result.addedDeadState}</span> for the missing transitions,
                so the DFA is complete.
              </li>
            )}
          </ul>
        </div>
      )}

      <div>
        <SectionTitle>Distinguishability table</SectionTitle>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button onClick={() => setRound(0)} disabled={round === 0}>⏮</Button>
          <Button onClick={() => setRound(Math.max(0, round - 1))} disabled={round === 0}>◀ Prev</Button>
          <Button onClick={() => setRound(Math.min(lastRound, round + 1))} disabled={finished}>Next ▶</Button>
          <span className="text-sm text-slate-600">
            {finished ? `Finished (${lastRound} round${lastRound === 1 ? "" : "s"})` : `After round ${round}`}
          </span>
        </div>
        {!finished && (
          <p className="mb-2 text-sm text-slate-700">
            Round {round} marks {result.rounds[round].length} pair{result.rounds[round].length === 1 ? "" : "s"}
            {round === 0 ? " (accepting vs. non-accepting)." : " (a symbol leads to a pair marked earlier)."}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="border-collapse font-mono text-xs">
            <tbody>
              {ids.slice(1).map((rowId, i) => (
                <tr key={rowId}>
                  <th className="pr-2 text-right font-semibold text-slate-600">{label(rowId)}</th>
                  {ids.slice(0, i + 1).map((colId) => {
                    const mark = result.marks[pairKey(m, rowId, colId)];
                    const shown = mark && mark.round <= round;
                    const isNew = mark && mark.round === round && !finished;
                    const equivalent = finished && !mark;
                    const isPicked = picked && pairKey(m, picked[0], picked[1]) === pairKey(m, rowId, colId);
                    return (
                      <td key={colId} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => setPicked([colId, rowId])}
                          title={`${label(colId)} vs ${label(rowId)}`}
                          className={`h-8 min-w-8 rounded border px-1 ${
                            isPicked ? "ring-2 ring-blue-500" : ""
                          } ${
                            isNew
                              ? "border-amber-400 bg-amber-200 text-amber-900"
                              : shown
                                ? "border-red-200 bg-red-50 text-red-800"
                                : equivalent
                                  ? "border-green-300 bg-green-100 text-green-800"
                                  : "border-slate-200 bg-white text-slate-300"
                          }`}
                        >
                          {shown ? `✕${mark.round}` : equivalent ? "≡" : "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td />
                {ids.slice(0, -1).map((colId) => (
                  <th key={colId} className="pt-1 text-center font-semibold text-slate-600">
                    {label(colId)}
                  </th>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          ✕k = marked distinguishable in round k, ≡ = equivalent. Click a cell for the reason.
        </p>
        {picked && (
          <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-slate-800">
            {pickedMark ? (
              <>
                <p>
                  <strong>
                    {label(picked[0])} and {label(picked[1])}
                  </strong>{" "}
                  are distinguishable: the string{" "}
                  <span className="font-mono font-semibold">&quot;{pickedMark.witness || "ε"}&quot;</span> is accepted from
                  exactly one of them.
                </p>
                <p className="mt-1 text-slate-600">
                  {pickedMark.round === 0
                    ? "Marked in round 0: one is accepting and the other is not."
                    : `Marked in round ${pickedMark.round}: on "${pickedMark.via!.symbol}" they go to ${label(pickedMark.via!.p)} and ${label(pickedMark.via!.q)}, which were already marked.`}
                </p>
              </>
            ) : (
              <p>
                <strong>
                  {label(picked[0])} and {label(picked[1])}
                </strong>{" "}
                are equivalent: no string is accepted from one but not the other, so they are merged.
              </p>
            )}
          </div>
        )}
      </div>

      {finished && (
        <div className="space-y-3">
          <div>
            <SectionTitle>Equivalence classes</SectionTitle>
            <p className="font-mono text-sm leading-7">
              {result.classes.map((c, i) => (
                <span
                  key={i}
                  className={`mr-2 rounded px-1 ring-1 ${c.length > 1 ? "bg-green-50 ring-green-300" : "ring-slate-200"}`}
                >
                  {`{${c.map(label).join(", ")}}`}
                </span>
              ))}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <SectionTitle>Minimal DFA</SectionTitle>
            <Badge tone={result.alreadyMinimal ? "green" : "blue"}>
              {fromNfa ? `NFA ${originalCount} → ` : result.alreadyMinimal ? "" : `${originalCount} → `}
              {result.minimized.states.length} state{result.minimized.states.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {result.alreadyMinimal && !fromNfa && (
            <p className="text-sm text-green-800">
              ✓ This DFA is already minimal
              {result.addedDeadState
                ? " (the only change is the dead state that makes it complete; leaving it implicit is also fine)."
                : "."}
            </p>
          )}
          <div className="h-72 rounded-md border border-slate-200">
            <AutomatonCanvas machine={result.minimized} readOnly fitKey={result.minimized.states.length} />
          </div>
          <p className="text-xs text-slate-500">Merged states are named after their members, e.g. {"{q1,q3}"}.</p>
          <Button variant="primary" onClick={() => onOpenInEditor(result.minimized)}>
            Open the minimal DFA in the editor
          </Button>
        </div>
      )}
    </div>
  );
}
