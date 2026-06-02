import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { LAYOUT_TEMPLATES } from "../config/layoutTemplates"

/** "Reset view" dropdown — resets the in-edit layout to one of the named
 *  templates' section order. */
function TemplatePicker() {
  const { applyTemplate } = useDashboardLayout()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div className="template-picker" ref={ref}>
      <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Reset view <ChevronDown size={14} />
      </button>
      {open && (
        <div className="template-picker-menu" role="menu">
          {LAYOUT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="template-picker-option"
              role="menuitem"
              onClick={() => {
                applyTemplate(t)
                setOpen(false)
              }}
            >
              <span className="template-picker-option-name">{t.name}</span>
              <span className="template-picker-option-desc">{t.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function EditModeToolbar() {
  const { saveLayout, exitEditMode, isDirty, selectedCount, clearSelection } = useDashboardLayout()

  return (
    <div className="edit-mode-toolbar">
      {selectedCount > 0 && (
        <div className="edit-mode-toolbar-selection">
          <span className="edit-mode-toolbar-selection-text">
            {selectedCount} widget{selectedCount > 1 ? "s" : ""} selected
          </span>
          <button className="editor-selection-clear" onClick={clearSelection}>
            Clear
          </button>
        </div>
      )}
      <TemplatePicker />
      <button className="btn btn-ghost" onClick={exitEditMode}>
        Cancel
      </button>
      <button className="btn btn-primary" onClick={saveLayout} disabled={!isDirty}>
        Save Layout
      </button>
    </div>
  )
}
