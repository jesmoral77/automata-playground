"use client";

import { useEffect, useMemo, useState } from "react";
import {
  accepts,
  analyzePumping,
  Automaton,
  hasErrors,
  Issue,
  minimizeDfa,
  pump,
  PUMPING_LANGUAGES,
  pumpingDecomposition,
  Split,
  stateLabel,
  subsetConstruction,
  suggestPumpableStrings,
  Transition,
} from "@/lib/automata";
import { Highlight } from "./AutomatonCanvas";
import { Badge, Button, inputClass, SectionTitle } from "./ui";

interface Props {
  machine: Automaton;
  issues: Issue[];
  onHighlight: (h: Highlight | null) => void;
}

/** Show long words compactly. */
function fmt(w: string): string {
  if (w === "") return "ε";
  const chars = [...w];
  if (chars.length <= 40) return w;
  return `${chars.slice(0, 16).join("")}…${chars.slice(-16).join("")} (length ${chars.length})`;
}

function SplitView({ x, y, z }: Split) {
  return (
    <span className="font-mono">
      <span className="text-slate-500">{fmt(x) === "ε" ? "" : fmt(x)}</span>
      <span className="rounded bg-amber-200 px-0.5 text-slate-900">{fmt(y)}</span>
      <span className="text-slate-800">{z === "" ? "" : fmt(z)}</span>
    </span>
  );
}

