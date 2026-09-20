import { useEffect, useState } from 'react'
import { MAM_CUTOFF, SAM_CUTOFF, TAPE_MAX, TAPE_MIN } from '../lib/risk'

const SPAN = TAPE_MAX - TAPE_MIN
const pct = (mm: number) => Math.min(100, Math.max(0, ((mm - TAPE_MIN) / SPAN) * 100))

interface Props {
  /** Measured MUAC in mm. Leave undefined for a plain tape with no needle. */
  value?: number
}

/**
 * A MUAC tape as a picture: red below 115 mm, yellow to 125 mm, green above.
 * With a value, a needle slides from the left edge to the measurement.
 */
export default function MuacTape({ value }: Props) {
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setArrived(true), 120)
    return () => window.clearTimeout(id)
  }, [])

  const sam = pct(SAM_CUTOFF)
  const mam = pct(MAM_CUTOFF)
  const needleLeft = value === undefined ? 0 : arrived ? pct(value) : 0

  return (
    <div
      role="img"
      aria-label={
        value === undefined
          ? 'MUAC screening tape: red below 115 mm, yellow 115 to 125 mm, green 125 mm and above'
          : `Measured MUAC ${value.toFixed(1)} mm on the screening tape`
      }
      className="relative px-1 pb-7 pt-3"
    >
      <div className="relative flex h-12 overflow-hidden rounded-md">
        <div className="flex items-end justify-center bg-sam pb-1 text-[11px] font-bold text-white" style={{ width: `${sam}%` }}>
          SAM
        </div>
        <div className="flex items-end justify-center bg-mam pb-1 text-[11px] font-bold text-ink-900" style={{ width: `${mam - sam}%` }}>
          MAM
        </div>
        <div className="flex items-end justify-center bg-normal pb-1 text-[11px] font-bold text-white" style={{ width: `${100 - mam}%` }}>
          Normal
        </div>
        {/* millimetre ticks every 5 mm, like the printed tape */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.28) 1.5px, transparent 1.5px)',
            backgroundSize: `${100 / (SPAN / 5)}% 42%`,
            backgroundRepeat: 'repeat-x',
          }}
        />
      </div>

      {value !== undefined && (
        <div
          className="absolute top-0 bottom-[22px] w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_#0D1729] transition-[left] duration-[900ms] ease-out motion-reduce:transition-none"
          style={{ left: `calc(4px + (100% - 8px) * ${needleLeft / 100})` }}
        />
      )}

      {/* cut-off labels */}
      <span
        className="absolute bottom-1 -translate-x-1/2 text-xs font-semibold tabular-nums text-ink-600"
        style={{ left: `calc(4px + (100% - 8px) * ${sam / 100})` }}
      >
        {SAM_CUTOFF}
      </span>
      <span
        className="absolute bottom-1 -translate-x-1/2 text-xs font-semibold tabular-nums text-ink-600"
        style={{ left: `calc(4px + (100% - 8px) * ${mam / 100})` }}
      >
        {MAM_CUTOFF}
      </span>
    </div>
  )
}
