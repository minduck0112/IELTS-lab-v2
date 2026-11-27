import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { HISTORY_DB_NAME, HISTORY_STORE } from "@/lib/constants";
import type { AttemptRecord } from "@/lib/types";

interface ReadingHistoryDB extends DBSchema {
  attempts: {
    key: string;
    value: AttemptRecord;
    indexes: { "by-submitted": number };
  };
}

let dbPromise: Promise<IDBPDatabase<ReadingHistoryDB>> | null = null;

function getDb() {
  if (typeof window === "undefined") {
    throw new Error("History is only available in the browser.");
  }
  if (!dbPromise) {
    dbPromise = openDB<ReadingHistoryDB>(HISTORY_DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(HISTORY_STORE, { keyPath: "id" });
        store.createIndex("by-submitted", "submittedAt");
      },
    });
  }
  return dbPromise;
}

export async function saveAttempt(record: AttemptRecord) {
  const db = await getDb();
  await db.put(HISTORY_STORE, record);
}

export async function getAttempts() {
  const db = await getDb();
  const attempts = await db.getAllFromIndex(HISTORY_STORE, "by-submitted");
  return attempts.sort((a, b) => b.submittedAt - a.submittedAt);
}

export async function getAttempt(id: string) {
  const db = await getDb();
  return db.get(HISTORY_STORE, id);
}

export async function deleteAttempt(id: string) {
  const db = await getDb();
  await db.delete(HISTORY_STORE, id);
}

export async function clearAttempts() {
  const db = await getDb();
  await db.clear(HISTORY_STORE);
}

export async function updateAttemptReview(id: string, review: AttemptRecord["review"], score: number) {
  const db = await getDb();
  const record = await db.get(HISTORY_STORE, id);
  if (!record) return;
  record.review = review;
  record.score = score;
  await db.put(HISTORY_STORE, record);
}
