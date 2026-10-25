// Server-only data access for saved machines (Supabase Postgres).
// Never import this from a client component: it uses the secret key.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Automaton, parseAutomaton } from "@/lib/automata";
import { db } from "./supabase";

export { StorageNotConfiguredError } from "./supabase";

export interface SavedMachine {
  id: string;
  name: string;
  machine: Automaton;
  createdAt: string;
  updatedAt: string;
}

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 10-character random id (~59 bits), e.g. "aZ3kP0qLmX". */
function newId(): string {
  return [...randomBytes(10)].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(token: string, hash: string | null): boolean {
  if (!hash) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cleanName(name: unknown): string {
  const s = typeof name === "string" ? name.trim().slice(0, 100) : "";
  return s || "Untitled";
}

interface Row {
  id: string;
  name: string;
  definition: unknown;
  edit_token_hash: string | null;
  created_at: string;
  updated_at: string;
}

function toSaved(row: Row): SavedMachine {
  return {
    id: row.id,
    name: row.name,
    machine: parseAutomaton(row.definition),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createMachine(
  name: string,
  machine: Automaton,
): Promise<{ saved: SavedMachine; editToken: string }> {
  const editToken = randomBytes(24).toString("base64url");
  const { data, error } = await db()
    .from("machines")
    .insert({
      id: newId(),
      name,
      type: machine.type,
      definition: machine,
      edit_token_hash: hashToken(editToken),
    })
    .select()
    .single<Row>();
  if (error) throw new Error(`Could not save machine: ${error.message}`);
  return { saved: toSaved(data), editToken };
}

export async function getMachine(id: string): Promise<SavedMachine | null> {
  if (!/^[0-9a-zA-Z]{1,32}$/.test(id)) return null;
  const { data, error } = await db().from("machines").select().eq("id", id).maybeSingle<Row>();
  if (error) throw new Error(`Could not load machine: ${error.message}`);
  return data ? toSaved(data) : null;
}

/** Returns "not-found", "forbidden", or the updated machine. */
export async function updateMachine(
  id: string,
  editToken: string,
  name: string,
  machine: Automaton,
): Promise<SavedMachine | "not-found" | "forbidden"> {
  const { data: existing, error: readError } = await db()
    .from("machines")
    .select("edit_token_hash")
    .eq("id", id)
    .maybeSingle<Pick<Row, "edit_token_hash">>();
  if (readError) throw new Error(`Could not load machine: ${readError.message}`);
  if (!existing) return "not-found";
  if (!tokenMatches(editToken, existing.edit_token_hash)) return "forbidden";

  const { data, error } = await db()
    .from("machines")
    .update({ name, type: machine.type, definition: machine, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single<Row>();
  if (error) throw new Error(`Could not update machine: ${error.message}`);
  return toSaved(data);
}
