# Project rules

- After every user prompt, append the prompt verbatim to Prompts.txt with a short descriptive title line, separated from the previous entry by a few blank lines. Do this before starting the work.
- The user is on Windows using PowerShell. Give any terminal commands in PowerShell syntax.

# Project notes

- Next.js 16 (App Router, Cache Components on) + TypeScript + Tailwind + Cytoscape.js. Read `node_modules/next/dist/docs/` before using unfamiliar Next APIs (see AGENTS.md).
- All automata logic lives in `src/lib/automata/` as pure TypeScript with no React/DOM imports. UI components only render what those functions return.
- Tests: `npm test` (Vitest + fast-check property tests, files `src/**/*.test.ts`). Also `npm run typecheck` and `npm run lint`.
- Storage: Supabase Postgres, accessed only from server code (`src/lib/storage/machines.ts`) with the secret key. Schema in `supabase/migrations/`. Machines are anonymous with share links + edit tokens; `owner_id` is reserved for future accounts.
