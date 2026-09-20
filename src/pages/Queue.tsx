import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '../components/Alert'
import { ArrowLeftIcon, RefreshIcon, TrashIcon } from '../components/icons'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'
import { listQueue, removeFromQueue, retryFailed } from '../lib/offlineQueue'
import { formatDateTime } from '../lib/utils'
import type { QueuedScan } from '../types'

function Thumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url ? (
    <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-md bg-ink-200 object-cover" />
  ) : (
    <span className="h-16 w-16 shrink-0 rounded-md bg-ink-200" />
  )
}

export default function Queue() {
  const { session } = useAuth()
  const { online, pending, syncing, syncNow, refresh } = useSync()
  const [items, setItems] = useState<QueuedScan[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    try {
      setItems(await listQueue(session.user_id))
    } catch {
      setItems([])
    }
  }, [session])

  // Reload whenever the count changes (a sync finished, an item was added or removed).
  useEffect(() => {
    void load()
  }, [load, pending, syncing])

  async function sendNow() {
    setMessage(null)
    const summary = await syncNow()
    await load()
    if (summary === null) setMessage('No connection. The scans will send automatically when you are back online.')
    else if (summary.stopped === 'offline') setMessage('The server could not be reached. Try again in a moment.')
    else if (summary.stopped === 'server') setMessage('The server had a problem. Your scans are safe, try again later.')
  }

  async function remove(item: QueuedScan) {
    if (!window.confirm(`Delete the saved photo of ${item.child_name}? This cannot be undone.`)) return
    await removeFromQueue(item.local_id)
    await Promise.all([load(), refresh()])
  }

  async function retry(item: QueuedScan) {
    await retryFailed(item.local_id)
    await Promise.all([load(), refresh()])
    void sendNow()
  }

  const waiting = items?.filter((i) => i.status === 'pending').length ?? 0

  return (
    <div>
      <Link to="/" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-ink-600">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to search
      </Link>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Unsent scans</h1>
      <p className="mt-1 text-ink-500">
        Photos saved on this phone. They send automatically when there is a connection.
      </p>

      {message && (
        <div className="mt-4">
          <Alert tone="info">{message}</Alert>
        </div>
      )}

      {items === null ? (
        <div className="mt-8 flex justify-center text-ink-400">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 border-t border-ink-200 pt-4">
          <p className="font-bold">Nothing is waiting</p>
          <p className="mt-1 text-sm text-ink-500">
            Scans taken without a connection appear here until they are sent.
          </p>
        </div>
      ) : (
        <>
          {waiting > 0 && (
            <button type="button" className="btn-primary mt-4" onClick={() => void sendNow()} disabled={syncing || !online}>
              {syncing ? <Spinner className="h-5 w-5" /> : <RefreshIcon className="h-5 w-5" />}
              {syncing ? 'Sending...' : online ? `Send ${waiting} now` : 'Offline: will send later'}
            </button>
          )}

          <ul className="mt-4 divide-y divide-ink-200 border-y border-ink-200">
            {items.map((item) => (
              <li key={item.local_id} className="flex items-start gap-3 py-3">
                <Thumb blob={item.image} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{item.child_name}</p>
                  <p className="text-sm text-ink-500">Taken {formatDateTime(item.captured_at)}</p>
                  {item.status === 'pending' ? (
                    <p className="mt-1 text-sm font-semibold text-ink-600">Waiting to send</p>
                  ) : (
                    <>
                      <p className="mt-1 text-sm font-semibold text-sam-ink">Rejected by the server</p>
                      {item.last_error && <p className="text-sm text-ink-500">{item.last_error}</p>}
                      <button type="button" className="mt-1 min-h-[44px] text-sm font-bold text-signal underline underline-offset-4" onClick={() => void retry(item)}>
                        Try sending again
                      </button>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(item)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-500 active:bg-ink-100"
                  aria-label={`Delete saved photo of ${item.child_name}`}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
