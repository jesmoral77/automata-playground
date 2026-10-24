"use client";

import { useState } from "react";
import { Automaton, EPSILON, Issue, parseSymbols, stateLabel } from "@/lib/automata";
import { Selection } from "./AutomatonCanvas";
import { Badge, Button, inputClass, SectionTitle } from "./ui";

export type Mode = "select" | "addState" | "addTransition";

interface Props {
  machine: Automaton;
  issues: Issue[];
  mode: Mode;
  selection: Selection;
  pendingFrom: string | null;
  pendingEdge: { from: string; to: string } | null;
  onConfirmEdge: (symbols: string[]) => void;
  onCancelEdge: () => void;
  onRename: (id: string, label: string) => void;
  onSetStart: (id: string) => void;
  onToggleAccepting: (id: string) => void;
  onDeleteSelection: () => void;
  onSetEdgeSymbols: (from: string, to: string, symbols: string[]) => void;
  onSetAlphabet: (symbols: string[]) => void;
}

const MODE_HELP: Record<Mode, string> = {
  select: "Click a state or arrow to select it. Drag states to move them. Press Delete to remove the selection.",
  addState: "Click on an empty part of the canvas to add a state.",
  addTransition: "Click the source state, then the target state (click the same state twice for a self-loop).",
};

export default function EditPanel(p: Props) {
  const m = p.machine;
  return (
    <div className="space-y-5">
      <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
        {p.mode === "addTransition" && p.pendingFrom
          ? `Source: ${stateLabel(m, p.pendingFrom)}. Now click the target state.`
          : MODE_HELP[p.mode]}
      </p>

      {p.pendingEdge && (
        <EdgeSymbolForm
          key={`${p.pendingEdge.from}->${p.pendingEdge.to}`}
          title={`New transition ${stateLabel(m, p.pendingEdge.from)} → ${stateLabel(m, p.pendingEdge.to)}`}
          type={m.type}
          initial=""
          submitLabel="Add transition"
          onSubmit={p.onConfirmEdge}
          onCancel={p.onCancelEdge}
        />
      )}

      {p.selection?.kind === "state" && <StateEditor {...p} id={p.selection.id} />}

      {p.selection?.kind === "edge" && (
        <EdgeEditor {...p} from={p.selection.from} to={p.selection.to} />
      )}

      <AlphabetEditor key={m.alphabet.join(",")} alphabet={m.alphabet} onSetAlphabet={p.onSetAlphabet} />

      <div>
        <SectionTitle>Checks</SectionTitle>
        {p.issues.length === 0 ? (
          <p className="text-sm text-green-700">✓ This is a valid {m.type}.</p>
        ) : (
          <ul className="space-y-1.5">
            {p.issues.map((i, k) => (
              <li key={k} className="flex items-start gap-2 text-sm">
                <Badge tone={i.severity === "error" ? "red" : "amber"}>{i.severity}</Badge>
                <span className="text-slate-700">{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StateEditor(p: Props & { id: string }) {
  const state = p.machine.states.find((s) => s.id === p.id);
  if (!state) return null;
  const isStart = p.machine.start === p.id;
  const isAccepting = p.machine.accepting.includes(p.id);
  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-3">
      <SectionTitle>Selected state</SectionTitle>
      <label className="block text-sm text-slate-700">
        Name
        <input
          className={`${inputClass} mt-1`}
          value={state.label}
          maxLength={32}
          onChange={(e) => p.onRename(p.id, e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button active={isStart} onClick={() => p.onSetStart(p.id)} disabled={isStart}>
          {isStart ? "✓ Start state" : "Make start state"}
        </Button>
        <Button active={isAccepting} onClick={() => p.onToggleAccepting(p.id)}>
          {isAccepting ? "✓ Accepting" : "Make accepting"}
        </Button>
        <Button variant="danger" onClick={p.onDeleteSelection}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function EdgeEditor(p: Props & { from: string; to: string }) {
  const symbols = p.machine.transitions.filter((t) => t.from === p.from && t.to === p.to).map((t) => t.symbol);
  if (symbols.length === 0) return null;
  return (
    <EdgeSymbolForm
      key={`${p.from}->${p.to}:${symbols.join(",")}`}
      title={`Selected transition ${stateLabel(p.machine, p.from)} → ${stateLabel(p.machine, p.to)}`}
      type={p.machine.type}
      initial={symbols.join(", ")}
      submitLabel="Update symbols"
      onSubmit={(s) => p.onSetEdgeSymbols(p.from, p.to, s)}
      onCancel={p.onDeleteSelection}
      cancelLabel="Delete"
    />
  );
}

function EdgeSymbolForm(props: {
  title: string;
  type: Automaton["type"];
  initial: string;
  submitLabel: string;
  cancelLabel?: string;
  onSubmit: (symbols: string[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(props.initial);
  const symbols = parseSymbols(text);
  const bad = symbols.filter((s) => [...s].length !== 1);
  return (
    <form
      className="space-y-2 rounded-md border border-blue-300 bg-blue-50/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (symbols.length > 0 && bad.length === 0) props.onSubmit(symbols);
      }}
    >
      <SectionTitle>{props.title}</SectionTitle>
      <label className="block text-sm text-slate-700">
        Symbols (comma-separated{props.type === "NFA" ? `; type "eps" or click ε for epsilon` : ""})
        <input
          autoFocus
          className={`${inputClass} mt-1 font-mono`}
          value={text}
          placeholder="a, b"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && props.onCancel()}
        />
      </label>
      {bad.length > 0 && <p className="text-xs text-red-700">Each symbol must be a single character.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={symbols.length === 0 || bad.length > 0}>
          {props.submitLabel}
        </Button>
        {props.type === "NFA" && (
          <Button onClick={() => setText((t) => (t.trim() ? `${t}, ${EPSILON}` : EPSILON))}>+ ε</Button>
        )}
        <Button variant={props.cancelLabel ? "danger" : "ghost"} onClick={props.onCancel}>
          {props.cancelLabel ?? "Cancel"}
        </Button>
      </div>
    </form>
  );
}

function AlphabetEditor({ alphabet, onSetAlphabet }: { alphabet: string[]; onSetAlphabet: (s: string[]) => void }) {
  const [text, setText] = useState(alphabet.join(", "));
  const commit = () => onSetAlphabet(parseSymbols(text));
  return (
    <div>
      <SectionTitle>Alphabet Σ</SectionTitle>
      <input
        className={`${inputClass} font-mono`}
        value={text}
        placeholder="e.g. 0, 1"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <p className="mt-1 text-xs text-slate-500">Symbols used on transitions are added automatically.</p>
    </div>
  );
}
