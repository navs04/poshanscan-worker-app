import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'
import BrandMark from './BrandMark'
import { LogoutIcon } from './icons'

export default function Layout() {
  const { logout } = useAuth()
  const { online, pending, syncing } = useSync()
  const navigate = useNavigate()

  function signOut() {
    if (pending > 0) {
      const ok = window.confirm(
        `${pending} scan${pending > 1 ? 's are' : ' is'} still waiting to be sent. They stay on this phone and send after you sign in again. Sign out now?`,
      )
      if (!ok) return
    }
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-[100dvh] bg-paper">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2" aria-label="PoshanScan home">
            <BrandMark />
            <span className="font-display text-lg font-semibold tracking-tight">PoshanScan</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <span
              role="status"
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                online ? 'bg-normal-tint text-normal-ink' : 'bg-ink-800 text-white'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-normal' : 'bg-mam'}`} />
              {online ? (syncing ? 'Sending...' : 'Online') : 'Offline'}
            </span>

            {pending > 0 && (
              <Link
                to="/queue"
                className="flex h-8 min-w-8 items-center justify-center rounded-full bg-mam px-2.5 text-sm font-extrabold text-ink-900"
                aria-label={`${pending} unsent scans`}
              >
                {pending}
              </Link>
            )}

            <button
              type="button"
              onClick={signOut}
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-600 active:bg-ink-100"
              aria-label="Sign out"
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-10 pt-5">
        <Outlet />
      </main>
    </div>
  )
}
