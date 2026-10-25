import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import LoopRunsChart from "@/components/LoopRunsChart";
import { listLoopRuns, type LoopRun } from "@/lib/storage/loopRuns";

export const metadata: Metadata = {
  title: "Loop history · Automata Playground",
  description: "Every run of the automated correctness audit: strategy, cases, success criteria, and fixes.",
};

const REPO = "https://github.com/jesmoral77/automata-playground";

export default function LoopHistoryPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 text-slate-900">
      <header className="space-y-2">
        <Link href="/" className="text-sm text-blue-700 underline">
          ← Automata Playground
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Correctness audit: loop history</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          A scheduled Claude Code routine fuzzes the app&apos;s NFA simulation, subset construction and DFA minimization
          against an independent brute-force reference. Each run reads this log first, replays every past failure, picks
          its generation strategy from what has broken before, and records the result here. A run passes when{" "}
          <strong>(a)</strong> ≥1,000 random cases have zero mismatches, <strong>(b)</strong> the regression corpus
          replays clean, and <strong>(c)</strong> all unit tests pass.
        </p>
      </header>
      <Suspense fallback={<p className="text-slate-500">Loading runs…</p>}>
        <History />
      </Suspense>
    </main>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function Criterion({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold ${
        ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
      }`}
      title={`Criterion ${label}: ${ok ? "pass" : "fail"}`}
    >
      {ok ? "✓" : "✕"} {label}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  pass: "bg-green-100 text-green-800",
  fixed: "bg-blue-100 text-blue-800",
  unresolved: "bg-amber-100 text-amber-900",
  fail: "bg-red-100 text-red-800",
};

async function History() {
  let runs: LoopRun[];
  try {
    runs = await listLoopRuns(200);
  } catch (e) {
    return <p className="text-red-700">Could not load the loop log: {e instanceof Error ? e.message : "error"}</p>;
  }
  if (runs.length === 0) return <p className="text-slate-600">No runs logged yet.</p>;

  const chronological = [...runs].reverse();
  const totalCases = runs.reduce((n, r) => n + r.case_count, 0);
  const runsWithBugs = runs.filter((r) => r.mismatched_cases > 0 || !r.criterion_b);
  const fixed = runs.filter((r) => r.status === "fixed").length;
  const latest = runs[0];

  // Which strategies have found bugs?
  const byStrategy = new Map<string, { runs: number; cases: number; found: number; fixed: number }>();
  for (const r of runs) {
    const s = byStrategy.get(r.strategy) ?? { runs: 0, cases: 0, found: 0, fixed: 0 };
    s.runs++;
    s.cases += r.case_count;
    if (r.mismatched_cases > 0) s.found++;
    if (r.status === "fixed") s.fixed++;
    byStrategy.set(r.strategy, s);
  }
  const strategies = [...byStrategy.entries()].sort((a, b) => b[1].found - a[1].found || b[1].runs - a[1].runs);

  return (
    <div className="space-y-8">
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Runs", runs.length.toLocaleString()],
          ["Cases checked", totalCases.toLocaleString()],
          ["Runs that found bugs", runsWithBugs.length.toLocaleString()],
          ["Bugs fixed", fixed.toLocaleString()],
          ["Regression corpus", `${latest.corpus_size} case${latest.corpus_size === 1 ? "" : "s"}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold">Cases passed per run</h2>
        <p className="mb-3 text-sm text-slate-600">
          Each bar is one run (oldest left). Runs with mismatches are marked ✕ with their count. Hover a bar for details.
        </p>
        <LoopRunsChart
          runs={chronological.map((r) => ({
            id: r.id,
            label: dateFmt.format(new Date(r.created_at)),
            strategy: r.strategy,
            cases: r.case_count,
            mismatched: r.mismatched_cases,
            criteria: [r.criterion_a, r.criterion_b, r.criterion_c],
            status: r.status,
          }))}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-base font-semibold">Which strategies find bugs</h2>
        <p className="mb-3 text-sm text-slate-600">
          The next run&apos;s planner favours strategies that have found bugs and ones not used recently.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">Strategy</th>
                <th className="py-2 pr-4 text-right">Runs</th>
                <th className="py-2 pr-4 text-right">Cases</th>
                <th className="py-2 pr-4 text-right">Runs that found bugs</th>
                <th className="py-2 text-right">Fixes</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map(([name, s]) => (
                <tr key={name} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-mono">{name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{s.runs}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{s.cases.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{s.found}</td>
                  <td className="py-2 text-right tabular-nums">{s.fixed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold">All runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">When (MT)</th>
                <th className="py-2 pr-3">Trigger</th>
                <th className="py-2 pr-3">Strategy</th>
                <th className="py-2 pr-3 text-right">Cases</th>
                <th className="py-2 pr-3">Criteria</th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 pr-3">Failures · root cause · fix</th>
                <th className="py-2">Commit</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 whitespace-nowrap">{dateFmt.format(new Date(r.created_at))}</td>
                  <td className="py-2 pr-3">{r.trigger}</td>
                  <td className="py-2 pr-3 font-mono">{r.strategy}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.case_count.toLocaleString()}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span className="flex gap-1">
                      <Criterion ok={r.criterion_a} label="a" />
                      <Criterion ok={r.criterion_b} label="b" />
                      <Criterion ok={r.criterion_c} label="c" />
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? "bg-slate-100"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="max-w-md py-2 pr-3 text-slate-700">
                    {r.mismatched_cases > 0 && (
                      <p>
                        <strong>{r.mismatched_cases}</strong> mismatched case{r.mismatched_cases === 1 ? "" : "s"}
                      </p>
                    )}
                    {r.root_cause && (
                      <p>
                        <span className="font-semibold">Cause:</span> {r.root_cause}
                      </p>
                    )}
                    {r.fix && (
                      <p>
                        <span className="font-semibold">Fix:</span> {r.fix}
                      </p>
                    )}
                    {r.notes && <p className="text-slate-500">{r.notes}</p>}
                    {!r.mismatched_cases && !r.root_cause && !r.fix && !r.notes && <span className="text-slate-400">—</span>}
                    {r.pr_url && (
                      <a href={r.pr_url} className="text-blue-700 underline">
                        Pull request
                      </a>
                    )}
                  </td>
                  <td className="py-2 font-mono text-xs">
                    {r.commit_hash ? (
                      <a href={`${REPO}/commit/${r.commit_hash}`} className="text-blue-700 underline">
                        {r.commit_hash.slice(0, 7)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
