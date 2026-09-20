import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import BrandMark from '../components/BrandMark'
import MuacTape from '../components/MuacTape'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { ApiError, NetworkError } from '../lib/api'
import { config } from '../lib/config'

export default function Login() {
  const { session, login, notice } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Free hosting sleeps when idle: tell the worker why the first sign-in is slow.
  useEffect(() => {
    if (!busy) {
      setSlow(false)
      return
    }
    const id = window.setTimeout(() => setSlow(true), config.slowHintMs)
    return () => window.clearTimeout(id)
  }, [busy])

  if (session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const cleaned = phone.replace(/[\s-]/g, '')
    if (!/^\+?\d{10,15}$/.test(cleaned)) {
      setError('Enter your phone number with 10 digits.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await login(cleaned, password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof NetworkError) {
        setError('Cannot reach the server. Check your connection and try again.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Phone number or password is incorrect.')
      } else {
        setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.')
      }
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-8 pt-10">
      <div className="flex items-center gap-2.5">
        <BrandMark className="h-4 w-10" />
        <span className="text-sm font-bold text-ink-600">Field worker app</span>
      </div>

      <h1 className="mt-6 font-display text-[44px] font-semibold leading-none tracking-tight">PoshanScan</h1>
      <p className="mt-3 max-w-[30ch] text-lg leading-snug text-ink-600">
        Measure a child's arm with your phone and keep every screening on record.
      </p>

      <div className="mt-8">
        <MuacTape />
      </div>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        {notice && <Alert tone="warning">{notice}</Alert>}

        <div>
          <label htmlFor="phone" className="field-label">
            Phone number
          </label>
          <input
            id="phone"
            className="field-input"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98765 43210"
          />
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            id="password"
            className="field-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <Alert tone="error">{error}</Alert>}
        {slow && (
          <Alert tone="info">The server is waking up after being idle. This can take up to a minute.</Alert>
        )}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Spinner className="h-5 w-5" /> : null}
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="mt-auto pt-10 text-sm text-ink-500">
        PoshanScan is a screening aid. It does not diagnose malnutrition.
      </p>
    </div>
  )
}
