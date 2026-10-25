"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Core } from "cytoscape";
import {
  addState,
  addTransitions,
  Automaton,
  emptyAutomaton,
  EXAMPLES,
  hasErrors,
  MachineType,
  moveState,
  removeEdge,
  removeState,
  renameState,
  setAlphabet,
  setEdgeSymbols,
  setStart,
  toggleAccepting,
  validate,
} from "@/lib/automata";
import {
  editTokenFor,
  forgetMachine,
  loadMyMachines,
  MyMachine,
  saveMachine,
  subscribeMyMachines,
} from "@/lib/storage/client";
import AutomatonCanvas, { Highlight, Selection } from "./AutomatonCanvas";
import EditPanel, { Mode } from "./EditPanel";
import FormalPanel from "./FormalPanel";
import MinimizePanel from "./MinimizePanel";
import PumpingPanel from "./PumpingPanel";
import SubsetPanel from "./SubsetPanel";
import TestPanel from "./TestPanel";
import { Button } from "./ui";

type Tab = "edit" | "test" | "convert" | "minimize" | "pumping" | "formal";

const TABS: { id: Tab; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "test", label: "Test" },
  { id: "convert", label: "NFA→DFA" },
  { id: "minimize", label: "Minimize" },
  { id: "pumping", label: "Pumping" },
  { id: "formal", label: "Formal" },
];

const DRAFT_KEY = "automata-playground:draft";

interface Props {
  /** Set when viewing a saved machine at /m/[id]. */
  initial?: { id: string; name: string; machine: Automaton };
}

interface History {
  past: Automaton[];
  present: Automaton;
  future: Automaton[];
  /** Consecutive edits with the same key (e.g. typing a name) share one undo step. */
  lastKey: string | null;
}

