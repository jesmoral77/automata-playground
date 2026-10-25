// The permanent regression corpus: every case that ever failed, with how it
// was diagnosed and fixed. Committed to the repo (fuzz/corpus.json) so that a
// failing case and its fix land in the same commit, and replayed both by the
// fuzz run (criterion b) and by `npm test`.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FuzzCase } from "./generate";
import type { MismatchKind } from "./check";

export interface CorpusEntry {
  id: string;
  addedAt: string;
  /** Where it came from, so it can be regenerated with the generator of that time. */
  origin: { seed: number; strategy: string; caseIndex: number };
  kind: MismatchKind;
  detail: string;
  case: FuzzCase;
  /** "open" until a fix lands; replay still runs for open entries (and fails). */
  status: "open" | "fixed";
  rootCause?: string;
  fix?: string;
  fixCommit?: string;
}

export const CORPUS_PATH = fileURLToPath(new URL("./corpus.json", import.meta.url));

export function readCorpus(path = CORPUS_PATH): CorpusEntry[] {
  return JSON.parse(readFileSync(path, "utf8")) as CorpusEntry[];
}

export function writeCorpus(entries: CorpusEntry[], path = CORPUS_PATH) {
  writeFileSync(path, JSON.stringify(entries, null, 2) + "\n");
}
