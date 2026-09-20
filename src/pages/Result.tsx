import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import ActionBar from '../components/ActionBar'
import Alert from '../components/Alert'
import MuacTape from '../components/MuacTape'
import { useSync } from '../context/SyncContext'
import { config } from '../lib/config'
import { BANDS, confidenceLevel } from '../lib/risk'
import { ageInMonths, formatAge, formatDateTime, isEligibleAge } from '../lib/utils'
import type { ResultState } from '../types'

const LEVEL_LABEL = { high: 'High', fair: 'Fair', low: 'Low' } as const

export default function Result() {
  const state = useLocation().state as ResultState | null
  const navigate = useNavigate()
  const { pending } = useSync()

  if (!state) return <Navigate to="/" replace />
  const { child } = state
  const retake = () => navigate(`/capture/${child.child_id}`, { replace: true, state: { child } })

  /* ---- saved offline ---- */
  if (state.kind === 'queued') {
    return (
      <div className="pb-36">
        <p className="text-sm font-bold text-ink-500">{child.name}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold leading-tight tracking-tight">
          Saved on this phone
        </h1>
        <p className="mt-3 text-lg leading-snug text-ink-600">
          The photo could not be sent right now. It will be measured and uploaded automatically when the
          phone has a connection.
        </p>
        <div className="mt-5">
          <Alert tone="info">
            {pending} scan{pending === 1 ? ' is' : 's are'} waiting to be sent. Nothing is lost if you close
            the app.
          </Alert>
        </div>
        <Link to="/queue" className="mt-4 inline-block font-bold text-signal underline underline-offset-4">
          See unsent scans
        </Link>
        <ActionBar>
          <button type="button" className="btn-primary" onClick={() => navigate('/', { replace: true })}>
            Next child
          </button>
        </ActionBar>
      </div>
    )
  }

  /* ---- measured ---- */
  const { result } = state
  const band = BANDS[result.risk_band]
  const level = confidenceLevel(result.confidence_score, config.lowConfidence, config.highConfidence)
  const months = ageInMonths(child.dob)

  return (
    <div className="pb-36">
      <p className="text-sm font-bold text-ink-500">
        {child.name}, {formatAge(child.dob)}
      </p>
      <p className="text-sm text-ink-500">{formatDateTime(result.created_at)}</p>

      {/* the reading */}
      <section className="mt-4" aria-label="Measurement result">
        <p className="text-sm font-semibold text-ink-600">Estimated MUAC</p>
        <p className="font-display leading-none tracking-tight">
          <span className="text-[76px] font-semibold tabular-nums">{result.muac_estimate_mm.toFixed(1)}</span>
          <span className="ml-2 text-2xl font-medium text-ink-500">mm</span>
        </p>

        <div className="mt-2">
          <MuacTape value={result.muac_estimate_mm} />
        </div>

        <div className={`mt-2 rounded-xl border-l-8 bg-white px-4 py-3 ${band.panel}`}>
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-extrabold ${band.chip}`}>
            {band.label}
          </span>
          <p className="mt-1.5 text-sm text-ink-500">Screening band: {band.range}</p>
        </div>
      </section>

      {/* confidence */}
      <section className="mt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">Confidence</h2>
          <p className="text-sm font-semibold text-ink-600">
            {LEVEL_LABEL[level]}, {Math.round(result.confidence_score * 100)}%
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-200">
          <div
            className={`h-full rounded-full ${level === 'low' ? 'bg-mam' : 'bg-ink-700'}`}
            style={{ width: `${Math.round(Math.min(1, Math.max(0, result.confidence_score)) * 100)}%` }}
          />
        </div>
      </section>

      <div className="mt-4 flex flex-col gap-3">
        {level === 'low' && (
          <Alert tone="warning" title="Low confidence: measure again">
            Do not rely on this number. Retake the photo, or measure the child with a MUAC tape.
          </Alert>
        )}
        {months !== null && !isEligibleAge(months) && (
          <Alert tone="warning" title="Outside the screening age">
            The bands above apply to children aged 6 to 59 months.
          </Alert>
        )}
      </div>

      {/* what to do */}
      <section className="mt-6">
        <h2 className="text-base font-bold">What to do next</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-snug marker:text-ink-400">
          {band.actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        {result.risk_band !== 'NORMAL' && (
          <p className="mt-3 text-sm font-semibold">
            A child in this band must be assessed by trained health personnel.
          </p>
        )}
      </section>

      <p className="mt-6 text-sm leading-snug text-ink-500">
        PoshanScan is a screening aid and does not diagnose malnutrition. Follow ICDS and WHO guidelines
        for any child flagged at risk.
      </p>

      <ActionBar>
        <button type="button" className="btn-primary" onClick={() => navigate('/', { replace: true })}>
          Next child
        </button>
        <button type="button" className="btn-secondary" onClick={retake}>
          Take this child's photo again
        </button>
      </ActionBar>
    </div>
  )
}
