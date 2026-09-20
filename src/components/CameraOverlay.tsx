import { REFERENCE_LABEL } from '../lib/config'
import type { ReferenceType } from '../types'

/**
 * Guidance drawn over the live camera view: where the arm goes and where the reference
 * object goes. Positions are percentages of the screen, so this is a guide, not a crop.
 */
export default function CameraOverlay({ reference, sizeMm }: { reference: ReferenceType; sizeMm: number }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {/* arm zone */}
      <div className="absolute bottom-[14%] left-[8%] top-[12%] w-[50%] rounded-[28px] border-2 border-dashed border-white/85">
        <span className="absolute -top-3 left-4 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-ink-900">
          Upper arm
        </span>
        {/* mid-arm line */}
        <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-mam" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded bg-mam px-1.5 py-0.5 text-[11px] font-bold text-ink-900">
          Middle of the arm
        </span>
      </div>

      {/* reference object zone */}
      <div className="absolute bottom-[26%] right-[6%] aspect-square w-[30%]">
        <span className="absolute left-0 top-0 h-5 w-5 rounded-tl-md border-l-4 border-t-4 border-white" />
        <span className="absolute right-0 top-0 h-5 w-5 rounded-tr-md border-r-4 border-t-4 border-white" />
        <span className="absolute bottom-0 left-0 h-5 w-5 rounded-bl-md border-b-4 border-l-4 border-white" />
        <span className="absolute bottom-0 right-0 h-5 w-5 rounded-br-md border-b-4 border-r-4 border-white" />
        <span className="absolute -top-8 right-0 whitespace-nowrap rounded-full bg-ink-900/75 px-2.5 py-1 text-xs font-bold text-white">
          {sizeMm} mm {REFERENCE_LABEL[reference]}
        </span>
      </div>
    </div>
  )
}
