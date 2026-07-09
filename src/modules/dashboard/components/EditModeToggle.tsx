import { Settings2 } from "lucide-react"
import { useDashboardLayout } from "../context/DashboardLayoutContext"

/** Gear button that opens layout edit mode. `highlight` pulses it to draw a
 *  new user's eye during the welcome walkthrough's "edit anytime" hint;
 *  `onActivate` fires on click so that hint can dismiss itself. */
export function EditModeToggle({
  highlight = false,
  onActivate,
}: {
  highlight?: boolean
  onActivate?: () => void
}) {
  const { enterEditMode, isEditing } = useDashboardLayout()

  if (isEditing) return null

  return (
    <button
      className={`btn-icon rpt-btn${highlight ? " btn-icon-attention" : ""}`}
      onClick={() => {
        onActivate?.()
        enterEditMode()
      }}
      title="Customize layout"
    >
      <Settings2 size={18} />
    </button>
  )
}
