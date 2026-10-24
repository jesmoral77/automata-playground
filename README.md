# Automata Playground

A study tool for Theory of Computation: draw DFAs and NFAs, step through input strings, and convert NFAs to DFAs with subset construction. Machines can be saved and shared by link.

## Run locally (PowerShell)

```powershell
npm install
npm run dev      # then open http://localhost:3000
npm test         # unit + property tests for src/lib/automata
```

Saving/sharing needs Supabase environment variables in `.env.local` (`vercel env pull .env.local` once the Vercel project is linked).

## Layout

- `src/lib/automata/` — pure, unit-tested automata logic (types, editing, validation, simulation, subset construction, JSON parsing, examples)
- `src/lib/storage/` — database access (server) and API helpers (browser)
- `src/components/` — React UI (Cytoscape canvas, panels)
- `src/app/` — pages (`/`, `/m/[id]`) and API routes (`/api/machines`)
- `supabase/migrations/` — database schema
