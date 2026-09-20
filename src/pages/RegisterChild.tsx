import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Alert from '../components/Alert'
import { ArrowLeftIcon } from '../components/icons'
import Spinner from '../components/Spinner'
import { NetworkError, registerChild } from '../lib/api'
import { cacheChildren } from '../lib/db'
import { ageInMonths, formatAge, isEligibleAge } from '../lib/utils'
import type { Gender } from '../types'

const LAST_VILLAGE_KEY = 'poshanscan.lastVillage'

function lastVillage(): string {
  try {
    return localStorage.getItem(LAST_VILLAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'M', label: 'Boy' },
  { value: 'F', label: 'Girl' },
  { value: 'O', label: 'Other' },
]

export default function RegisterChild() {
  const navigate = useNavigate()
  const prefill = (useLocation().state as { name?: string } | null)?.name ?? ''
  const today = new Date().toISOString().slice(0, 10)

  const [name, setName] = useState(prefill)
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<Gender | null>(null)
  const [guardian, setGuardian] = useState('')
  const [village, setVillage] = useState(lastVillage)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const months = dob ? ageInMonths(dob) : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) return setError("Enter the child's name.")
    if (!dob || months === null) return setError('Enter a valid date of birth that is not in the future.')
    if (!gender) return setError('Choose boy, girl or other.')
    if (!navigator.onLine) {
      return setError('Registering a child needs a connection. Reconnect and try again.')
    }

    setBusy(true)
    setError(null)
    try {
      const child = await registerChild({
        name: name.trim(),
        dob,
        gender,
        guardian_name: guardian.trim(),
        village: village.trim(),
      })
      try {
        localStorage.setItem(LAST_VILLAGE_KEY, village.trim())
      } catch {
        /* ignore */
      }
      await cacheChildren([child]).catch(() => undefined)
      navigate(`/capture/${child.child_id}`, { replace: true, state: { child } })
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? 'Cannot reach the server. Check your connection and try again.'
          : err instanceof Error
            ? err.message
            : 'Could not register the child.',
      )
      setBusy(false)
    }
  }

  return (
    <div>
      <Link to="/" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-ink-600">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to search
      </Link>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Register a child</h1>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="name" className="field-label">Child's name</label>
          <input id="name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>

        <div>
          <label htmlFor="dob" className="field-label">Date of birth</label>
          <input id="dob" className="field-input" type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)} />
          {months !== null && (
            <p className="mt-1.5 text-sm text-ink-500">Age: {formatAge(dob)}</p>
          )}
        </div>

        {months !== null && !isEligibleAge(months) && (
          <Alert tone="warning" title="Outside the screening age">
            MUAC bands in this app apply to children aged 6 to 59 months. You can still register this child.
          </Alert>
        )}

        <fieldset>
          <legend className="field-label">Gender</legend>
          <div className="grid grid-cols-3 gap-2">
            {GENDERS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGender(g.value)}
                aria-pressed={gender === g.value}
                className={`min-h-[52px] rounded-xl border-2 text-base font-bold ${
                  gender === g.value ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-300 bg-white text-ink-800'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="guardian" className="field-label">Guardian's name</label>
          <input id="guardian" className="field-input" value={guardian} onChange={(e) => setGuardian(e.target.value)} autoComplete="off" />
        </div>

        <div>
          <label htmlFor="village" className="field-label">Village</label>
          <input id="village" className="field-input" value={village} onChange={(e) => setVillage(e.target.value)} autoComplete="off" />
        </div>

        <p className="text-sm text-ink-500">
          Get the guardian's consent before you register a child or take a photo.
        </p>

        {error && <Alert tone="error">{error}</Alert>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy && <Spinner className="h-5 w-5" />}
          {busy ? 'Saving...' : 'Save and start screening'}
        </button>
      </form>
    </div>
  )
}
