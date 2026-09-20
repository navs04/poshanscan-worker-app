/** crypto.randomUUID needs a secure context; fall back so http://LAN testing doesn't crash. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Whole months between a YYYY-MM-DD date of birth and today. null if unparseable or in the future. */
export function ageInMonths(dob: string, now: Date = new Date()): number | null {
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)
  if (now.getDate() < d) months -= 1
  return months < 0 ? null : months
}

export function formatAge(dob: string, now: Date = new Date()): string {
  const months = ageInMonths(dob, now)
  if (months === null) return 'Age unknown'
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${rest} mo`
  return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`
}

/** MUAC screening bands are defined for children 6-59 months. */
export function isEligibleAge(months: number | null): boolean {
  return months !== null && months >= 6 && months <= 59
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const mins = Math.round((now - t) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} d ago`
}

export const GENDER_LABEL = { M: 'Boy', F: 'Girl', O: 'Other' } as const
