import { Settings2 } from "lucide-react"
import { useDashboardLayout } from "../context/DashboardLayoutContext"

export function EditModeToggle() {
  const { enterEditMode, isEditing } = useDashboardLayout()

  if (isEditing) return null

  return (
    <button className="btn btn-icon" onClick={enterEditMode} title="Customize layout">
      <Settings2 size={18} />
    </button>
  )
}
