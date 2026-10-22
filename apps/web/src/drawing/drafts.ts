import type {
  Chunk,
  Drawing,
} from "../../../../packages/drawing-party/src/index.ts";
export interface Draft {
  drawing: Drawing;
  pending: Chunk[];
}
let db: Promise<IDBDatabase> | undefined;
function database() {
  return (db ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("drawing-party-drafts", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("drafts");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function readDraft(key: string): Promise<Draft | undefined> {
  const d = await database();
  return new Promise((resolve, reject) => {
    const t = d.transaction("drafts", "readonly"),
      r = t.objectStore("drafts").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveDraft(key: string, value: Draft) {
  const d = await database();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("drafts", "readwrite");
    t.objectStore("drafts").put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