export default function Playground({ initial }: Props) {
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: initial?.machine ?? EXAMPLES[0].machine,
    future: [],
    lastKey: null,
  }));
  const machine = history.present;
  const [name, setName] = useState(initial?.name ?? EXAMPLES[0].name);
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<Tab>("edit");
  const [mode, setMode] = useState<Mode>("select");
  const [selection, setSelection] = useState<Selection>(null);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [pendingEdge, setPendingEdge] = useState<{ from: string; to: string } | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const cyRef = useRef<Core | null>(null);

  const issues = useMemo(() => validate(machine), [machine]);

  // This browser "owns" a saved machine if it holds the edit token (localStorage).
  const owned = useSyncExternalStore(
    subscribeMyMachines,
    () => savedId !== null && editTokenFor(savedId) !== null,
    () => false,
  );

  /** Apply an edit. Pass `key` to merge with the previous edit of the same kind. */
  const commit = useCallback((next: Automaton | ((m: Automaton) => Automaton), key: string | null = null, track = true) => {
    setHistory((h) => {
      const value = typeof next === "function" ? next(h.present) : next;
      if (value === h.present) return h;
      if (!track) return { ...h, present: value };
      const merge = key !== null && key === h.lastKey;
      return {
        past: merge ? h.past : [...h.past.slice(-99), h.present],
        present: value,
        future: [],
        lastKey: key,
      };
    });
    if (track) setDirty(true);
  }, []);

  const undo = useCallback(() => {
    setHistory((h) =>
      h.past.length === 0
        ? h
        : { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null },
    );
    setDirty(true);
  }, []);

  const redo = useCallback(() => {
    setHistory((h) =>
      h.future.length === 0
        ? h
        : { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null },
    );
    setDirty(true);
  }, []);

  const clearTransient = () => {
    setSelection(null);
    setPendingFrom(null);
    setPendingEdge(null);
  };

  /** Replace the whole machine (example, new, import, conversion result). */
  const loadMachine = (m: Automaton, newName: string, opts: { keepId?: boolean } = {}) => {
    commit(m);
    setName(newName);
    clearTransient();
    setFitKey((k) => k + 1);
    if (!opts.keepId) {
      setSavedId(null);
      if (window.location.pathname !== "/") window.history.replaceState(null, "", "/");
    }
  };

  // On the home page, restore the unsaved draft from last time.
  const restored = useRef(false);
  useEffect(() => {
    if (initial || restored.current) return;
    restored.current = true;
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (draft?.machine) {
        // Restoring from localStorage must happen after hydration, so it runs in an effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHistory({ past: [], present: draft.machine, future: [], lastKey: null });
        setName(draft.name ?? "Untitled");
        setSavedId(draft.savedId ?? null);
        setFitKey((k) => k + 1);
      }
    } catch {
      // Ignore a corrupt draft.
    }
  }, [initial]);

  // Autosave a local draft (not to the database) while editing on the home page.
  useEffect(() => {
    if (!restored.current || savedId) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ machine, name, savedId }));
    } catch {
      // Storage unavailable.
    }
  }, [machine, name, savedId]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.kind === "state") commit((m) => removeState(m, selection.id));
    else commit((m) => removeEdge(m, selection.from, selection.to));
    setSelection(null);
  }, [selection, commit]);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod) {
        return;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelection();
      } else if (e.key === "Escape") {
        clearTransient();
        setMode("select");
      } else if (e.key === "v") setMode("select");
      else if (e.key === "s") setMode("addState");
      else if (e.key === "t") setMode("addTransition");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelection]);

  const changeMode = (m: Mode) => {
    setMode(m);
    setPendingFrom(null);
    setPendingEdge(null);
    if (m !== "select") setSelection(null);
    setTab("edit");
  };

  // Canvas interactions.
  const onBackgroundTap = (x: number, y: number) => {
    if (mode === "addState") commit((m) => addState(m, Math.round(x), Math.round(y)));
    else clearTransient();
  };

  const onNodeTap = (id: string) => {
    if (mode === "addTransition") {
      if (pendingFrom === null) {
        setPendingFrom(id);
        setPendingEdge(null);
      } else {
        setPendingEdge({ from: pendingFrom, to: id });
        setPendingFrom(null);
      }
      setTab("edit");
    } else {
      setSelection({ kind: "state", id });
      setTab("edit");
    }
  };

  const onEdgeTap = (from: string, to: string) => {
    if (mode === "addTransition") return;
    setSelection({ kind: "edge", from, to });
    setTab("edit");
  };

  const onNodeMoved = (id: string, x: number, y: number) => commit((m) => moveState(m, id, x, y), null);

  const onAutoLayout = (positions: Record<string, { x: number; y: number }>) =>
    commit(
      (m) => ({
        ...m,
        states: m.states.map((s) => (positions[s.id] && (s.x === undefined || s.y === undefined) ? { ...s, ...positions[s.id] } : s)),
      }),
      null,
      false,
    );

  const relayout = () => {
    commit((m) => ({ ...m, states: m.states.map(({ id, label }) => ({ id, label })) }));
    setFitKey((k) => k + 1);
  };

  // Saving and sharing.
  const shareUrl = savedId ? `${typeof window === "undefined" ? "" : window.location.origin}/m/${savedId}` : null;

  const save = async (): Promise<string | null> => {
    setSaving(true);
    setStatus(null);
    try {
      const { id, created } = await saveMachine(owned ? savedId : null, name, machine);
      setSavedId(id);
      setDirty(false);
      if (window.location.pathname !== `/m/${id}`) window.history.replaceState(null, "", `/m/${id}`);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      setStatus({ tone: "ok", text: created ? "Saved. Anyone with the link can view it." : "Saved changes." });
      return id;
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "Save failed." });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    let id = savedId;
    if (!id || dirty || !owned) id = await save();
    if (!id) return;
    const url = `${window.location.origin}/m/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ tone: "ok", text: `Link copied: ${url}` });
    } catch {
      setStatus({ tone: "info", text: `Share this link: ${url}` });
    }
  };

  const setType = (type: MachineType) => commit((m) => ({ ...m, type }));
  const errors = hasErrors(issues);

  return (
    <div className="flex h-screen min-h-[600px] flex-col bg-slate-100 text-slate-900">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Link href="/" className="mr-2 text-lg font-bold tracking-tight text-slate-900">
          Automata Playground
        </Link>
        <input
          aria-label="Machine name"
          className="w-48 rounded-md border border-transparent px-2 py-1 text-sm font-medium hover:border-slate-300 focus:border-blue-500 focus:outline-none"
          value={name}
          maxLength={100}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm" role="group" aria-label="Machine type">
          {(["DFA", "NFA"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1.5 font-medium ${machine.type === t ? "bg-slate-800 text-white" : "bg-white hover:bg-slate-50"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <select
          aria-label="Load an example"
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          value=""
          onChange={(e) => {
            const ex = EXAMPLES[Number(e.target.value)];
            if (ex) loadMachine(ex.machine, ex.name);
          }}
        >
          <option value="">Examples…</option>
          {EXAMPLES.map((ex, i) => (
            <option key={ex.name} value={i}>
              {ex.machine.type}: {ex.name}
            </option>
          ))}
        </select>
        <Button onClick={() => loadMachine(emptyAutomaton(machine.type), "Untitled")}>New</Button>
        <Button variant="ghost" onClick={undo} disabled={history.past.length === 0} title="Undo (Ctrl+Z)">
          ↶ Undo
        </Button>
        <Button variant="ghost" onClick={redo} disabled={history.future.length === 0} title="Redo (Ctrl+Y)">
          ↷ Redo
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <MyMachinesMenu currentId={savedId} />
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : savedId && !owned ? "Save a copy" : "Save"}
          </Button>
          <Button variant="primary" onClick={share} disabled={saving}>
            Share link
          </Button>
        </div>
      </header>

      {(status || (savedId && !owned)) && (
        <div
          className={`border-b px-4 py-1.5 text-sm ${
            status?.tone === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : status
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-blue-200 bg-blue-50 text-blue-800"
          }`}
        >
          {status?.text ??
            "You're viewing a shared machine. Feel free to edit it; saving creates your own copy with a new link."}
          {status && shareUrl && status.tone !== "error" && !status.text.includes(shareUrl) && (
            <span className="ml-2 font-mono text-xs">{shareUrl}</span>
          )}
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative min-h-[360px] flex-1 bg-white lg:border-r lg:border-slate-200">
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm">
            <Button variant="ghost" active={mode === "select"} onClick={() => changeMode("select")} title="Select / move (V)">
              Select
            </Button>
            <Button variant="ghost" active={mode === "addState"} onClick={() => changeMode("addState")} title="Add state (S)">
              + State
            </Button>
            <Button
              variant="ghost"
              active={mode === "addTransition"}
              onClick={() => changeMode("addTransition")}
              title="Add transition (T)"
            >
              + Transition
            </Button>
            <span className="mx-1 w-px bg-slate-200" />
            <Button variant="ghost" onClick={() => cyRef.current?.fit(undefined, 50)} title="Fit diagram to view">
              Fit
            </Button>
            <Button variant="ghost" onClick={relayout} title="Automatically arrange states">
              Auto-layout
            </Button>
          </div>
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 text-xs text-slate-500">
            <span className={`h-2 w-2 rounded-full ${errors ? "bg-red-500" : "bg-green-500"}`} />
            {errors ? `Not a valid ${machine.type} yet` : `Valid ${machine.type}`} · {machine.states.length} states ·{" "}
            {machine.transitions.length} transitions
          </div>
          {machine.states.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400">
              Choose “+ State” and click here to add your first state.
            </div>
          )}
          <AutomatonCanvas
            machine={machine}
            highlight={tab === "test" || tab === "pumping" ? highlight : null}
            selection={selection}
            pendingFrom={pendingFrom}
            fitKey={fitKey}
            onBackgroundTap={onBackgroundTap}
            onNodeTap={onNodeTap}
            onEdgeTap={onEdgeTap}
            onNodeMoved={onNodeMoved}
            onAutoLayout={onAutoLayout}
            onReady={(cy) => (cyRef.current = cy)}
            className={`h-full w-full ${mode === "addState" ? "cursor-crosshair" : ""}`}
          />
        </section>

        <aside className="flex max-h-[60vh] w-full flex-col bg-white lg:max-h-none lg:w-[440px]">
          <div
            role="tablist"
            aria-label="Tools"
            className="flex border-b border-slate-200"
            onKeyDown={(e) => {
              // Arrow keys move between tabs (WAI-ARIA tabs pattern).
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              const i = TABS.findIndex((t) => t.id === tab);
              const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
              setTab(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="tool-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`flex-1 px-1 py-2.5 text-[13px] font-medium whitespace-nowrap ${
                  tab === t.id ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div id="tool-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "edit" && (
              <EditPanel
                machine={machine}
                issues={issues}
                mode={mode}
                selection={selection}
                pendingFrom={pendingFrom}
                pendingEdge={pendingEdge}
                onConfirmEdge={(symbols) => {
                  if (pendingEdge) commit((m) => addTransitions(m, pendingEdge.from, pendingEdge.to, symbols));
                  setPendingEdge(null);
                }}
                onCancelEdge={() => setPendingEdge(null)}
                onRename={(id, label) => commit((m) => renameState(m, id, label), `rename:${id}`)}
                onSetStart={(id) => commit((m) => setStart(m, id))}
                onToggleAccepting={(id) => commit((m) => toggleAccepting(m, id))}
                onDeleteSelection={deleteSelection}
                onSetEdgeSymbols={(from, to, symbols) => commit((m) => setEdgeSymbols(m, from, to, symbols))}
                onSetAlphabet={(symbols) => commit((m) => setAlphabet(m, symbols))}
              />
            )}
            {tab === "test" && <TestPanel machine={machine} issues={issues} onHighlight={setHighlight} />}
            {tab === "convert" && (
              <SubsetPanel
                machine={machine}
                issues={issues}
                onOpenInEditor={(dfa) => {
                  loadMachine(dfa, `${name} (DFA)`);
                  setTab("edit");
                }}
              />
            )}
            {tab === "minimize" && (
              <MinimizePanel
                machine={machine}
                issues={issues}
                onOpenInEditor={(dfa) => {
                  loadMachine(dfa, `${name} (minimal)`);
                  setTab("edit");
                }}
              />
            )}
            {tab === "pumping" && <PumpingPanel machine={machine} issues={issues} onHighlight={setHighlight} />}
            {tab === "formal" && <FormalPanel machine={machine} onImport={(m) => loadMachine(m, name, { keepId: true })} />}
          </div>
        </aside>
      </main>
    </div>
  );
}

function MyMachinesMenu({ currentId }: { currentId: string | null }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<MyMachine[]>([]);
  return (
    <div className="relative">
      <Button
        variant="ghost"
        onClick={() => {
          setList(loadMyMachines());
          setOpen((o) => !o);
        }}
      >
        My machines ▾
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
          {list.length === 0 ? (
            <p className="p-2 text-sm text-slate-500">Machines you save in this browser will appear here.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {list.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
                  <a href={`/m/${m.id}`} className="flex-1 truncate text-sm" onClick={() => setOpen(false)}>
                    <span className="mr-1 text-xs font-semibold text-slate-500">{m.type}</span>
                    {m.name}
                    {m.id === currentId && <span className="ml-1 text-xs text-blue-600">(open)</span>}
                  </a>
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-red-600"
                    title="Remove from this list (the shared link keeps working)"
                    onClick={() => {
                      forgetMachine(m.id);
                      setList(loadMyMachines());
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 border-t border-slate-100 px-2 pt-2 text-xs text-slate-500">
            Stored in this browser only. Accounts will sync this list across devices.
          </p>
        </div>
      )}
    </div>
  );
}
