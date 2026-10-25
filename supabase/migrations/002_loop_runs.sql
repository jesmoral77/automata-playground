-- One row per run of the automata-fuzz-audit loop (see .claude/skills/automata-fuzz-audit).
-- Written only through POST /api/loop-runs (token-protected); read by
-- GET /api/loop-runs and the public /loop-history page.

create table if not exists public.loop_runs (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  trigger           text not null default 'manual',    -- schedule | manual | local
  seed              bigint not null,
  strategy          text not null,
  strategy_params   jsonb not null default '{}'::jsonb,
  case_count        integer not null,
  mismatched_cases  integer not null,
  criterion_a       boolean not null,                   -- 0 mismatches over >= 1000 random cases
  criterion_b       boolean not null,                   -- regression corpus replays clean
  criterion_c       boolean not null,                   -- all unit tests pass
  corpus_size       integer not null default 0,
  unit_passed       integer,
  unit_failed       integer,
  status            text not null,                      -- pass | fixed | unresolved | fail
  failing_cases     jsonb not null default '[]'::jsonb,
  root_cause        text,
  fix               text,
  commit_hash       text,
  branch            text,
  pr_url            text,
  notes             text,
  duration_ms       integer,
  summary           jsonb not null                      -- full machine-readable harness output
);

create index if not exists loop_runs_created_at_idx on public.loop_runs (created_at desc);

-- No policies: the public anon key can't touch this table. The API routes use
-- the server-only secret key.
alter table public.loop_runs enable row level security;
