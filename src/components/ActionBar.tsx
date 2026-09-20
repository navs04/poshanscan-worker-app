import type { ReactNode } from 'react'

/** Buttons pinned to the bottom of the screen, within thumb reach. */
export default function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-200 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-md flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {children}
      </div>
    </div>
  )
}
