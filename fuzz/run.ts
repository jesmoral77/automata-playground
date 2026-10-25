// Fuzz audit runner. Prints a machine-readable JSON summary of the three
// success criteria to stdout (progress goes to stderr) and saves it to
// fuzz/.last-run.json.
//
//   npm run fuzz -- --seed 123 --cases 1000 --strategy baseline
//   npm run fuzz -- --no-unit            (skip criterion c, for quick iteration only)

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCase, shrinkCase, type Mismatch } from "./check";
import { readCorpus } from "./corpus";
import { caseSeed, generateCase, strategyByName, type FuzzCase } from "./generate";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const LAST_RUN_PATH = join(ROOT, "fuzz", ".last-run.json");
/** The most recent run that did NOT pass: kept so a later fix run can still log what it found. */
export const LAST_FAILING_RUN_PATH = join(ROOT, "fuzz", ".last-failing-run.json");
const MIN_CASES = 1000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function git(...args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Criterion (c): run the whole Vitest suite and report pass/fail counts. */
function runUnitTests() {
  const out = join(mkdtempSync(join(tmpdir(), "fuzz-")), "vitest.json");
  const vitest = join(ROOT, "node_modules", "vitest", "vitest.mjs");
  const res = spawnSync(process.execPath, [vitest, "run", "--reporter=json", `--outputFile=${out}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (!existsSync(out)) {
    return { pass: false, passed: 0, failed: 0, error: (res.stderr || res.stdout || "vitest did not run").slice(-500) };
  }
  const report = JSON.parse(readFileSync(out, "utf8"));
  return {
    pass: res.status === 0 && report.numFailedTests === 0,
    passed: report.numPassedTests as number,
    failed: report.numFailedTests as number,
    failedNames: (report.testResults as { assertionResults: { status: string; fullName: string }[] }[])
      .flatMap((f) => f.assertionResults.filter((a) => a.status === "failed").map((a) => a.fullName))
      .slice(0, 20),
  };
}

export interface FailingCase {
  caseIndex: number;
  seed: number;
  mismatches: Mismatch[];
  /** Shrunk version of the failing case (still fails with the same kind). */
  case: FuzzCase;
}

function main() {
  const started = Date.now();
  const seed = Number(arg("seed") ?? Math.floor(Math.random() * 2 ** 31));
  const cases = Number(arg("cases") ?? MIN_CASES);
  const strategy = strategyByName(arg("strategy") ?? "baseline");
  const maxReported = 10;

  // Criterion (a): random cases.
  const failing: FailingCase[] = [];
  const byKind: Record<string, number> = {};
  let mismatchedCases = 0;
  let skipped = 0;
  for (let i = 0; i < cases; i++) {
    const s = caseSeed(seed, i);
    const c = generateCase(strategy, s);
    const result = checkCase(c);
    skipped += result.skipped;
    if (result.mismatches.length > 0) {
      mismatchedCases++;
      for (const m of result.mismatches) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
      if (failing.length < maxReported) {
        const small = shrinkCase(c);
        failing.push({ caseIndex: i, seed: s, mismatches: checkCase(small).mismatches, case: small });
      }
    }
    if ((i + 1) % 250 === 0) process.stderr.write(`  ${i + 1}/${cases} cases, ${mismatchedCases} mismatched\n`);
  }

  // Criterion (b): replay every corpus entry.
  const corpus = readCorpus();
  const corpusFailures = corpus
    .map((e) => ({ id: e.id, mismatches: checkCase(e.case).mismatches }))
    .filter((r) => r.mismatches.length > 0);

  // Criterion (c): the existing unit tests.
  const unit = flag("no-unit") ? { pass: false, skipped: true, passed: 0, failed: 0 } : runUnitTests();

  const criteria = {
    a: { pass: cases >= MIN_CASES && mismatchedCases === 0, cases, mismatchedCases, mismatchesByKind: byKind, referenceSkips: skipped },
    b: { pass: corpusFailures.length === 0, corpusSize: corpus.length, failures: corpusFailures },
    c: unit,
  };
  const summary = {
    version: 1,
    timestamp: new Date().toISOString(),
    seed,
    strategy: strategy.name,
    strategyParams: strategy,
    caseCount: cases,
    criteria,
    pass: criteria.a.pass && criteria.b.pass && criteria.c.pass,
    failingCases: failing,
    commit: git("rev-parse", "HEAD"),
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    durationMs: Date.now() - started,
  };
  writeFileSync(LAST_RUN_PATH, JSON.stringify(summary, null, 2) + "\n");
  if (!summary.pass) writeFileSync(LAST_FAILING_RUN_PATH, JSON.stringify(summary, null, 2) + "\n");
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.exitCode = summary.pass ? 0 : 1;
}

main();
