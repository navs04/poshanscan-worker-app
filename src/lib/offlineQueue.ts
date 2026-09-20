import { ApiError, NetworkError, syncScans, type SyncItemResult } from './api'
import { config } from './config'
import { addHistory, getDB } from './db'
import type { QueuedScan, ReferenceType } from '../types'

/*
 * Offline queue.
 *
 * A scan that cannot be sent right now is stored in IndexedDB together with its photo.
 * syncQueue() later uploads pending scans in small batches via POST /sync.
 *
 *  - Network trouble  -> stop and leave everything pending (retried on the next trigger).
 *  - 401              -> stop; the API layer already signs the worker out. Nothing is lost.
 *  - Server rejects a scan (e.g. 422, marker not found) -> mark it `failed` so it stops
 *    retrying and the worker can delete it. A rejected scan never blocks the others.
 */

export interface EnqueueInput {
  local_id: string
  worker_id: string
  child_id: string
  child_name: string
  image: Blob
  captured_at: string
  reference_type: ReferenceType
  reference_size_mm: number
}

export interface SyncSummary {
  synced: number
  failed: number
  /** Scans still waiting (pending) after this run. */
  remaining: number
  stopped?: 'offline' | 'auth' | 'server'
}

export async function enqueueScan(input: EnqueueInput): Promise<QueuedScan> {
  const item: QueuedScan = { ...input, status: 'pending', attempts: 0 }
  await (await getDB()).put('queue', item)
  return item
}

/** All unsent scans for a worker (pending and failed), oldest first. */
export async function listQueue(workerId: string): Promise<QueuedScan[]> {
  const items = await (await getDB()).getAllFromIndex('queue', 'by-worker', workerId)
  return items.sort((a, b) => a.captured_at.localeCompare(b.captured_at))
}

export async function countQueue(workerId: string): Promise<number> {
  return (await getDB()).countFromIndex('queue', 'by-worker', workerId)
}

export async function removeFromQueue(localId: string): Promise<void> {
  await (await getDB()).delete('queue', localId)
}

/** Put a rejected scan back in line for another attempt. */
export async function retryFailed(localId: string): Promise<void> {
  const db = await getDB()
  const item = await db.get('queue', localId)
  if (item) await db.put('queue', { ...item, status: 'pending', last_error: undefined })
}

async function patch(localId: string, changes: Partial<QueuedScan>): Promise<void> {
  const db = await getDB()
  const item = await db.get('queue', localId)
  if (item) await db.put('queue', { ...item, ...changes })
}

/* ---------- sync ---------- */

let running: Promise<SyncSummary> | null = null

/** Upload all pending scans for this worker. Concurrent calls share one run. */
export function syncQueue(workerId: string): Promise<SyncSummary> {
  running ??= run(workerId).finally(() => {
    running = null
  })
  return running
}

async function run(workerId: string): Promise<SyncSummary> {
  const summary: SyncSummary = { synced: 0, failed: 0, remaining: 0 }
  const pending = (await listQueue(workerId)).filter((i) => i.status === 'pending')

  for (let i = 0; i < pending.length; i += config.syncBatchSize) {
    const batch = pending.slice(i, i + config.syncBatchSize)
    try {
      await sendBatch(batch, summary)
    } catch (err) {
      summary.stopped =
        err instanceof NetworkError ? 'offline' : err instanceof ApiError && err.status === 401 ? 'auth' : 'server'
      break
    }
  }

  summary.remaining = (await listQueue(workerId)).filter((i) => i.status === 'pending').length
  return summary
}

/** Throws for problems that should stop the whole run (offline, 401, 5xx). */
async function sendBatch(batch: QueuedScan[], summary: SyncSummary): Promise<void> {
  let results: SyncItemResult[]
  try {
    results = await syncScans(batch)
  } catch (err) {
    // A 4xx on a multi-scan batch does not say which scan is at fault: retry them one by one.
    if (err instanceof ApiError && isClientRejection(err.status) && batch.length > 1) {
      for (const single of batch) await sendBatch([single], summary)
      return
    }
    if (err instanceof ApiError && isClientRejection(err.status)) {
      await reject(batch[0], err.message)
      summary.failed += 1
      return
    }
    throw err
  }

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i]
    const outcome = results[i]
    if (outcome.ok) {
      await addHistory({ ...outcome.result, child_name: item.child_name, via_queue: true }).catch(() => undefined)
      await removeFromQueue(item.local_id)
      summary.synced += 1
    } else {
      await reject(item, outcome.message)
      summary.failed += 1
    }
  }
}

/** 4xx that mean "this request is bad", as opposed to auth, timeout or rate limiting. */
function isClientRejection(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429
}

async function reject(item: QueuedScan, message: string): Promise<void> {
  await patch(item.local_id, { status: 'failed', attempts: item.attempts + 1, last_error: message })
}
