import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CachedChild, Child, HistoryEntry, QueuedScan } from '../types'

interface PoshanDB extends DBSchema {
  /** Children seen on this phone, so search still works offline. */
  children: {
    key: string
    value: CachedChild
    indexes: { 'by-seen': number }
  }
  /** Scans captured but not yet uploaded. */
  queue: {
    key: string
    value: QueuedScan
    indexes: { 'by-worker': string }
  }
  /** Finished screenings, for the "Recent screenings" list. */
  history: {
    key: string
    value: HistoryEntry
    indexes: { 'by-date': string }
  }
}

let dbPromise: Promise<IDBPDatabase<PoshanDB>> | null = null

export function getDB(): Promise<IDBPDatabase<PoshanDB>> {
  dbPromise ??= openDB<PoshanDB>('poshanscan', 1, {
    upgrade(db) {
      const children = db.createObjectStore('children', { keyPath: 'child_id' })
      children.createIndex('by-seen', 'last_seen')

      const queue = db.createObjectStore('queue', { keyPath: 'local_id' })
      queue.createIndex('by-worker', 'worker_id')

      const history = db.createObjectStore('history', { keyPath: 'scan_id' })
      history.createIndex('by-date', 'created_at')
    },
  })
  return dbPromise
}

/* ---------- children cache ---------- */

export async function cacheChildren(children: Child[]): Promise<void> {
  if (children.length === 0) return
  const db = await getDB()
  const tx = db.transaction('children', 'readwrite')
  const now = Date.now()
  await Promise.all([
    ...children.map((c) => tx.store.put({ ...c, last_seen: now })),
    tx.done,
  ])
}

export async function getCachedChild(childId: string): Promise<CachedChild | undefined> {
  return (await getDB()).get('children', childId)
}

export async function recentChildren(limit = 6): Promise<CachedChild[]> {
  const all = await (await getDB()).getAll('children')
  return all.sort((a, b) => b.last_seen - a.last_seen).slice(0, limit)
}

export async function searchCachedChildren(term: string, limit = 20): Promise<CachedChild[]> {
  const needle = term.trim().toLowerCase()
  const all = await (await getDB()).getAll('children')
  return all
    .filter((c) =>
      [c.name, c.guardian_name, c.village, c.child_id].some((f) => f?.toLowerCase().includes(needle)),
    )
    .sort((a, b) => b.last_seen - a.last_seen)
    .slice(0, limit)
}

/* ---------- history ---------- */

export async function addHistory(entry: HistoryEntry): Promise<void> {
  await (await getDB()).put('history', entry)
}

export async function recentHistory(limit = 5): Promise<HistoryEntry[]> {
  const all = await (await getDB()).getAllFromIndex('history', 'by-date')
  return all.reverse().slice(0, limit)
}
