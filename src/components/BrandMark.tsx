/** Miniature MUAC tape: the app's logo. */
export default function BrandMark({ className = 'h-3.5 w-8' }: { className?: string }) {
  return (
    <span aria-hidden className={`flex overflow-hidden rounded-[3px] ${className}`}>
      <span className="w-[45%] bg-sam" />
      <span className="w-[18%] bg-mam" />
      <span className="w-[37%] bg-normal" />
    </span>
  )
}
