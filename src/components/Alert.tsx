import type { ReactNode } from 'react'
import { AlertIcon, CheckIcon } from './icons'

type Tone = 'warning' | 'error' | 'info' | 'success'

const STYLES: Record<Tone, string> = {
  warning: 'bg-mam-tint text-mam-ink',
  error: 'bg-sam-tint text-sam-ink',
  info: 'bg-ink-100 text-ink-700',
  success: 'bg-normal-tint text-normal-ink',
}

export default function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone
  title?: string
  children: ReactNode
}) {
  const Icon = tone === 'success' ? CheckIcon : AlertIcon
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={`flex gap-3 rounded-lg px-4 py-3 text-sm ${STYLES[tone]}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        {title && <p className="font-bold">{title}</p>}
        <div className="leading-snug">{children}</div>
      </div>
    </div>
  )
}
