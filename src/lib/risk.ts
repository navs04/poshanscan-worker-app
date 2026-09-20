import type { RiskBand } from '../types'

/** WHO MUAC cut-offs for children 6-59 months (mm). */
export const SAM_CUTOFF = 115
export const MAM_CUTOFF = 125

/** Range shown on the on-screen tape. */
export const TAPE_MIN = 90
export const TAPE_MAX = 145

export interface BandInfo {
  code: RiskBand
  short: string
  label: string
  range: string
  actions: string[]
  /** Tailwind classes. Written out in full so Tailwind's scanner can see them. */
  chip: string
  dot: string
  panel: string
}

export const BANDS: Record<RiskBand, BandInfo> = {
  NORMAL: {
    code: 'NORMAL',
    short: 'Normal',
    label: 'Normal',
    range: '125 mm or above',
    actions: [
      'Continue routine care.',
      'Promote adequate feeding practices.',
      'Re-screen at the next scheduled visit.',
    ],
    chip: 'bg-normal-tint text-normal-ink',
    dot: 'bg-normal',
    panel: 'border-normal',
  },
  MAM: {
    code: 'MAM',
    short: 'MAM',
    label: 'Moderate acute malnutrition (MAM)',
    range: '115 to below 125 mm',
    actions: [
      'Give counselling and dietary advice.',
      'Monitor growth more closely.',
      'Re-screen within the recommended interval (for example 2-4 weeks).',
      'Refer the child if there is no improvement.',
    ],
    chip: 'bg-mam-tint text-mam-ink',
    dot: 'bg-mam',
    panel: 'border-mam',
  },
  SAM: {
    code: 'SAM',
    short: 'SAM',
    label: 'Severe acute malnutrition (SAM)',
    range: 'below 115 mm',
    actions: [
      'Refer the child immediately for clinical assessment.',
      'Follow national SAM management guidelines.',
      'Provide therapeutic feeding as per protocol.',
    ],
    chip: 'bg-sam-tint text-sam-ink',
    dot: 'bg-sam',
    panel: 'border-sam',
  },
}

/** Local fallback only: the backend's band is always the one shown when it sends a valid one. */
export function bandFromMuac(mm: number): RiskBand {
  if (mm < SAM_CUTOFF) return 'SAM'
  if (mm < MAM_CUTOFF) return 'MAM'
  return 'NORMAL'
}

export function normalizeBand(value: unknown, muacMm: number): RiskBand {
  const v = String(value ?? '').trim().toUpperCase()
  if (v === 'NORMAL' || v === 'MAM' || v === 'SAM') return v
  return bandFromMuac(muacMm)
}

export type ConfidenceLevel = 'high' | 'fair' | 'low'

export function confidenceLevel(score: number, low: number, high: number): ConfidenceLevel {
  if (score < low) return 'low'
  return score < high ? 'fair' : 'high'
}
