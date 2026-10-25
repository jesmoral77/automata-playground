import { StorageNotConfiguredError } from "@/lib/storage/supabase";
import { ingestTokenValid, insertLoopRun, InvalidRunError, listLoopRuns } from "@/lib/storage/loopRuns";

const MAX_BODY_BYTES = 500_000;

/** Public, read-only: the loop log, newest first. */
export async function GET(request: Request) {
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    return Response.json({ runs: await listLoopRuns(Number.isFinite(limit) ? limit : 100) });
  } catch (e) {
    const status = e instanceof StorageNotConfiguredError ? 503 : 500;
    if (status === 500) console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "Server error" }, { status });
  }
}

/** Append one run record. Requires `Authorization: Bearer <LOOP_INGEST_TOKEN>`. */
export async function POST(request: Request) {
  if (!ingestTokenValid(request.headers.get("authorization"))) {
    return Response.json({ error: "Missing or invalid ingest token." }, { status: 401 });
  }
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Body too large." }, { status: 413 });
    const saved = await insertLoopRun(JSON.parse(raw));
    return Response.json(saved, { status: 201 });
  } catch (e) {
    if (e instanceof InvalidRunError || e instanceof SyntaxError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    console.error(e);
    return Response.json({ error: "Could not save the run." }, { status: 500 });
  }
}
