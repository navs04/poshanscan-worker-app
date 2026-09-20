import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { countQueue, syncQueue, type SyncSummary } from '../lib/offlineQueue'
import { useAuth } from './AuthContext'

export interface ToastMessage {
  tone: 'success' | 'warning'
  message: string
}

interface SyncValue {
  online: boolean
  /** Unsent scans for the signed-in worker (waiting + rejected). */
  pending: number
  syncing: boolean
  toast: ToastMessage | null
  dismissToast: () => void
  /** Recount the queue (call after adding or removing items). */
  refresh: () => Promise<void>
  /** Returns null when there was nothing to do (offline, signed out, already running). */
  syncNow: () => Promise<SyncSummary | null>
}

const SyncContext = createContext<SyncValue | null>(null)

const RETRY_EVERY_MS = 30_000

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user_id

  const [online, setOnline] = useState(() => navigator.onLine)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastTimer = useRef<number>()

  const showToast = useCallback((next: ToastMessage) => {
    setToast(next)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 5000)
  }, [])

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current)
    setToast(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) {
      setPending(0)
      return
    }
    try {
      setPending(await countQueue(userId))
    } catch {
      /* IndexedDB unavailable (e.g. some private modes) */
    }
  }, [userId])

  const syncNow = useCallback(async (): Promise<SyncSummary | null> => {
    if (!userId || !navigator.onLine) return null
    setSyncing(true)
    try {
      const summary = await syncQueue(userId)
      await refresh()
      if (summary.synced > 0) {
        showToast({
          tone: 'success',
          message: `${summary.synced} saved scan${summary.synced > 1 ? 's' : ''} sent to the server.`,
        })
      } else if (summary.failed > 0) {
        showToast({
          tone: 'warning',
          message: `${summary.failed} scan${summary.failed > 1 ? 's were' : ' was'} rejected. Open Unsent scans to review.`,
        })
      }
      return summary
    } finally {
      setSyncing(false)
    }
  }, [userId, refresh, showToast])

  // Listeners below always call the latest syncNow without re-subscribing.
  const syncRef = useRef(syncNow)
  syncRef.current = syncNow

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      void syncRef.current()
    }
    const goOffline = () => setOnline(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setOnline(navigator.onLine)
        void syncRef.current()
      }
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // On sign-in / app start: count what is waiting, then try to send it.
  useEffect(() => {
    void refresh().then(() => syncRef.current())
  }, [refresh])

  // navigator.onLine can say "online" while there is no data: keep retrying while scans wait.
  useEffect(() => {
    if (!userId || pending === 0) return
    const id = window.setInterval(() => void syncRef.current(), RETRY_EVERY_MS)
    return () => window.clearInterval(id)
  }, [userId, pending])

  const value = useMemo<SyncValue>(
    () => ({ online, pending, syncing, toast, dismissToast, refresh, syncNow }),
    [online, pending, syncing, toast, dismissToast, refresh, syncNow],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>')
  return ctx
}
