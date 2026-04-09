import { SlidersHorizontal } from "lucide-react"

interface MobileFilterButtonProps {
  count: number
  onClick: () => void
}

export function MobileFilterButton({ count, onClick }: MobileFilterButtonProps) {
  return (
    <button className="mfs-trigger" onClick={onClick}>
      <SlidersHorizontal size={15} />
      <span>Filters</span>
      {count > 0 && <span className="mfs-trigger-badge">{count}</span>}
    </button>
  )
}
