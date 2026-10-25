---
name: automata-fuzz-audit
description: Self-improving correctness audit for the Automata Playground. Fuzzes the app's NFA simulation, subset construction (NFA→DFA) and DFA minimization against an independent brute-force reference, replays every past failure, logs each run to the loop_runs table, and fixes bugs it finds on a claude/ branch with a PR. Use this whenever a scheduled task or routine fires the fuzz audit, or when anyone asks to run, re-run, continue or debug the fuzz loop / correctness audit / regression corpus for this repo, even if they just say "run the audit" or "do today's loop run".
---

# Automata fuzz audit

One run of a long-running loop. Each run checks the automata code against an
independent reference, learns from previous runs through the log, and leaves
one log record behind so the next run can do better. Runs are unattended, so
favour being careful and honest over being clever: a run that finds nothing
and says so is a successful run.

## The four components

| Component | Definition |
|---|---|
| **Trigger** | Scheduled task (routine) daily at 07:00 America/Denver; may also be fired manually ("Run now", `/schedule run`) or hourly during demos. Treat every trigger the same way. |
| **Task** | Generate ≥1000 random NFAs + input strings with a seeded strategy and compare `src/lib/automata` (`accepts`/`simulate`, `subsetConstruction`, `minimizeDfa`) against `fuzz/reference` (DFS acceptance, product-machine equivalence, Brzozowski minimal size). Fix real bugs found, within the guardrails. |
| **Success criteria** | (a) 0 mismatched cases across ≥1000 random cases; (b) every entry in `fuzz/corpus.json` replays clean; (c) the whole Vitest suite passes. `npm run fuzz` checks all three and prints them as JSON — trust its `criteria` object, not your impression. |
| **Logging** | Exactly one record per run in `public.loop_runs` via `npm run fuzz:log -- post`: timestamp, seed, strategy, case count, pass/fail per criterion, failing cases, root cause, fix, commit, PR. Failing cases also go into the committed corpus. |

## Tools (all from the project root)

- `npm run fuzz:log -- history --limit 30` — recent runs (JSON, newest first).
- `npm run fuzz:log -- plan` — ranks strategies from the log; read its reasons.
- `npm run fuzz -- --seed <n> --cases 1000 --strategy <name>` — the audit. Exit code 0 only when a, b and c all pass. Writes `fuzz/.last-run.json`.
- `npm run fuzz:log -- corpus-add --index <caseIndex> --status fixed|open --root-cause "…" --fix "…"` — adds a shrunk failing case from the last run to `fuzz/corpus.json`.
- `npm run fuzz:log -- corpus-mark --id <id> --status fixed --fix "…" --commit <sha>`
- `npm run fuzz:log -- post --status pass|fixed|unresolved|fail --trigger schedule|manual|local [--root-cause …] [--fix …] [--commit …] [--pr …] [--notes …]` — posts the last run plus your annotations.

Strategies (see `fuzz/generate.ts`): `baseline`, `wide-alphabet`, `epsilon-heavy`, `edge-cases`, `dense`, `sparse`, `dfa-partial`, `large`.

## Procedure

### 0. Preflight
Confirm you are at the repo root (`package.json` name is `automata-playground`) and note the branch and `git rev-parse HEAD`. Run `npm ci` if `node_modules` is missing. If the working tree is dirty before you start, do not touch those changes; stop and log `fail` with a note.

### 1. Read the log first (self-improvement)
Run `history` and `plan` before generating anything. From them, write down in a few lines: what the last runs found, which strategies have found bugs, which corpus entries are open, and whether any open entry already has a fix PR in the log (`pr_url`). This matters because the loop only improves if each run builds on the previous ones instead of repeating them.

### 2. Choose the strategy and seed
Use `plan`'s recommendation unless the history gives you a concrete reason to deviate (for example, a bug class found yesterday suggests a neighbouring strategy). If you deviate, say why in `--notes`. Use a fresh random seed (`--seed` omitted lets the harness pick and record one); reuse an old seed only to reproduce a logged failure.

