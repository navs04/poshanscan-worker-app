import { useSync } from '../context/SyncContext'

export default function Toast() {
  const { toast, dismissToast } = useSync()
  if (!toast) return null
  const color = toast.tone === 'success' ? 'bg-normal-ink' : 'bg-ink-800'
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto max-w-md px-3">
      <button
        type="button"
        onClick={dismissToast}
        role="status"
        aria-live="polite"
        className={`pointer-events-auto w-full rounded-lg px-4 py-3 text-left text-sm font-semibold text-white shadow-lg ${color}`}
      >
        {toast.message}
      </button>
    </div>
  )
}
