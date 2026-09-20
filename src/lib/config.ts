import type { ReferenceType } from '../types'

const env = import.meta.env

function num(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : fallback
}

const refType = (env.VITE_REFERENCE_TYPE ?? 'aruco') as ReferenceType

export const config = {
  apiBaseUrl: (env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/+$/, ''),

  /** Reference object the worker holds beside the arm. Sent with every scan. */
  referenceType: (['aruco', 'coin', 'card'].includes(refType) ? refType : 'aruco') as ReferenceType,
  referenceSizeMm: num(env.VITE_REFERENCE_SIZE_MM, 50),

  /** Normal API calls. */
  requestTimeoutMs: 20_000,
  /** Scans wait for the CV service; Render/Hugging Face can cold-start for ~1 min. */
  scanTimeoutMs: 90_000,
  /** Show the "server is waking up" hint after this long. */
  slowHintMs: 8_000,

  /** Below this confidence the app tells the worker to re-measure. */
  lowConfidence: 0.6,
  highConfidence: 0.8,

  /** Scans uploaded per POST /sync call. */
  syncBatchSize: 5,

  /** Client-side capture quality gate. These are heuristics: tune with real photos. */
  quality: {
    analysisWidth: 480,
    minSharpness: num(env.VITE_MIN_SHARPNESS, 40), // variance of the Laplacian
    minBrightness: 55, // mean luma, 0-255
    maxBrightness: 215,
  },
} as const

export const REFERENCE_LABEL: Record<ReferenceType, string> = {
  aruco: 'ArUco marker',
  coin: 'coin',
  card: 'card',
}
