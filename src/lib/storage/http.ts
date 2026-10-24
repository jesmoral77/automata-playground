// Shared helpers for the /api/machines route handlers.

import { ParseError, parseAutomaton } from "@/lib/automata";
import { cleanName, StorageNotConfiguredError } from "./machines";

export const MAX_BODY_BYTES = 200_000;

export async function readMachineBody(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ParseError("Request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ParseError("Request body must be JSON.");
  }
  if (typeof body !== "object" || body === null) throw new ParseError("Request body must be an object.");
  const { name, machine } = body as { name?: unknown; machine?: unknown };
  return { name: cleanName(name), machine: parseAutomaton(machine) };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ParseError) return Response.json({ error: e.message }, { status: 400 });
  if (e instanceof StorageNotConfiguredError) return Response.json({ error: e.message }, { status: 503 });
  console.error(e);
  return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
}
