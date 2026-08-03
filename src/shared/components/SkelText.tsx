// Text-shaped shimmer bar for content-mirroring skeletons. Render it INSIDE
// (or AS) the element carrying the loaded text's real type class — the nbsp
// content gives the bar that class's exact line box, so skeleton and loaded
// layouts share one height source and can't drift apart when the type scale
// changes. `ch` approximates the loaded content's width in characters.
export function SkelText({ ch, className }: { ch: number; className?: string }) {
  return (
    <span
      className={`skel-text${className ? ` ${className}` : ""}`}
      style={{ width: `${ch}ch` }}
      aria-hidden="true"
    >
      {" "}
    </span>
  )
}
