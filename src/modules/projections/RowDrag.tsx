import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, ArrowUpFromLine } from "lucide-react"

/* ── Drag to rearrange (shared: persists as the sheet's sortOrder) ────────
   ONE DndContext for the whole board (ProjectionDnd, mounted by the page)
   so a pipeline row can be dragged UP onto the Unit Projection card to award
   it. Each table is a SortableContext (RowDragTable) that registers its
   section with the provider; in-table drags reorder as before, and a
   pipeline row carried over the grid awards on drop. ─────────────────── */

export type DragSection = "rows" | "pipeline"

/** The Unit Projection card's droppable id — the award target. */
export const GRID_DROP_ID = "pj-grid-drop"

interface SectionRegistration {
  /** Row ids in DISPLAY order (a column sort applied), so a drop under a
   *  sort persists exactly the arrangement the user was looking at. */
  rowIds: string[]
  onReorder: (order: string[], movedRowId: string) => void
  /** What the floating ghost shows for a row of this section (pipeline only). */
  renderGhost?: (rowId: string) => ReactNode
}

interface DndBoard {
  register: (section: DragSection, reg: SectionRegistration) => void
  unregister: (section: DragSection) => void
  /** The section of the row being dragged right now, if any. */
  activeSection: DragSection | null
  /** A pipeline row is being carried over the Unit Projection card. */
  overGrid: boolean
}
const BoardContext = createContext<DndBoard | null>(null)
const SectionContext = createContext<DragSection | null>(null)

/** The board-wide drag context. `onAward` fires when a pipeline row is
 *  dropped on the projection grid. */
