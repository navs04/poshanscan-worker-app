import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Alert from '../components/Alert'
import CameraOverlay from '../components/CameraOverlay'
import { AlertIcon, ArrowLeftIcon, CheckIcon, ImageIcon } from '../components/icons'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'
import { useCamera } from '../hooks/useCamera'
import { ApiError, NetworkError, submitScan } from '../lib/api'
import { config, REFERENCE_LABEL } from '../lib/config'
import { addHistory, getCachedChild } from '../lib/db'
import { shrinkIfLarge } from '../lib/image'
import { analyseBlob, analyseSource, type QualityReport } from '../lib/imageQuality'
import { enqueueScan } from '../lib/offlineQueue'
import { ageInMonths, formatAge, isEligibleAge, uuid } from '../lib/utils'
import type { Child, ResultState } from '../types'

type Stage = 'camera' | 'review' | 'sending'

interface Photo {
  blob: Blob
  url: string
  quality: QualityReport | null
}

interface SubmitError {
  message: string
  /** true = the photo itself is the problem, the worker must retake it. */
  retake: boolean
}

/** Turns a rejected-capture response into something a field worker can act on. */
function captureMessage(err: ApiError): string {
  if (err.code === 'reference_object_not_detected') {
    return `The ${REFERENCE_LABEL[config.referenceType]} was not found. Keep the whole ${REFERENCE_LABEL[config.referenceType]} flat, in focus and beside the arm, then retake the photo.`
  }
  return err.message
}

