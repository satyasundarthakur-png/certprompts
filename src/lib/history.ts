import type { Analysis } from "@/lib/analysis";

/**
 * Recent analyses, kept in this browser's IndexedDB so a refresh doesn't lose the work.
 * Nothing leaves the device. Every function fails soft (private mode, blocked storage,
 * old browsers): history is a convenience, never a requirement.
 */
export interface HistoryEntry {
  id: string;
  savedAt: number;
  fileName: string;
  thumb: string; // small preview data URL, "" when the file had no picture
  ratio: number; // width / height of the original page
  analysis: Analysis;
}

export const MAX_HISTORY = 20;

const DB_NAME = "cps-history";
const STORE = "analyses";

/** Newest first, capped at `max`. Pure so it can be tested without a browser database. */
export function trimHistory(list: HistoryEntry[], max = MAX_HISTORY): HistoryEntry[] {
  return [...list].sort((a, b) => b.savedAt - a.savedAt).slice(0, max);
}

export function newHistoryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error("Could not open history"));
    req.onblocked = () => rej(new Error("History database is blocked"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error("History write failed"));
    tx.onabort = () => rej(tx.error ?? new Error("History write aborted"));
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error("History read failed"));
  });
}

export async function listHistory(): Promise<HistoryEntry[]> {
  try {
    const db = await open();
    try {
      const all = await request(
        db.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<HistoryEntry[]>,
      );
      return trimHistory(all);
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

/** Insert or update one entry, then drop anything beyond the newest MAX_HISTORY. */
export async function saveHistory(entry: HistoryEntry): Promise<void> {
  try {
    const db = await open();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put(entry);
      const keys = await request(store.getAll() as IDBRequest<HistoryEntry[]>);
      const keep = new Set(trimHistory(keys).map((e) => e.id));
      for (const e of keys) if (!keep.has(e.id)) store.delete(e.id);
      await done(tx);
    } finally {
      db.close();
    }
  } catch {
    /* history is optional */
  }
}

export async function deleteHistory(id: string): Promise<void> {
  try {
    const db = await open();
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      await done(tx);
    } finally {
      db.close();
    }
  } catch {
    /* history is optional */
  }
}

export async function clearHistory(): Promise<void> {
  try {
    const db = await open();
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      await done(tx);
    } finally {
      db.close();
    }
  } catch {
    /* history is optional */
  }
}
