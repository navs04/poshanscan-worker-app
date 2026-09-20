import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import ChildRow from '../components/ChildRow'
import { PlusIcon, SearchIcon } from '../components/icons'
import Spinner from '../components/Spinner'
import { NetworkError, searchChildren } from '../lib/api'
import { cacheChildren, recentChildren, recentHistory, searchCachedChildren } from '../lib/db'
import { BANDS } from '../lib/risk'
import { timeAgo } from '../lib/utils'
import type { Child, HistoryEntry } from '../types'

export default function ChildSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Child[] | null>(null) // null = no search yet
  const [loading, setLoading] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<Child[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])

  useEffect(() => {
    void Promise.all([recentChildren(6), recentHistory(5)])
      .then(([children, entries]) => {
        setRecent(children)
        setHistory(entries)
      })
      .catch(() => undefined)
  }, [])

  // Debounced search. Falls back to children cached on this phone when the server is unreachable.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults(null)
      setLoading(false)
      setFromCache(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        if (!navigator.onLine) throw new NetworkError('offline')
        const found = await searchChildren(term)
        if (cancelled) return
        setResults(found)
        setFromCache(false)
        setError(null)
        void cacheChildren(found).catch(() => undefined)
      } catch (err) {
        if (cancelled) return
        if (err instanceof NetworkError) {
          setResults(await searchCachedChildren(term).catch(() => []))
          setFromCache(true)
          setError(null)
        } else {
          setResults([])
          setError(err instanceof Error ? err.message : 'Search failed.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [q])

  function select(child: Child) {
    void cacheChildren([child]).catch(() => undefined)
    navigate(`/capture/${child.child_id}`, { state: { child } })
  }

  const searching = results !== null || loading

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Find a child</h1>
        <div className="relative mt-3">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
          <input
            className="field-input pl-12"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Name, guardian or ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search for a child"
          />
          {loading && <Spinner className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />}
        </div>
        <Link to="/children/new" state={{ name: q.trim() }} className="btn-secondary mt-3">
          <PlusIcon className="h-5 w-5" />
          Register a new child
        </Link>
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      {fromCache && (
        <Alert tone="info">No connection. Showing children saved on this phone.</Alert>
      )}

      {searching && results !== null && (
        <section aria-live="polite">
          {results.length === 0 ? (
            <div className="border-t border-ink-200 pt-4">
              <p className="font-bold">No child found for "{q.trim()}"</p>
              <p className="mt-1 text-sm text-ink-500">Check the spelling, or register the child if this is their first screening.</p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-200 border-y border-ink-200">
              {results.map((c) => (
                <ChildRow key={c.child_id} child={c} onSelect={select} />
              ))}
            </ul>
          )}
        </section>
      )}

      {!searching && recent.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-bold text-ink-600">Recently used</h2>
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {recent.map((c) => (
              <ChildRow key={c.child_id} child={c} onSelect={select} />
            ))}
          </ul>
        </section>
      )}

      {!searching && history.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-bold text-ink-600">Recent screenings</h2>
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {history.map((h) => {
              const band = BANDS[h.risk_band]
              return (
                <li key={h.scan_id} className="flex items-center gap-3 py-3">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${band.dot}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{h.child_name}</span>
                    <span className="block text-sm text-ink-500">{timeAgo(h.created_at)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-lg font-semibold tabular-nums">
                      {h.muac_estimate_mm.toFixed(1)} mm
                    </span>
                    <span className="block text-sm font-semibold text-ink-600">{band.short}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!searching && recent.length === 0 && history.length === 0 && (
        <p className="text-ink-500">
          Search for a child to start a screening. Children you register or search for are saved on this
          phone, so you can find them again without a connection.
        </p>
      )}
    </div>
  )
}