export function ProjectionDnd({ onAward, children }: { onAward: (rowId: string) => void; children: ReactNode }) {
  const registry = useRef(new Map<DragSection, SectionRegistration>())
  const [active, setActive] = useState<{ id: string; section: DragSection; ghost: ReactNode } | null>(null)
  // dnd-kit fires the first over event in the same tick as start, before
  // the state above has committed — read the section through a ref.
  const activeRef = useRef<DragSection | null>(null)
  const [overGrid, setOverGrid] = useState(false)
  // Set on an award drop so the ghost doesn't glide back to its old pipeline
  // slot (the row has already left it); cleared once the overlay unmounts.
  const [awarded, setAwarded] = useState(false)

  const register = useCallback((section: DragSection, reg: SectionRegistration) => {
    registry.current.set(section, reg)
  }, [])
  const unregister = useCallback((section: DragSection) => {
    registry.current.delete(section)
  }, [])

  const sectionOf = (id: string): DragSection | null => {
    for (const [section, reg] of registry.current) if (reg.rowIds.includes(id)) return section
    return null
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  /** Same-section rows only for sorting; a pipeline row additionally hits
   *  the grid card by pointer position (so hovering anywhere on the card,
   *  header and totals included, reads as "drop to award" — and a pipeline
   *  row dragged near its own table's top never snaps to the grid's last
   *  row just because that center happens to be closer). */
  const collision: CollisionDetection = (args) => {
    const id = String(args.active.id)
    const section = sectionOf(id)
    if (section === "pipeline") {
      const grid = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id === GRID_DROP_ID) })
      if (grid.length) return grid
    }
    const own = new Set(registry.current.get(section ?? "rows")?.rowIds ?? [])
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => own.has(String(c.id))) })
  }

  const onDragStart = ({ active: a }: DragStartEvent) => {
    const id = String(a.id)
    const section = sectionOf(id)
    activeRef.current = section
    if (section) setActive({ id, section, ghost: registry.current.get(section)?.renderGhost?.(id) ?? null })
    setAwarded(false)
  }
  const onDragOver = ({ over }: DragOverEvent) => {
    setOverGrid(activeRef.current === "pipeline" && over?.id === GRID_DROP_ID)
  }
  const finish = () => {
    activeRef.current = null
    setActive(null)
    setOverGrid(false)
  }
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const id = String(a.id)
    const section = sectionOf(id)
    if (section === "pipeline" && over?.id === GRID_DROP_ID) {
      setAwarded(true)
      finish()
      onAward(id)
      return
    }
    finish()
    if (!over || !section || a.id === over.id) return
    const reg = registry.current.get(section)
    if (!reg) return
    const from = reg.rowIds.indexOf(id)
    const to = reg.rowIds.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    reg.onReorder(arrayMove(reg.rowIds, from, to), id)
  }

  const board = useMemo<DndBoard>(
    () => ({ register, unregister, activeSection: active?.section ?? null, overGrid }),
    [register, unregister, active, overGrid]
  )
  const ghost = active?.section === "pipeline" ? active.ghost : null

  return (
    <BoardContext.Provider value={board}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={finish}
      >
        {children}
        {/* Only pipeline rows float as a ghost (they travel between two
            scroll frames, which would clip the row itself); grid rows keep
            moving in place. Portaled so no overflow clip can cut it off. */}
        {createPortal(
          <DragOverlay dropAnimation={awarded ? null : undefined} zIndex={60}>
            {ghost ? (
              <div className={`pj-award-ghost${overGrid ? " pj-award-ghost-over" : ""}`}>
                <span className="pj-award-ghost-icon"><ArrowUpFromLine size={14} /></span>
                <span className="pj-award-ghost-body">{ghost}</span>
                <span className="pj-award-ghost-hint">{overGrid ? "Release to award" : "Drag onto Unit Projection to award"}</span>
              </div>
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </BoardContext.Provider>
  )
}

/** The Unit Projection card registers itself as the award drop target.
 *  Returns the ref for the card element and whether a pipeline row is
 *  being dragged (show the target) / is over it (light it up). */
export function useAwardDropTarget() {
  const board = useContext(BoardContext)
  const { setNodeRef } = useDroppable({ id: GRID_DROP_ID })
  return {
    setNodeRef,
    awarding: board?.activeSection === "pipeline",
    over: board?.overGrid ?? false,
  }
}

/** A table's rows as one sortable section of the board. Rows drag under a
 *  column sort too: `rowIds` is the displayed order, so the drop persists
 *  that arrangement (with the row where it landed) as the sheet order, and
 *  the caller's `onReorder` clears the sort so the new order shows. */
export function RowDragTable({
  section,
  rowIds,
  onReorder,
  renderGhost,
  children,
}: {
  section: DragSection
  rowIds: string[]
  onReorder: (order: string[], movedRowId: string) => void
  renderGhost?: (rowId: string) => ReactNode
  children: ReactNode
}) {
  const board = useContext(BoardContext)
  useEffect(() => {
    board?.register(section, { rowIds, onReorder, renderGhost })
  }, [board, section, rowIds, onReorder, renderGhost])
  useEffect(() => () => board?.unregister(section), [board, section])
  return (
    <SectionContext.Provider value={section}>
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </SectionContext.Provider>
  )
}

interface GripHandle {
  attributes: DraggableAttributes
  listeners: ReturnType<typeof useSortable>["listeners"]
  disabled: boolean
}
const GripContext = createContext<GripHandle | null>(null)

/** A sortable <tr>. The row body is never the drag handle: cells stay
 *  editable, and only the RowGrip in the lead cell starts a drag. */
export function SortableRow({
  rowId,
  disabled,
  className,
  children,
}: {
  rowId: string
  disabled: boolean
  className?: string
  children: ReactNode
}) {
  const section = useContext(SectionContext)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId,
    disabled,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const handle = useMemo<GripHandle>(
    () => ({ attributes, listeners, disabled }),
    [attributes, listeners, disabled]
  )
  // A pipeline row travels as the floating ghost; the row itself stays put
  // as a faded placeholder (pj-row-lifted) until it's dropped.
  const dragClass = isDragging ? (section === "pipeline" ? "pj-row-lifted" : "pj-row-dragging") : ""
  return (
    <GripContext.Provider value={handle}>
      <tr
        ref={setNodeRef}
        style={style}
        data-rowid={rowId}
        className={[className, dragClass].filter(Boolean).join(" ") || undefined}
      >
        {children}
      </tr>
    </GripContext.Provider>
  )
}

/** The left-edge grabber, shown on row hover inside the sticky lead cell. */
export function RowGrip({ label }: { label: string }) {
  const handle = useContext(GripContext)
  if (!handle) return null
  const { attributes, listeners, disabled } = handle
  return (
    <button
      type="button"
      className={`pj-row-grip${disabled ? " pj-row-grip-locked" : ""}`}
      aria-label={`Drag to rearrange ${label}`}
      title="Drag to rearrange"
      disabled={disabled}
      // A press on the grip must never hand focus to the cell input beside it
      // (focus is what opens the editor); the button itself needs no focus
      // for pointer drags, and keyboard users still reach it with Tab.
      onMouseDown={(e) => e.preventDefault()}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={13} />
    </button>
  )
}
