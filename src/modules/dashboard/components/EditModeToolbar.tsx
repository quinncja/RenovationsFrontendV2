import { useDashboardLayout } from "../context/DashboardLayoutContext"

export function EditModeToolbar() {
  const { saveLayout, exitEditMode, resetToDefault, isDirty, selectedCount, clearSelection } = useDashboardLayout()

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
      <button className="btn btn-ghost" onClick={resetToDefault}>
        Reset to Default
      </button>
      <button className="btn btn-ghost" onClick={exitEditMode}>
        Cancel
      </button>
      <button className="btn btn-primary" onClick={saveLayout} disabled={!isDirty}>
        Save Layout
      </button>
    </div>
  )
}
