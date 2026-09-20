import { config } from './config'
import { normalizeBand } from './risk'
import type { Child, NewChildInput, QueuedScan, Role, ScanResult } from '../types'

/* ---------- errors ---------- */

/** The server answered with a non-2xx status. */
export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** No usable answer: offline, DNS failure, CORS failure or timeout. */
export class NetworkError extends Error {
  timedOut: boolean
  constructor(message: string, timedOut = false) {
    super(message)
    this.name = 'NetworkError'
    this.timedOut = timedOut
  }
}

/* ---------- auth plumbing ---------- */

let authToken: string | null = null
let onUnauthorized: (() => void) | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

/* ---------- request helper ---------- */

interface RequestOptions {
  method?: 'GET' | 'POST'
  json?: unknown
  form?: FormData
  timeoutMs?: number
  /** false for /auth/login, where a 401 just means "wrong password". */
  auth?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, form, timeoutMs = config.requestTimeoutMs, auth = true } = opts

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (auth && authToken) headers.Authorization = `Bearer ${authToken}`
  let body: BodyInit | undefined
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form // the browser sets the multipart boundary itself
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(config.apiBaseUrl + path, { method, headers, body, signal: controller.signal })
  } catch {
    throw controller.signal.aborted
      ? new NetworkError('The server took too long to respond.', true)
      : new NetworkError('Cannot reach the server.')
  } finally {
    window.clearTimeout(timer)
  }

  const text = await res.text()
  let data: Json = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON body (e.g. an HTML error page from a proxy) */
  }

  if (!res.ok) {
    if (res.status === 401 && auth) onUnauthorized?.()
    throw toApiError(res.status, data)
  }
  return data as T
}

/** Understands both `{error, message}` and FastAPI's `{detail: ...}` error bodies. */
function toApiError(status: number, data: Json): ApiError {
  const detail = data?.detail
  const source: Json =
    detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : data

  let message: string | undefined = source?.message
  if (!message && typeof detail === 'string') message = detail
  if (!message && Array.isArray(detail)) {
    message = detail.map((d: Json) => d?.msg).filter(Boolean).join(', ')
  }
  return new ApiError(status, message || `Request failed (${status}).`, source?.error ?? source?.code)
}

/* ---------- normalisers (tolerate small backend naming differences) ---------- */

function normalizeChild(raw: Json, fallback?: Partial<Child>): Child {
  return {
    child_id: String(raw?.child_id ?? raw?.id ?? fallback?.child_id ?? ''),
    name: raw?.name ?? fallback?.name ?? 'Unnamed child',
    dob: String(raw?.dob ?? fallback?.dob ?? ''),
    gender: raw?.gender ?? fallback?.gender ?? 'O',
    guardian_name: raw?.guardian_name ?? fallback?.guardian_name,
    village: raw?.village ?? fallback?.village,
  }
}

export function normalizeScan(raw: Json): ScanResult {
  const muac = Number(raw?.muac_estimate_mm)
  return {
    scan_id: String(raw?.scan_id ?? raw?.id ?? ''),
    child_id: String(raw?.child_id ?? ''),
    muac_estimate_mm: muac,
    risk_band: normalizeBand(raw?.risk_band, muac),
    confidence_score: Number(raw?.confidence_score ?? 0),
    created_at: String(raw?.created_at ?? new Date().toISOString()),
  }
}

/* ---------- endpoints ---------- */

export interface LoginResponse {
  access_token: string
  role: Role
  user_id: string
}

/** POST /auth/login */
export function login(phone: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', { method: 'POST', json: { phone, password }, auth: false })
}

/** GET /children/search?q= */
export async function searchChildren(q: string): Promise<Child[]> {
  const data = await request<Json>(`/children/search?q=${encodeURIComponent(q)}`)
  const list: Json[] = Array.isArray(data) ? data : (data?.items ?? data?.results ?? [])
  return list.map((c) => normalizeChild(c))
}

/** POST /children */
export async function registerChild(input: NewChildInput): Promise<Child> {
  const data = await request<Json>('/children', { method: 'POST', json: input })
  return normalizeChild(data, input)
}

export interface SubmitScanInput {
  image: Blob
  childId: string
  workerId: string
  clientScanId: string
  capturedAt: string
  referenceType: string
  referenceSizeMm: number
}

/** POST /scans (multipart). The backend calls the CV service and returns the result. */
export async function submitScan(input: SubmitScanInput): Promise<ScanResult> {
  const form = new FormData()
  form.append('image', input.image, `${input.clientScanId}.jpg`)
  form.append('child_id', input.childId)
  form.append('worker_id', input.workerId)
  // Extras beyond the frozen contract; safe for FastAPI to ignore until Member 2 uses them.
  form.append('client_scan_id', input.clientScanId)
  form.append('captured_at', input.capturedAt)
  form.append('reference_type', input.referenceType)
  form.append('reference_size_mm', String(input.referenceSizeMm))
  const data = await request<Json>('/scans', { method: 'POST', form, timeoutMs: config.scanTimeoutMs })
  return normalizeScan(data)
}

/** One entry of a /sync response: a normal result, or a per-scan error. */
export type SyncItemResult =
  | { ok: true; result: ScanResult }
  | { ok: false; code?: string; message: string }

/**
 * POST /sync (multipart): `metadata` is a JSON array, `images` is one file per entry, same order.
 * Results are matched back by `client_scan_id` when present, otherwise by position.
 */
export async function syncScans(items: QueuedScan[]): Promise<SyncItemResult[]> {
  const form = new FormData()
  form.append(
    'metadata',
    JSON.stringify(
      items.map((i) => ({
        client_scan_id: i.local_id,
        child_id: i.child_id,
        worker_id: i.worker_id,
        captured_at: i.captured_at,
        reference_type: i.reference_type,
        reference_size_mm: i.reference_size_mm,
      })),
    ),
  )
  for (const i of items) form.append('images', i.image, `${i.local_id}.jpg`)

  const data = await request<Json>('/sync', { method: 'POST', form, timeoutMs: config.scanTimeoutMs })
  const list: Json[] = Array.isArray(data) ? data : (data?.results ?? [])

  const byId = new Map<string, Json>()
  for (const r of list) if (r?.client_scan_id) byId.set(String(r.client_scan_id), r)

  return items.map((item, index): SyncItemResult => {
    const raw = byId.get(item.local_id) ?? list[index]
    if (!raw) return { ok: false, message: 'The server returned no result for this scan.' }
    if (raw.error) return { ok: false, code: raw.error, message: raw.message ?? String(raw.error) }
    return { ok: true, result: normalizeScan(raw) }
  })
}