### 3. Run the audit
`npm run fuzz -- --cases 1000 --strategy <name>` (more cases is fine, never fewer). Read the JSON summary.

### 4a. Everything passes
Post `--status pass` with a one-line note on what this run covered. Commit nothing. Done.

### 4b. Corpus replay (b) fails for an entry that already has an open fix PR
The fix just hasn't been merged into this branch yet. Don't fix it again. Post `--status fail` with notes "pending merge of <pr>". Still handle any *new* mismatches as in 4c.

### 4c. New mismatches (a) or corpus failures without a PR — investigate and fix
Work on one root cause at a time, starting with the first shrunk case in `failingCases` (the harness already minimized it).

1. **Diagnose.** Reproduce the shrunk case by hand (a short `npx tsx -e` script or a focused Vitest test) and find the root cause in `src/lib/automata`. Decide whether the app or the reference is wrong; the reference is not automatically right. If the reference is wrong, the fix goes in `fuzz/reference` and must keep it independent (no imports from `src/`).
2. **Add the regression first.** `corpus-add --index <i> --status open --root-cause "<diagnosis>"` so the failure is pinned before you change code.
3. **Fix — at most 3 attempts.** After each attempt run the same command again with the same seed and strategy. An attempt *converges* only when a, b and c all pass on that seed **and** on one fresh seed. A change that fixes the target but breaks other tests did not converge.
4. **Converged:** `corpus-mark --id <id> --status fixed --fix "<what changed>"`, create branch `claude/fuzz-fix-<YYYYMMDD>-<short-id>` from the current branch, commit (message explains root cause and fix), push, and open a draft PR into the branch you started on (`gh pr create --draft` if `gh` is available; otherwise report the branch URL). Then `corpus-mark … --commit <sha>` is optional; post `--status fixed --root-cause … --fix … --commit <sha> --pr <url>`.
5. **Not converged after 3 attempts:** revert your code changes (`git checkout -- src fuzz/reference`), keep the corpus entry as `open`, commit just the corpus entry on `claude/fuzz-unresolved-<YYYYMMDD>-<short-id>` with a draft PR so the case is tracked, and post `--status unresolved` with your best root-cause hypothesis and what you tried. Stop.

### 4d. Unit tests (c) fail but fuzzing is clean
Treat it like 4c (same 3-attempt cap), with the failing test names from `criteria.c.failedNames` as the evidence. Never "fix" it by changing what the test expects unless you can show the test itself is wrong, and say so explicitly in the log.

### 5. Report
End with a short report: strategy and why, seed, cases, a/b/c results, what was found (or "no bugs found — the code agreed with the reference on all N cases"), root cause, fix, commit, PR, and the log record id returned by `post`.

## Guardrails

These keep an unattended agent from "succeeding" in ways that make the code worse.

- **Never weaken, skip, or delete tests, corpus entries, or reference checks to make a run pass.** No `.skip`, no loosened assertions, no lowering `--cases`, no editing `fuzz/check.ts` to ignore a mismatch kind. A red run is information; hiding it destroys the loop's value.
- **Cap the work:** one root cause per run, at most 3 fix attempts for it, at most ~30 minutes of fixing. If another distinct failure remains, log it (corpus entry `open`) for a later run.
- **Stop when not converging.** If attempts oscillate (fixing one case breaks another) or the diagnosis keeps changing, stop after the cap, revert, and log `unresolved`. Don't keep trying.
- **Stay inside this project folder.** No edits outside the repo, no global installs or config changes, no other repositories. Push only `claude/…` branches of this repo; never push to `main` or the branch you started from, never force-push, never merge your own PR.
- **Don't log the run prompt to Prompts.txt.** The CLAUDE.md prompt-logging rule exempts automated loop runs; the `loop_runs` record is the log.
- **Secrets stay where they are.** Never print, commit, or log tokens or keys. The log API token reaches requests through the environment (cloud network secret or `.env.local`); don't look for it or echo it.
- **Always log exactly one record**, including when something goes wrong mid-run (`--status fail` with the error in `--notes`). If posting fails twice, put the full JSON summary in your final report so a human can backfill it.
