import { useDraggable, useDroppable } from "@dnd-kit/core"
import { GripVertical } from "lucide-react"
import type { WidgetId } from "../types/dashboardLayout"
import { WIDGET_REGISTRY } from "../config/widgetRegistry"
import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { PlaceholderIllustration } from "./PlaceholderIllustrations"

interface WidgetPlaceholderProps {
  id: WidgetId
  colSpan: 1 | 2
  isSelected?: boolean
  isMultiDragging?: boolean
  enterHeld?: boolean
  onClick?: () => void
}

export function WidgetPlaceholder({ id, colSpan, isSelected, isMultiDragging, enterHeld, onClick }: WidgetPlaceholderProps) {
  const entry = WIDGET_REGISTRY[id]
  const { resizeWidget } = useDashboardLayout()

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id, disabled: isMultiDragging || isDragging })

  return (
    <div
      ref={(node) => { setDragRef(node); setDropRef(node) }}
      className={[
        "widget-placeholder",
        `widget-placeholder-${entry.visualType}`,
        "card",
        colSpan === 2 ? "col-span-full" : "",
        isDragging ? "widget-placeholder-dragging" : "",
        isMultiDragging ? "widget-placeholder-dragging" : "",
        isOver && !isDragging ? "widget-placeholder-over" : "",
        isSelected ? "widget-placeholder-selected" : "",
        enterHeld ? "widget-placeholder-selectable" : "",
      ].filter(Boolean).join(" ")}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      <div className="widget-placeholder-header">
        <GripVertical size={16} className="widget-placeholder-grip" />
        <span className="widget-placeholder-label">{entry.label}</span>
        <div className="widget-placeholder-controls">
          <button
            className={`widget-size-toggle${colSpan === 1 ? " active" : ""}`}
            onClick={(e) => {
              e.stopPropagation()
              resizeWidget(id, 1)
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Half
          </button>
          <button
            className={`widget-size-toggle${colSpan === 2 ? " active" : ""}`}
            onClick={(e) => {
              e.stopPropagation()
              resizeWidget(id, 2)
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Full width
          </button>
        </div>
      </div>
      <div className="widget-placeholder-body">
        <PlaceholderIllustration type={entry.visualType} />
      </div>
    </div>
  )
}

/** Overlay shown while dragging — no interactivity needed */
export function WidgetPlaceholderOverlay({ id }: { id: WidgetId; colSpan: 1 | 2 }) {
  const entry = WIDGET_REGISTRY[id]

  return (
    <div className={`widget-placeholder widget-placeholder-${entry.visualType} card widget-placeholder-overlay`}>
      <div className="widget-placeholder-header">
        <GripVertical size={16} className="widget-placeholder-grip" />
        <span className="widget-placeholder-label">{entry.label}</span>
      </div>
      <div className="widget-placeholder-body">
        <PlaceholderIllustration type={entry.visualType} />
      </div>
    </div>
  )
}
