import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, login as apiLogin, setAuthToken, setUnauthorizedHandler } from '../lib/api'
import type { Session } from '../types'

const STORAGE_KEY = 'poshanscan.session'

interface AuthValue {
  session: Session | null
  /** Why the worker was signed out, shown once on the login screen. */
  notice: string | null
  login: (phone: string, password: string) => Promise<void>
  logout: (notice?: string) => void
}

const AuthContext = createContext<AuthValue | null>(null)

/** Reads the `exp` claim (seconds since epoch) from a JWT without verifying it. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = JSON.parse(json).exp
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    if (!session.access_token || !session.user_id) return null
    const exp = jwtExpiry(session.access_token)
    if (exp !== null && exp * 1000 < Date.now()) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // The token is set inside the initialiser on purpose: child effects (e.g. the sync
  // provider) run before this component's own effects and would otherwise send no token.
  const [session, setSession] = useState<Session | null>(() => {
    const stored = loadSession()
    setAuthToken(stored?.access_token ?? null)
    return stored
  })
  const [notice, setNotice] = useState<string | null>(null)

  const logout = useCallback((message?: string) => {
    setAuthToken(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* storage unavailable */
    }
    setSession(null)
    setNotice(message ?? null)
  }, [])

  const login = useCallback(async (phone: string, password: string) => {
    const res = await apiLogin(phone, password)
    if (res.role === 'supervisor') {
      throw new ApiError(
        403,
        'This is a supervisor account. Sign in on the supervisor dashboard instead.',
        'wrong_role',
      )
    }
    const next: Session = { access_token: res.access_token, role: res.role, user_id: res.user_id, phone }
    setAuthToken(next.access_token)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable: the worker stays signed in for this tab only */
    }
    setNotice(null)
    setSession(next)
  }, [])

  // Any 401 from the API signs the worker out. Queued scans stay on the phone.
  useEffect(() => {
    setUnauthorizedHandler(() => logout('Your session expired. Sign in again to continue.'))
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const value = useMemo(() => ({ session, notice, login, logout }), [session, notice, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
