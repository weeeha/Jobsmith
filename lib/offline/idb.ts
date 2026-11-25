// A thin IndexedDB adapter for the mark queue: database `jobsmith-offline`,
// object store `marks`, key path `id`. Covered by the end to end spec, not by
// unit tests. No library: the four calls below are all the queue needs.
import type { QueueStore, QueuedMark } from "./queue";

const DB_NAME = "jobsmith-offline";
const STORE = "marks";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function allMarks(): Promise<QueuedMark[]> {
  return ((await run<QueuedMark[]>("readonly", (s) => s.getAll())) ?? []) as QueuedMark[];
}

export async function putMark(mark: QueuedMark): Promise<void> {
  await run("readwrite", (s) => s.put(mark));
}

export async function deleteMark(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

export async function deleteForUser(userHash: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const request = tx.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if ((cursor.value as QueuedMark).userHash === userHash) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function createIdbStore(): QueueStore {
  return { all: allMarks, put: putMark, delete: deleteMark, deleteForUser };
}
