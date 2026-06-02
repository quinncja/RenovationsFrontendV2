import { useState } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { WidgetPlaceholder, WidgetPlaceholderOverlay } from "./WidgetPlaceholder"
import type { WidgetId, WidgetLayoutItem } from "../types/dashboardLayout"

const START_ZONE_ID = "__start__"
const END_ZONE_ID = "__end__"
const GAP_AFTER_PREFIX = "__gap_after_"
const GAP_BEFORE_PREFIX = "__gap_before_"

function DropZone({ id, label, isDragging }: { id: string; label: string; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={[
        "widget-placeholder-endzone col-span-full",
        isDragging ? "widget-placeholder-endzone-active" : "",
        isOver ? "widget-placeholder-over" : "",
      ].filter(Boolean).join(" ")}
    >
      {label}
    </div>
  )
}

function GapDropZone({ id, isDragging }: { id: string; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={[
        "widget-gap-dropzone",
        isDragging ? "widget-gap-dropzone-active" : "",
        isOver ? "widget-placeholder-over" : "",
      ].filter(Boolean).join(" ")}
    >
      <span className="widget-gap-dropzone-label">Drop widget here</span>
    </div>
  )
}

type RenderItem =
  | { type: "widget"; item: WidgetLayoutItem }
  | { type: "gap"; id: string; afterId?: WidgetId; beforeId?: WidgetId }

/** Walk the widget list and build render items, inserting gap placeholders where a half-width slot is empty. */
function buildRenderList(widgets: WidgetLayoutItem[]): RenderItem[] {
  const items: RenderItem[] = []
  let col = 0

  for (let i = 0; i < widgets.length; i++) {
    const item = widgets[i]

    if (item.colSpan === 2) {
      // Full-width widget needs to start at col 0 — if we're at col 1, there's a gap
      if (col === 1) {
        items.push({ type: "gap", id: `${GAP_AFTER_PREFIX}${widgets[i - 1].id}__`, afterId: widgets[i - 1].id })
        col = 0
      }
      items.push({ type: "widget", item })
      // col stays 0 after a full-width widget
    } else {
      // Half-width widget — check for offset (widget pushed to right column)
      if (item.offset && item.offset > 0 && col === 0) {
        // Gap before this widget (left column is empty)
        items.push({ type: "gap", id: `${GAP_BEFORE_PREFIX}${item.id}__`, beforeId: item.id })
        col = 1
      }

      items.push({ type: "widget", item })
      col += 1
      if (col === 2) col = 0
    }
  }

  // If the last widget was half-width and alone in its row, add a trailing gap
  if (col === 1) {
    items.push({ type: "gap", id: `${GAP_AFTER_PREFIX}${widgets[widgets.length - 1].id}__`, afterId: widgets[widgets.length - 1].id })
  }

  return items
}

/** Edits one section's widget list. The `widgets` prop is the selected
 *  section's widgets; all mutations come from context already scoped to that
 *  section (via selectedSectionId), so widgets can never leave the section. */
export function DashboardEditor({ widgets }: { widgets: WidgetLayoutItem[] }) {
  const {
    moveWidget, moveWidgetToEnd, moveWidgetToStart,
    moveWidgets, moveWidgetsToStart, moveWidgetsToEnd,
    insertWidget, insertWidgets, setWidgetOffset,
    selected, selectedCount, shiftHeld, toggleSelect, clearSelection,
  } = useDashboardLayout()
  const [activeItem, setActiveItem] = useState<WidgetLayoutItem | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  function handleDragStart(event: DragStartEvent) {
    const item = widgets.find((w) => w.id === event.active.id)
    setActiveItem(item ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const activeId = active.id as WidgetId

    // Defensively scope multi-drag to widgets actually in this section, so a
    // stale selection from another section can't corrupt the splice.
    const inSection = new Set(widgets.map((w) => w.id))
    const movingIds = (selected.has(activeId) ? Array.from(selected) : [activeId]).filter((id) =>
      inSection.has(id)
    )
    const isMulti = movingIds.length > 1

    setActiveItem(null)

    if (!over || over.id === activeId) return
    if (isMulti && selected.has(over.id as WidgetId)) return

    const overId = over.id as string

    if (overId === START_ZONE_ID) {
      if (isMulti) moveWidgetsToStart(movingIds)
      else moveWidgetToStart(activeId)
    } else if (overId === END_ZONE_ID) {
      if (isMulti) moveWidgetsToEnd(movingIds)
      else moveWidgetToEnd(activeId)
    } else if (overId.startsWith(GAP_AFTER_PREFIX)) {
      // Gap is in the RIGHT column after a half-width widget
      const anchorId = overId.slice(GAP_AFTER_PREFIX.length, -2) as WidgetId

      if (!isMulti && activeId === anchorId) {
        // Dragging widget to its own gap → push to right column via offset
        setWidgetOffset(activeId, 1)
      } else if (isMulti) {
        insertWidgets(movingIds, anchorId, "after")
      } else {
        insertWidget(activeId, anchorId, "after")
      }
    } else if (overId.startsWith(GAP_BEFORE_PREFIX)) {
      // Gap is in the LEFT column before a widget that has an offset
      const targetWidgetId = overId.slice(GAP_BEFORE_PREFIX.length, -2) as WidgetId

      if (!isMulti && activeId === targetWidgetId) {
        // Dragging widget back to the left → clear offset
        setWidgetOffset(activeId, 0)
      } else if (isMulti) {
        // Insert before the offset widget (insertWidgets clears the target's offset)
        insertWidgets(movingIds, targetWidgetId, "before")
      } else {
        insertWidget(activeId, targetWidgetId, "before")
      }
    } else {
      const targetId = overId as WidgetId
      if (isMulti) moveWidgets(movingIds, targetId)
      else moveWidget(activeId, targetId)
    }

    if (isMulti) clearSelection()
  }

  function handleClick(id: WidgetId) {
    if (shiftHeld) {
      toggleSelect(id)
    }
  }

  const isDragging = activeItem !== null
  const draggingCount = isDragging && selected.has(activeItem.id) ? selectedCount : isDragging ? 1 : 0

  const renderList = buildRenderList(widgets)

  return (
    <div className="dashboard-editor">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="widget-grid widget-grid-2 dashboard-editor-grid">
          <DropZone id={START_ZONE_ID} label="Drop here to move to top" isDragging={isDragging} />
          {widgets.length === 0 && (
            <p className="dashboard-editor-empty col-span-full">This section has no widgets.</p>
          )}
          {renderList.map((entry) =>
            entry.type === "widget" ? (
              <WidgetPlaceholder
                key={entry.item.id}
                id={entry.item.id}
                colSpan={entry.item.colSpan}
                isSelected={selected.has(entry.item.id)}
                isMultiDragging={isDragging && selected.has(entry.item.id) && entry.item.id !== activeItem?.id}
                onClick={() => handleClick(entry.item.id)}
                enterHeld={shiftHeld}
              />
            ) : (
              <GapDropZone key={entry.id} id={entry.id} isDragging={isDragging} />
            )
          )}
          <DropZone id={END_ZONE_ID} label="Drop here to move to end" isDragging={isDragging} />
        </div>
        <DragOverlay dropAnimation={{
          duration: 300,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}>
          {activeItem ? (
            <div className="drag-overlay-wrapper">
              <WidgetPlaceholderOverlay id={activeItem.id} colSpan={activeItem.colSpan} />
              {draggingCount > 1 && (
                <div className="drag-overlay-badge">{draggingCount}</div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
