// Read and write the loop log (the loop_runs table, through the app's API),
// choose the next strategy from history, and manage the regression corpus.
//
//   npm run fuzz:log -- history [--limit 20]
//   npm run fuzz:log -- plan
//   npm run fuzz:log -- post --status pass|fixed|unresolved|fail [--root-cause ..] [--fix ..]
//                            [--commit ..] [--pr ..] [--trigger manual|schedule|local] [--notes ..]
//   npm run fuzz:log -- corpus-add --index N --status open|fixed [--root-cause ..] [--fix ..] [--commit ..]
//   npm run fuzz:log -- corpus-mark --id ID --status fixed [--fix ..] [--commit ..]
//
// The API base URL is LOOP_API_URL (default below). Writes send LOOP_INGEST_TOKEN
// as a bearer token when it is set (locally, from .env.local). In a cloud run the
// token is not in the environment at all: the cloud environment's network
// secret attaches it to requests for the API host.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readCorpus, writeCorpus, type CorpusEntry } from "./corpus";
import { STRATEGIES } from "./generate";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LAST_RUN = fileURLToPath(new URL("./.last-run.json", import.meta.url));

// Load .env.local (if present) without overriding real environment variables.
const envFile = `${ROOT}.env.local`;
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const API = (process.env.LOOP_API_URL ?? "https://automata-fuzz-loop.vercel.app").replace(/\/$/, "");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export interface LoopRun {
  id: number;
  created_at: string;
  seed: number;
  strategy: string;
  case_count: number;
  mismatched_cases: number;
  criterion_a: boolean;
  criterion_b: boolean;
  criterion_c: boolean;
  status: string;
  failing_cases: unknown[];
  root_cause: string | null;
  fix: string | null;
  commit_hash: string | null;
  pr_url: string | null;
}

async function history(limit = 50): Promise<LoopRun[]> {
  const res = await fetch(`${API}/api/loop-runs?limit=${limit}`);
  if (!res.ok) throw new Error(`GET /api/loop-runs failed: ${res.status} ${await res.text()}`);
  return (await res.json()).runs as LoopRun[];
}

/**
 * Choose the next strategy from history (deterministic for a given history):
 * favour strategies that found bugs (exploit), favour ones not used recently
 * (explore), and avoid repeating the previous run's strategy unless it just
 * found a bug (then re-run it once to look for more of the same class).
 */
function plan(runs: LoopRun[]) {
  const newestFirst = [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const last = newestFirst[0];
  const scores = STRATEGIES.map((s) => {
    const used = newestFirst.filter((r) => r.strategy === s.name);
    const bugs = used.filter((r) => r.mismatched_cases > 0).length;
    const lastUsedAgo = newestFirst.findIndex((r) => r.strategy === s.name);
    const staleness = lastUsedAgo === -1 ? 5 : Math.min(lastUsedAgo, 4);
    let score = 1 + 3 * bugs + 0.75 * staleness;
    const reasons = [`${used.length} past runs`, `${bugs} found bugs`, lastUsedAgo === -1 ? "never used" : `last used ${lastUsedAgo} runs ago`];
    if (last && last.strategy === s.name) {
      if (last.mismatched_cases > 0) {
        score += 2;
        reasons.push("previous run found a bug with it: re-run to look for more of that class");
      } else {
        score -= 10;
        reasons.push("used by the previous run with no findings: vary");
      }
    }
    return { strategy: s.name, score: Math.round(score * 100) / 100, reasons };
  }).sort((a, b) => b.score - a.score || a.strategy.localeCompare(b.strategy));
  const openCorpus = readCorpus().filter((e) => e.status === "open").map((e) => e.id);
  return { recommended: scores[0].strategy, ranking: scores, previousRun: last ?? null, openCorpusEntries: openCorpus };
}

async function post() {
  const summary = JSON.parse(readFileSync(LAST_RUN, "utf8"));
  const body = {
    summary,
    status: arg("status") ?? (summary.pass ? "pass" : "fail"),
    root_cause: arg("root-cause") ?? null,
    fix: arg("fix") ?? null,
    commit_hash: arg("commit") ?? summary.commit ?? null,
    pr_url: arg("pr") ?? null,
    trigger: arg("trigger") ?? "manual",
    notes: arg("notes") ?? null,
  };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.LOOP_INGEST_TOKEN) headers.authorization = `Bearer ${process.env.LOOP_INGEST_TOKEN}`;
  const res = await fetch(`${API}/api/loop-runs`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST /api/loop-runs failed: ${res.status} ${text}`);
  return JSON.parse(text);
}

function corpusAdd() {
  const summary = JSON.parse(readFileSync(LAST_RUN, "utf8"));
  const index = Number(arg("index"));
  const failing = summary.failingCases.find((f: { caseIndex: number }) => f.caseIndex === index);
  if (!failing) throw new Error(`No failing case with index ${index} in the last run.`);
  const corpus = readCorpus();
  const entry: CorpusEntry = {
    id: `${summary.strategy}-${summary.seed}-${index}`,
    addedAt: new Date().toISOString(),
    origin: { seed: summary.seed, strategy: summary.strategy, caseIndex: index },
    kind: failing.mismatches[0]?.kind ?? "crash",
    detail: failing.mismatches[0]?.detail ?? "",
    case: failing.case,
    status: (arg("status") as CorpusEntry["status"]) ?? "open",
    rootCause: arg("root-cause"),
    fix: arg("fix"),
    fixCommit: arg("commit"),
  };
  if (corpus.some((e) => e.id === entry.id)) throw new Error(`Corpus already has ${entry.id}.`);
  writeCorpus([...corpus, entry]);
  return entry;
}

function corpusMark() {
  const id = arg("id");
  const corpus = readCorpus();
  const entry = corpus.find((e) => e.id === id);
  if (!entry) throw new Error(`No corpus entry ${id}.`);
  entry.status = (arg("status") as CorpusEntry["status"]) ?? entry.status;
  entry.fix = arg("fix") ?? entry.fix;
  entry.fixCommit = arg("commit") ?? entry.fixCommit;
  entry.rootCause = arg("root-cause") ?? entry.rootCause;
  writeCorpus(corpus);
  return entry;
}

async function main() {
  const cmd = process.argv[2];
  let out: unknown;
  if (cmd === "history") out = await history(Number(arg("limit") ?? 50));
  else if (cmd === "plan") out = plan(await history(200));
  else if (cmd === "post") out = await post();
  else if (cmd === "corpus-add") out = corpusAdd();
  else if (cmd === "corpus-mark") out = corpusMark();
  else throw new Error("Usage: fuzz:log -- history | plan | post | corpus-add | corpus-mark (see fuzz/log.ts)");
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
});
