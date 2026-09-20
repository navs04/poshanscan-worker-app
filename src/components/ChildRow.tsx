import { GENDER_LABEL, ageInMonths, formatAge, isEligibleAge } from '../lib/utils'
import type { Child } from '../types'
import { ChevronRightIcon } from './icons'

export default function ChildRow({ child, onSelect }: { child: Child; onSelect: (c: Child) => void }) {
  const months = ageInMonths(child.dob)
  const details = [GENDER_LABEL[child.gender], formatAge(child.dob), child.village].filter(Boolean).join(', ')
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(child)}
        className="flex min-h-[68px] w-full items-center gap-3 px-1 py-3 text-left active:bg-ink-100"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold">{child.name}</span>
          <span className="block truncate text-sm text-ink-500">{details}</span>
          {child.guardian_name && (
            <span className="block truncate text-sm text-ink-500">Guardian: {child.guardian_name}</span>
          )}
          {months !== null && !isEligibleAge(months) && (
            <span className="mt-1 inline-block rounded-full bg-mam-tint px-2 py-0.5 text-xs font-semibold text-mam-ink">
              Outside 6-59 months
            </span>
          )}
        </span>
        <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-400" />
      </button>
    </li>
  )
}