export default function PumpingPanel(props: Props) {
  const [mode, setMode] = useState<"prove" | "machine">("prove");
  return (
    <div className="space-y-5">
      <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
        <strong>Pumping lemma.</strong> If L is regular, there is a p such that every s ∈ L with |s| ≥ p can be split
        s = xyz with |y| ≥ 1 and |xy| ≤ p, so that xyⁱz ∈ L for every i ≥ 0.
      </div>
      <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm" role="group">
        {(
          [
            ["prove", "Prove a language is not regular"],
            ["machine", "See it on this machine"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex-1 px-3 py-1.5 font-medium ${mode === id ? "bg-slate-800 text-white" : "bg-white hover:bg-slate-50"}`}
          >
            {text}
          </button>
        ))}
      </div>
      {mode === "prove" ? <ProveNotRegular /> : <OnMachine {...props} />}
    </div>
  );
}

function ProveNotRegular() {
  const [langId, setLangId] = useState(PUMPING_LANGUAGES[0].id);
  const [p, setP] = useState(4);
  const lang = PUMPING_LANGUAGES.find((l) => l.id === langId)!;
  const [s, setS] = useState(() => lang.suggest(4));
  const [showAll, setShowAll] = useState(false);

  const analysis = useMemo(
    () => analyzePumping(lang.contains, s, p, lang.maxI?.(s) ?? 5),
    [lang, s, p],
  );

  const choose = (id: string, newP: number) => {
    const l = PUMPING_LANGUAGES.find((x) => x.id === id)!;
    setLangId(id);
    setP(newP);
    setS(l.suggest(newP));
    setShowAll(false);
  };

  const failing = analysis.splits.filter((sp) => sp.failsAt !== null);
  const surviving = analysis.splits.filter((sp) => sp.failsAt === null);
  // Show surviving splits first: they are the ones that break the argument.
  const ordered = [...surviving, ...failing];
  const visible = showAll ? ordered : ordered.slice(0, 12);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-700">
        To prove L is <em>not</em> regular: assume it is, with pumping length p. Pick a string s ∈ L with |s| ≥ p, then
        show that <strong>every</strong> legal split xyz has some i with xyⁱz ∉ L. This tool checks every split for the
        p you choose; your written proof must argue it for a general p.
      </p>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="text-sm text-slate-700">
          Language
          <select className={`${inputClass} mt-1`} value={langId} onChange={(e) => choose(e.target.value, p)}>
            {PUMPING_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          p
          <input
            type="number"
            min={1}
            max={12}
            className={`${inputClass} mt-1 w-20`}
            value={p}
            onChange={(e) => choose(langId, Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
          />
        </label>
      </div>

      <div>
        <SectionTitle>String s</SectionTitle>
        <div className="flex gap-2">
          <input
            className={`${inputClass} font-mono`}
            value={s}
            onChange={(e) => setS(e.target.value)}
            placeholder={`a string in L of length ≥ ${p}`}
          />
          <Button onClick={() => setS(lang.suggest(p))}>Suggest</Button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Alphabet: {`{${lang.alphabet.join(", ")}}`} · Suggested: <span className="font-mono">{fmt(lang.suggest(p))}</span>
        </p>
      </div>

      {!analysis.inLanguage ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">s is not in L. The string you pick must be in the language.</p>
      ) : !analysis.longEnough ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          |s| = {[...s].length} is shorter than p = {p}. The lemma only applies to strings of length at least p.
        </p>
      ) : (
        <>
          <div
            className={`rounded-md border p-3 text-sm ${
              analysis.allSplitsFail ? "border-green-300 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-900"
            }`}
          >
            {analysis.allSplitsFail ? (
              <>
                <strong>This string works.</strong> All {analysis.splits.length} legal splits can be pumped out of L, which
                contradicts the pumping lemma for p = {p}.
              </>
            ) : (
              <>
                <strong>This string doesn&apos;t work.</strong> {surviving.length} of {analysis.splits.length} split
                {analysis.splits.length === 1 ? "" : "s"} stayed in L for every i tried, so the adversary can pick one of
                those. Try a different s{lang.regular ? " — or notice that this language is regular" : ""}.
              </>
            )}
          </div>
          <p className="text-sm text-slate-700">
            <strong>Why: </strong>
            {lang.explanation}
          </p>

          <div>
            <SectionTitle>
              Every split with |xy| ≤ {p}, |y| ≥ 1 (x, <span className="rounded bg-amber-200 px-0.5">y</span>, z)
            </SectionTitle>
            <ul className="space-y-1.5 text-sm">
              {visible.map((sp, k) => {
                const last = sp.tries[sp.tries.length - 1];
                return (
                  <li key={k} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-1.5">
                    <Badge tone={sp.failsAt !== null ? "green" : "red"}>{sp.failsAt !== null ? "fails" : "pumps"}</Badge>
                    <SplitView {...sp} />
                    <span className="text-slate-600">
                      {sp.failsAt !== null ? (
                        <>
                          → i = {sp.failsAt}: <span className="font-mono">{fmt(last.word)}</span> ∉ L
                        </>
                      ) : (
                        <>→ stays in L for i = 0…{sp.tries[sp.tries.length - 1]?.i ?? 0}</>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {ordered.length > visible.length && (
              <Button variant="ghost" className="mt-2" onClick={() => setShowAll(true)}>
                Show all {ordered.length} splits
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OnMachine({ machine, issues, onHighlight }: Props) {
  const errors = hasErrors(issues);
  const working = useMemo(
    () => (errors || machine.start === null ? null : machine.type === "DFA" ? machine : subsetConstruction(machine).dfa),
    [machine, errors],
  );
  const minimalSize = useMemo(() => (working ? minimizeDfa(working).minimized.states.length : 0), [working]);
  const suggestions = useMemo(() => (working ? suggestPumpableStrings(working, 6) : []), [working]);
  const [typed, setTyped] = useState<string | null>(null);
  const s = typed ?? suggestions[0] ?? "";
  const d = useMemo(() => (working ? pumpingDecomposition(working, s) : null), [working, s]);

  // Highlight the loop on the diagram when the machine itself is the DFA being used.
  const highlight = useMemo<Highlight | null>(() => {
    if (!d || machine.type !== "DFA") return null;
    const chars = [...s];
    const start = [...d.x].length;
    const taken: Transition[] = [];
    for (let k = start; k < start + [...d.y].length; k++) {
      taken.push({ from: d.run[k], to: d.run[k + 1], symbol: chars[k] });
    }
    return { active: [d.loopState], taken };
  }, [d, s, machine.type]);
  useEffect(() => onHighlight(highlight), [highlight, onHighlight]);
  useEffect(() => () => onHighlight(null), [onHighlight]);

  if (!working) {
    return <p className="text-sm text-red-700">Fix the errors in the Edit tab first.</p>;
  }
  const p = working.states.length;
  const label = (id: string) => stateLabel(working, id);
  const rejectedReason =
    !d && s !== ""
      ? [...s].length < p
        ? `"${fmt(s)}" is shorter than p = ${p}.`
        : !accepts(working, s)
          ? `"${fmt(s)}" is not accepted by the machine.`
          : null
      : null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-700">
        Every regular language satisfies the lemma. For a DFA with p states, reading any accepted string of length ≥ p
        visits p + 1 states, so some state repeats (pigeonhole principle). The input read between the two visits is y:
        it loops back to the same state, so it can be repeated or removed.
      </p>
      <p className="text-sm text-slate-700">
        {machine.type === "NFA" && "Using the DFA from subset construction. "}
        Pumping length <strong>p = {p}</strong> (the number of DFA states)
        {minimalSize < p && <> — the minimal DFA has {minimalSize} states, so p = {minimalSize} also works</>}.
      </p>

      {suggestions.length === 0 ? (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          This machine accepts no strings of length ≥ {p}, so its language is <strong>finite</strong>. The lemma holds
          automatically (there is nothing to pump).
        </p>
      ) : (
        <>
          <div>
            <SectionTitle>Strings to test (accepted, length ≥ p)</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((w) => (
                <Button key={w} active={w === s} onClick={() => setTyped(w)} className="font-mono">
                  {fmt(w)}
                </Button>
              ))}
            </div>
            <input
              className={`${inputClass} mt-2 font-mono`}
              value={s}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="or type your own accepted string"
            />
          </div>

          {rejectedReason && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{rejectedReason}</p>}

          {d && (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="mb-2 text-lg">
                  <SplitView {...d} />
                </p>
                <p className="font-mono text-slate-700">
                  x = {fmt(d.x)}, y = {fmt(d.y)}, z = {fmt(d.z)}
                </p>
                <p className="mt-2 text-slate-700">
                  After reading x the machine is in <strong className="font-mono">{label(d.loopState)}</strong>, and reading
                  y brings it back to <strong className="font-mono">{label(d.loopState)}</strong>
                  {machine.type === "DFA" && " (highlighted on the diagram)"}. Here |y| = {[...d.y].length} ≥ 1 and |xy| ={" "}
                  {[...d.x + d.y].length} ≤ p.
                </p>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1 pr-2">i</th>
                    <th className="py-1 pr-2">xyⁱz</th>
                    <th className="py-1">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4].map((i) => {
                    const w = pump(d, i);
                    const ok = accepts(working, w);
                    return (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-1 pr-2 font-mono">{i}</td>
                        <td className="py-1 pr-2 font-mono">{fmt(w)}</td>
                        <td className="py-1">
                          <Badge tone={ok ? "green" : "red"}>{ok ? "accepted" : "rejected"}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-slate-500">
                State sequence: <span className="font-mono">{d.run.slice(0, p + 1).map(label).join(" → ")}</span>
                {d.run.length > p + 1 && " → …"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
