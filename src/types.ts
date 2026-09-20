export type Role = 'worker' | 'supervisor' | 'admin'
export type RiskBand = 'NORMAL' | 'MAM' | 'SAM'
export type Gender = 'M' | 'F' | 'O'
export type ReferenceType = 'aruco' | 'coin' | 'card'

export interface Session {
  access_token: string
  role: Role
  user_id: string
  phone: string
}

export interface Child {
  child_id: string
  name: string
  dob: string // YYYY-MM-DD
  gender: Gender
  guardian_name?: string
  village?: string
}

export interface NewChildInput {
  name: string
  dob: string
  gender: Gender
  guardian_name: string
  village: string
}

/** Shape returned by POST /scans (and each item of POST /sync). */
export interface ScanResult {
  scan_id: string
  child_id: string
  muac_estimate_mm: number
  risk_band: RiskBand
  confidence_score: number // 0..1
  created_at: string
}

/** A finished screening kept on the phone so it can be listed offline. */
export interface HistoryEntry extends ScanResult {
  child_name: string
  via_queue: boolean
}

/** A scan captured on the phone and waiting to be uploaded. */
export interface QueuedScan {
  local_id: string // also sent to the backend as client_scan_id (idempotency key)
  worker_id: string
  child_id: string
  child_name: string
  image: Blob
  captured_at: string // ISO timestamp
  reference_type: ReferenceType
  reference_size_mm: number
  /** pending = will be retried; failed = the server rejected it, needs a human. */
  status: 'pending' | 'failed'
  attempts: number
  last_error?: string
}

export interface CachedChild extends Child {
  last_seen: number // epoch ms, used to sort "recently used"
}

/** Router state passed from Capture to Result. */
export type ResultState =
  | { kind: 'done'; child: Child; result: ScanResult }
  | { kind: 'queued'; child: Child }
