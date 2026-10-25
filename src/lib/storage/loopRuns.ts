// Server-only access to the fuzz-audit loop log (public.loop_runs).

import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "./supabase";

export interface LoopRun {
  id: number;
  created_at: string;
  trigger: string;
  seed: number;
  strategy: string;
  case_count: number;
  mismatched_cases: number;
  criterion_a: boolean;
  criterion_b: boolean;
  criterion_c: boolean;
  corpus_size: number;
  unit_passed: number | null;
  unit_failed: number | null;
  status: string;
  failing_cases: unknown[];
  root_cause: string | null;
  fix: string | null;
  commit_hash: string | null;
  branch: string | null;
  pr_url: string | null;
  notes: string | null;
  duration_ms: number | null;
}

/** Columns safe to show publicly (everything except the bulky raw summary). */
const PUBLIC_COLUMNS =
  "id, created_at, trigger, seed, strategy, case_count, mismatched_cases, criterion_a, criterion_b, criterion_c, " +
  "corpus_size, unit_passed, unit_failed, status, failing_cases, root_cause, fix, commit_hash, branch, pr_url, notes, duration_ms";

export async function listLoopRuns(limit = 100): Promise<LoopRun[]> {
  const { data, error } = await db()
    .from("loop_runs")
    .select(PUBLIC_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500))
    .returns<LoopRun[]>();
  if (error) throw new Error(`Could not load loop runs: ${error.message}`);
  return data;
}

/** Constant-time check of a bearer token against LOOP_INGEST_TOKEN. */
export function ingestTokenValid(header: string | null): boolean {
  const expected = process.env.LOOP_INGEST_TOKEN;
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const a = createHash("sha256").update(header.slice(7)).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export class InvalidRunError extends Error {}

const STATUSES = new Set(["pass", "fixed", "unresolved", "fail"]);
const TRIGGERS = new Set(["schedule", "manual", "local"]);

function text(v: unknown, max = 4000): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** Validate a POST body from `npm run fuzz:log -- post` and insert it. */
export async function insertLoopRun(body: unknown): Promise<{ id: number }> {
  if (typeof body !== "object" || body === null) throw new InvalidRunError("Body must be an object.");
  const b = body as Record<string, unknown>;
  const s = b.summary as Record<string, unknown> | undefined;
  const criteria = s?.criteria as Record<string, Record<string, unknown>> | undefined;
  if (!s || !criteria?.a || !criteria.b || !criteria.c) throw new InvalidRunError("summary.criteria a/b/c are required.");
  if (typeof s.seed !== "number" || typeof s.strategy !== "string" || typeof s.caseCount !== "number") {
    throw new InvalidRunError("summary.seed, summary.strategy and summary.caseCount are required.");
  }
  const status = String(b.status ?? "");
  if (!STATUSES.has(status)) throw new InvalidRunError(`status must be one of ${[...STATUSES].join(", ")}.`);
  const trigger = TRIGGERS.has(String(b.trigger)) ? String(b.trigger) : "manual";
  // For fix runs, what was found comes from the failing run that preceded the fix.
  const detection = b.detection as Record<string, unknown> | null | undefined;
  const detectionA = (detection?.criteria as Record<string, Record<string, unknown>> | undefined)?.a;

  const row = {
    trigger,
    seed: s.seed,
    strategy: s.strategy.slice(0, 64),
    strategy_params: s.strategyParams ?? {},
    case_count: s.caseCount,
    mismatched_cases: Number(detectionA?.mismatchedCases ?? criteria.a.mismatchedCases ?? 0),
    criterion_a: criteria.a.pass === true,
    criterion_b: criteria.b.pass === true,
    criterion_c: criteria.c.pass === true,
    corpus_size: Number(criteria.b.corpusSize ?? 0),
    unit_passed: typeof criteria.c.passed === "number" ? criteria.c.passed : null,
    unit_failed: typeof criteria.c.failed === "number" ? criteria.c.failed : null,
    status,
    failing_cases: (Array.isArray(detection?.failingCases) ? detection.failingCases : Array.isArray(s.failingCases) ? s.failingCases : []).slice(0, 10),
    root_cause: text(b.root_cause),
    fix: text(b.fix),
    commit_hash: text(b.commit_hash, 64),
    branch: text(s.branch, 200),
    pr_url: text(b.pr_url, 500),
    notes: text(b.notes),
    duration_ms: typeof s.durationMs === "number" ? Math.round(s.durationMs) : null,
    summary: detection ? { ...s, detection } : s,
  };
  const { data, error } = await db().from("loop_runs").insert(row).select("id").single<{ id: number }>();
  if (error) throw new Error(`Could not save loop run: ${error.message}`);
  return data;
}
