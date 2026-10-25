// Server-only Supabase client using the secret key. Never import this (or any
// module that imports it) from a client component.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("The database is not configured (missing Supabase environment variables).");
  }
}

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StorageNotConfiguredError();
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}
