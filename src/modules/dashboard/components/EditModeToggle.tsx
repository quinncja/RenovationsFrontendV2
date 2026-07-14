import { useCallback } from "react"
import { Settings2 } from "lucide-react"
import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { registerCoachTarget } from "../../../core/onboarding/coachTargets"

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
  // Registers/unregisters via the callback ref's null-then-el call order —
  // returning null below while editing unmounts the button and clears this
  // naturally, no extra effect needed.
  const gearRef = useCallback((el: HTMLButtonElement | null) => {
    registerCoachTarget("edit-gear", el)
  }, [])

  if (isEditing) return null

  return (
    <button
      ref={gearRef}
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
