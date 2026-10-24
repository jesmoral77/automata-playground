// Browser-side helpers: call the API and remember which machines this browser
// created (with their edit tokens) in localStorage.

import { Automaton } from "@/lib/automata";

export interface MyMachine {
  id: string;
  name: string;
  type: Automaton["type"];
  editToken: string;
  updatedAt: string;
}

const KEY = "automata-playground:my-machines";
const CHANGE_EVENT = "automata-playground:my-machines-changed";

/** Subscribe to changes of the saved-machines list (this tab or others). */
export function subscribeMyMachines(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function loadMyMachines(): MyMachine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMyMachines(list: MyMachine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage may be unavailable (private mode); saving still works, but this
    // browser won't remember the edit token.
  }
}

export function rememberMachine(entry: MyMachine) {
  saveMyMachines([entry, ...loadMyMachines().filter((m) => m.id !== entry.id)]);
}

export function forgetMachine(id: string) {
  saveMyMachines(loadMyMachines().filter((m) => m.id !== id));
}

export function editTokenFor(id: string): string | null {
  return loadMyMachines().find((m) => m.id === id)?.editToken ?? null;
}

interface SaveResponse {
  id: string;
  name: string;
  updatedAt: string;
  editToken?: string;
}

async function request(url: string, init: RequestInit): Promise<SaveResponse> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body;
}

/**
 * Save the machine. Updates in place if this browser owns `id`; otherwise
 * creates a new copy (so editing someone else's shared machine forks it).
 */
export async function saveMachine(
  id: string | null,
  name: string,
  machine: Automaton,
): Promise<{ id: string; created: boolean }> {
  const token = id ? editTokenFor(id) : null;
  const body = JSON.stringify({ name, machine });
  if (id && token) {
    const saved = await request(`/api/machines/${id}`, {
      method: "PUT",
      headers: { "x-edit-token": token },
      body,
    });
    rememberMachine({ id, name: saved.name, type: machine.type, editToken: token, updatedAt: saved.updatedAt });
    return { id, created: false };
  }
  const saved = await request("/api/machines", { method: "POST", body });
  rememberMachine({
    id: saved.id,
    name: saved.name,
    type: machine.type,
    editToken: saved.editToken!,
    updatedAt: saved.updatedAt,
  });
  return { id: saved.id, created: true };
}
