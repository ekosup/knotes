import { openDB } from 'idb';
import { uuid } from './utils.js';

const DB_NAME = 'enotes-db';
const DB_VERSION = 2;
const STORE = 'notes';

let dbPromise;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      },
    });
  }
  return dbPromise;
}

export async function listNotes() {
  const db = await getDB();
  return db.getAllFromIndex(STORE, 'updatedAt');
}

export async function getNote(id) {
  const db = await getDB();
  return db.get(STORE, id);
}

export async function saveNote(note) {
  const db = await getDB();
  const now = new Date().toISOString();
  if (!note.id) {
    note.id = uuid();
    note.createdAt = now;
  }
  note.updatedAt = now;
  await db.put(STORE, note);
  return note;
}

export async function deleteNote(id) {
  const db = await getDB();
  await db.delete(STORE, id);
}

export async function getStorageEstimate() {
  if ('storage' in navigator && navigator.storage.estimate) {
    const { usage } = await navigator.storage.estimate();
    return usage || 0;
  }
  return 0;
}

export function createEmptyNote() {
  return {
    id: '',
    title: '',
    createdAt: '',
    updatedAt: '',
    cues: [],
    tags: [],
    pinned: false,
    content: '',
    summary: '',
  };
}
