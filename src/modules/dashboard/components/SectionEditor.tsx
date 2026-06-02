import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { useDashboardLayout } from "../context/DashboardLayoutContext"
import { SECTION_REGISTRY } from "../config/sectionRegistry"
import type { SectionId, SectionLayout } from "../types/dashboardLayout"
import { DashboardEditor } from "./DashboardEditor"

function SectionRect({
  section,
  isSelected,
  onSelect,
}: {
  section: SectionLayout
  isSelected: boolean
  onSelect: (id: SectionId) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "section-rect",
        "card",
        isSelected ? "section-rect-selected" : "",
        isDragging ? "section-rect-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(section.id)}
    >
      {/* Drag handle is the grip only, so clicking the body just selects. */}
      <button
        type="button"
        className="section-rect-grip"
        aria-label="Reorder section"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <span className="section-rect-title">{SECTION_REGISTRY[section.id].title}</span>
      <span className="section-rect-count">{section.widgets.length}</span>
    </div>
  )
}

/** Edit-mode dual pane: reorder sections (left), rearrange widgets within the
 *  selected section (right). Widgets can never leave their section. */
export function SectionEditor() {
  const { editLayout, selectedSectionId, selectSection, moveSection } = useDashboardLayout()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  if (!editLayout) return null

  const sections = editLayout.sections
  const selected = sections.find((s) => s.id === selectedSectionId) ?? sections[0]

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    moveSection(active.id as SectionId, over.id as SectionId)
  }

  return (
    <div className="section-editor">
      <div className="section-editor-list">
        <span className="section-editor-list-label">Sections</span>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {sections.map((s) => (
              <SectionRect
                key={s.id}
                section={s}
                isSelected={s.id === selected?.id}
                onSelect={selectSection}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="section-editor-canvas">
        {selected && (
          <>
            <span className="section-editor-canvas-title">{SECTION_REGISTRY[selected.id].title}</span>
            <DashboardEditor widgets={selected.widgets} />
          </>
        )}
      </div>
    </div>
  )
}
