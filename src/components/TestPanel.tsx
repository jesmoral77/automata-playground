"use client";

import { useEffect, useMemo, useState } from "react";
import { accepts, Automaton, hasErrors, Issue, simulate, stateLabel } from "@/lib/automata";
import { Highlight } from "./AutomatonCanvas";
import { Badge, Button, inputClass, SectionTitle } from "./ui";

interface Props {
  machine: Automaton;
  issues: Issue[];
  onHighlight: (h: Highlight | null) => void;
}

const fmtSet = (m: Automaton, ids: string[]) =>
  ids.length === 0 ? "∅" : `{${ids.map((id) => stateLabel(m, id)).join(", ")}}`;

export default function TestPanel({ machine, issues, onHighlight }: Props) {
  const [input, setInput] = useState("");
  const [ranInput, setRanInput] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const result = useMemo(
    () => (ranInput === null ? null : simulate(machine, ranInput)),
    [machine, ranInput],
  );
  const lastStep = result ? result.steps.length - 1 : 0;
  const current = result?.steps[Math.min(step, lastStep)];

  useEffect(() => {
    onHighlight(current ? { active: current.active, taken: current.taken } : null);
  }, [current, onHighlight]);

  // Clear the highlight when leaving the Test tab.
  useEffect(() => () => onHighlight(null), [onHighlight]);

  useEffect(() => {
    if (!playing || step >= lastStep) return;
    const t = setTimeout(() => {
      setStep(step + 1);
      if (step + 1 >= lastStep) setPlaying(false);
    }, 700);
    return () => clearTimeout(t);
  }, [playing, step, lastStep]);

  const run = (stepTo: "start" | "end") => {
    setRanInput(input);
    setStep(stepTo === "end" ? [...input].length : 0);
    setPlaying(false);
  };

  const errors = hasErrors(issues);
  const symbols = ranInput === null ? [] : [...ranInput];
  const done = result && step >= lastStep;

  return (
    <div className="space-y-6">
      {errors && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          The machine has errors (see the Edit tab). You can still run it, but results may not match a valid {machine.type}.
        </p>
      )}

      <div>
        <SectionTitle>Input string</SectionTitle>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run("start");
          }}
        >
          <input
            className={`${inputClass} font-mono`}
            value={input}
            placeholder="leave empty for ε"
            onChange={(e) => setInput(e.target.value)}
          />
          <Button type="submit" variant="primary">
            Step through
          </Button>
          <Button onClick={() => run("end")}>Run</Button>
        </form>
      </div>

      {result && current && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setStep(0)} disabled={step === 0} title="First step">⏮</Button>
            <Button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} title="Previous step">◀</Button>
            <Button
              onClick={() => (done ? (setStep(0), setPlaying(true)) : setPlaying((p) => !p))}
              title="Play / pause"
            >
              {playing ? "⏸ Pause" : "▶ Play"}
            </Button>
            <Button onClick={() => setStep((s) => Math.min(lastStep, s + 1))} disabled={step >= lastStep} title="Next step">▶</Button>
            <Button onClick={() => setStep(lastStep)} disabled={step >= lastStep} title="Last step">⏭</Button>
            <span className="text-sm text-slate-600">
              Step {step} / {lastStep}
            </span>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 font-mono text-lg tracking-wider">
              {symbols.length === 0 && <span className="text-slate-400">ε (empty string)</span>}
              {symbols.map((c, i) => (
                <span
                  key={i}
                  className={
                    i < step - 1
                      ? "text-slate-400"
                      : i === step - 1
                        ? "rounded bg-amber-200 px-0.5 text-slate-900"
                        : "text-slate-900"
                  }
                >
                  {c}
                </span>
              ))}
            </div>
            <p className="text-sm text-slate-700">
              {current.symbol === null ? "Before reading any input, " : `After reading "${current.symbol}", `}
              active states: <span className="font-mono font-semibold">{fmtSet(machine, current.active)}</span>
            </p>
            {done && (
              <div className="mt-3 flex items-center gap-2">
                <Badge tone={result.accepted ? "green" : "red"}>{result.accepted ? "ACCEPTED" : "REJECTED"}</Badge>
                <span className="text-sm text-slate-600">
                  {result.accepted ? "The input ended in an accepting state." : result.reason}
                </span>
              </div>
            )}
          </div>

          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-2">Step</th>
                <th className="py-1 pr-2">Read</th>
                <th className="py-1">Active states</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {result.steps.map((s, i) => (
                <tr
                  key={i}
                  onClick={() => setStep(i)}
                  className={`cursor-pointer border-t border-slate-100 ${i === step ? "bg-amber-50" : "hover:bg-slate-50"}`}
                >
                  <td className="py-1 pr-2">{i}</td>
                  <td className="py-1 pr-2">{s.symbol ?? "—"}</td>
                  <td className="py-1">{fmtSet(machine, s.active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BatchTester machine={machine} />
      <LanguageSample machine={machine} />
    </div>
  );
}

function BatchTester({ machine }: { machine: Automaton }) {
  const [text, setText] = useState("");
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return (
    <div>
      <SectionTitle>Test many strings</SectionTitle>
      <textarea
        className={`${inputClass} h-24 font-mono`}
        value={text}
        placeholder={"One string per line.\nType ε for the empty string."}
        onChange={(e) => setText(e.target.value)}
      />
      {lines.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {lines.map((l, i) => {
            const w = l === "ε" ? "" : l;
            const ok = accepts(machine, w);
            return (
              <li key={i} className="flex items-center gap-2">
                <Badge tone={ok ? "green" : "red"}>{ok ? "accept" : "reject"}</Badge>
                <span className="font-mono">{l}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Shortest accepted strings, found by trying every string in length order. */
function LanguageSample({ machine }: { machine: Automaton }) {
  const [maxLen, setMaxLen] = useState(4);
  const sample = useMemo(() => {
    const alphabet = [...machine.alphabet].sort();
    if (alphabet.length === 0) return { accepted: accepts(machine, "") ? [""] : [], truncated: false };
    const out: string[] = [];
    let layer = [""];
    let tried = 0;
    for (let len = 0; len <= maxLen; len++) {
      if (len > 0) layer = layer.flatMap((w) => alphabet.map((a) => w + a));
      for (const w of layer) {
        if (++tried > 20000 || out.length >= 60) return { accepted: out, truncated: true };
        if (accepts(machine, w)) out.push(w);
      }
    }
    return { accepted: out, truncated: false };
  }, [machine, maxLen]);

  return (
    <div>
      <SectionTitle>Accepted strings (shortest first)</SectionTitle>
      <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
        Up to length
        <input
          type="number"
          min={0}
          max={12}
          className={`${inputClass} w-16`}
          value={maxLen}
          onChange={(e) => setMaxLen(Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
        />
      </label>
      {sample.accepted.length === 0 ? (
        <p className="text-sm text-slate-500">No strings up to this length are accepted.</p>
      ) : (
        <p className="font-mono text-sm leading-7 text-slate-800">
          {sample.accepted.map((w, i) => (
            <span key={i} className="mr-2 rounded bg-green-50 px-1 ring-1 ring-green-200">
              {w === "" ? "ε" : w}
            </span>
          ))}
          {sample.truncated && <span className="text-slate-500">…</span>}
        </p>
      )}
    </div>
  );
}