export default function Capture() {
  const { childId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { refresh } = useSync()
  const { videoRef, status, start, stop, capture } = useCamera()
  const fileRef = useRef<HTMLInputElement>(null)

  const routeChild = (useLocation().state as { child?: Child } | null)?.child ?? null
  const [child, setChild] = useState<Child | null>(routeChild)
  const [stage, setStage] = useState<Stage>('camera')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [live, setLive] = useState<QualityReport | null>(null)
  const [error, setError] = useState<SubmitError | null>(null)
  const [slow, setSlow] = useState(false)
  // One idempotency key per photo: retries reuse it so the backend can drop duplicates.
  const attemptRef = useRef<{ id: string; at: string } | null>(null)

  // If we arrived without router state (e.g. page reload), look the child up on this phone.
  useEffect(() => {
    if (child || !childId) return
    let cancelled = false
    void getCachedChild(childId)
      .then((c) => {
        if (cancelled) return
        if (c) setChild(c)
        else navigate('/', { replace: true })
      })
      .catch(() => navigate('/', { replace: true }))
    return () => {
      cancelled = true
    }
  }, [child, childId, navigate])

  // Camera runs only while the worker is framing a shot.
  useEffect(() => {
    if (child && stage === 'camera') void start()
    else stop()
  }, [child, stage, start, stop])

  // Live feedback about focus and lighting, twice a second.
  useEffect(() => {
    if (stage !== 'camera' || status !== 'ready') {
      setLive(null)
      return
    }
    const id = window.setInterval(() => {
      const v = videoRef.current
      if (!v || v.readyState < 2 || !v.videoWidth) return
      try {
        setLive(analyseSource(v, v.videoWidth, v.videoHeight))
      } catch {
        /* analysis is advisory: ignore failures */
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [stage, status, videoRef])

  // Free the preview image when it is replaced or the page closes.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url)
    }
  }, [photo])

  if (!child || !session) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-ink-900 text-white">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const months = ageInMonths(child.dob)
  const outsideAge = months !== null && !isEligibleAge(months)
  const refName = REFERENCE_LABEL[config.referenceType]

  /* ---------- actions ---------- */

  async function acceptBlob(blob: Blob) {
    let quality: QualityReport | null = null
    try {
      quality = await analyseBlob(blob)
    } catch {
      /* cannot analyse in this browser: the server still validates */
    }
    attemptRef.current = { id: uuid(), at: new Date().toISOString() }
    setPhoto({ blob, url: URL.createObjectURL(blob), quality })
    setError(null)
    setStage('review')
  }

  async function takePhoto() {
    try {
      await acceptBlob(await capture())
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Could not take the photo.', retake: false })
    }
  }

  function onFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again
    if (file) void shrinkIfLarge(file).then(acceptBlob)
  }

  function retake() {
    setPhoto(null)
    setError(null)
    setStage('camera')
  }

  async function saveForLater() {
    if (!photo || !attemptRef.current || !child || !session) return
    try {
      await enqueueScan({
        local_id: attemptRef.current.id,
        worker_id: session.user_id,
        child_id: child.child_id,
        child_name: child.name,
        image: photo.blob,
        captured_at: attemptRef.current.at,
        reference_type: config.referenceType,
        reference_size_mm: config.referenceSizeMm,
      })
      await refresh()
      const state: ResultState = { kind: 'queued', child }
      navigate('/result', { replace: true, state })
    } catch {
      setStage('review')
      setError({
        message: 'Could not save the scan on this phone. Free up some storage and try again.',
        retake: false,
      })
    }
  }

  async function send() {
    if (!photo || !attemptRef.current || !child || !session) return
    setError(null)

    if (!navigator.onLine) {
      await saveForLater()
      return
    }

    setStage('sending')
    setSlow(false)
    const slowTimer = window.setTimeout(() => setSlow(true), config.slowHintMs)
    try {
      const result = await submitScan({
        image: photo.blob,
        childId: child.child_id,
        workerId: session.user_id,
        clientScanId: attemptRef.current.id,
        capturedAt: attemptRef.current.at,
        referenceType: config.referenceType,
        referenceSizeMm: config.referenceSizeMm,
      })
      await addHistory({ ...result, child_name: child.name, via_queue: false }).catch(() => undefined)
      const state: ResultState = { kind: 'done', child, result }
      navigate('/result', { replace: true, state })
    } catch (err) {
      if (err instanceof NetworkError) {
        // No usable connection: keep the photo safe and send it later.
        await saveForLater()
        return
      }
      setStage('review')
      if (err instanceof ApiError && err.status === 422) {
        setError({ message: captureMessage(err), retake: true })
      } else if (err instanceof ApiError && err.status === 401) {
        /* the API layer signs the worker out; the login screen explains why */
      } else {
        setError({
          message: err instanceof Error ? err.message : 'Something went wrong. Try again.',
          retake: false,
        })
      }
    } finally {
      window.clearTimeout(slowTimer)
    }
  }

  /* ---------- views ---------- */

  const poorPhoto = !!photo?.quality && !photo.quality.ok
  const livePill = live ? (live.ok ? { text: 'Looks good', good: true } : { text: live.issues[0].short, good: false }) : null

  return (
    <div className="fixed inset-0 flex flex-col bg-ink-900 text-white">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFilePicked}
      />

      {/* top bar */}
      <div className="z-10 flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link
          to="/"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-900/60 active:bg-ink-700"
          aria-label="Back to search"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold leading-tight">{child.name}</p>
          <p className="truncate text-xs text-ink-300">{formatAge(child.dob)}</p>
        </div>
        {stage === 'camera' && livePill && (
          <span
            role="status"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              livePill.good ? 'bg-normal text-white' : 'bg-mam text-ink-900'
            }`}
          >
            {livePill.good ? <CheckIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}
            {livePill.text}
          </span>
        )}
      </div>

      {outsideAge && (
        <p className="z-10 mx-3 mt-2 rounded-lg bg-mam px-3 py-2 text-xs font-semibold text-ink-900">
          This child is outside 6-59 months. The MUAC bands do not apply.
        </p>
      )}

      {stage === 'camera' ? (
        <>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />
            {status === 'ready' && <CameraOverlay reference={config.referenceType} sizeMm={config.referenceSizeMm} />}

            {status !== 'ready' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-900 px-8 text-center">
                {status === 'starting' || status === 'idle' ? (
                  <>
                    <Spinner className="h-8 w-8" />
                    <p className="text-ink-300">Starting the camera...</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold">
                      {status === 'denied' ? 'Camera access is off' : 'The camera is not available'}
                    </p>
                    <p className="max-w-[32ch] text-ink-300">
                      {status === 'denied'
                        ? 'Allow camera access for this site in your browser settings, then try again.'
                        : 'Open the app over a secure (https) connection, or take the photo with your phone camera app.'}
                    </p>
                    <button type="button" className="btn-light" onClick={() => void start()}>
                      Try the camera again
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* bottom controls */}
          <div className="z-10 bg-ink-900 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {error && (
              <div className="mb-3">
                <Alert tone="error">{error.message}</Alert>
              </div>
            )}
            <p className="mb-3 text-center text-sm text-ink-200">
              Let the arm hang relaxed. Hold the {config.referenceSizeMm} mm {refName} flat beside it, fully visible.
            </p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-14 w-fit min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-xs font-bold text-ink-200 active:bg-ink-700"
              >
                <ImageIcon className="h-6 w-6" />
                Phone camera
              </button>
              <button
                type="button"
                onClick={() => void takePhoto()}
                disabled={status !== 'ready'}
                aria-label="Take photo"
                className="h-[76px] w-[76px] rounded-full border-4 border-white p-1 transition-transform active:scale-95 disabled:opacity-40"
              >
                <span className="block h-full w-full rounded-full bg-white" />
              </button>
              <span />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="relative min-h-0 flex-1 bg-black">
            {photo && <img src={photo.url} alt="Photo to check" className="absolute inset-0 h-full w-full object-contain" />}
            {stage === 'sending' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-900/90 px-8 text-center">
                <Spinner className="h-10 w-10" />
                <p className="text-lg font-bold">Measuring the arm...</p>
                {slow && (
                  <p className="max-w-[32ch] text-ink-300">
                    The server is waking up after being idle. This can take up to a minute. Keep this screen open.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* review panel */}
          <div className="z-10 flex flex-col gap-3 rounded-t-2xl bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-ink-900">
            <h1 className="font-display text-xl font-semibold">Check the photo</h1>

            {photo?.quality &&
              (photo.quality.ok ? (
                <Alert tone="success">Focus and lighting look good.</Alert>
              ) : (
                <Alert tone="warning" title="This photo may not measure well">
                  {photo.quality.issues.map((i) => (
                    <p key={i.code}>{i.message}</p>
                  ))}
                </Alert>
              ))}

            {error && <Alert tone="error">{error.message}</Alert>}

            {error?.retake ? (
              <button type="button" className="btn-primary" onClick={retake}>
                Retake photo
              </button>
            ) : poorPhoto && !error ? (
              <>
                <button type="button" className="btn-primary" onClick={retake} disabled={stage === 'sending'}>
                  Retake photo
                </button>
                <button type="button" className="btn-secondary" onClick={() => void send()} disabled={stage === 'sending'}>
                  Use this photo anyway
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-primary" onClick={() => void send()} disabled={stage === 'sending'}>
                  {error ? 'Try sending again' : 'Measure this photo'}
                </button>
                <button type="button" className="btn-secondary" onClick={retake} disabled={stage === 'sending'}>
                  Retake photo
                </button>
                {error && (
                  <button type="button" className="btn-text" onClick={() => void saveForLater()}>
                    Save on this phone and send later
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
