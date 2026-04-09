import { createContext, useCallback, useContext, useEffect, useState } from "react"
import type { DashboardLayout, WidgetId } from "../types/dashboardLayout"
import { DEFAULT_DASHBOARD_LAYOUT } from "../config/defaultLayout"
import { fetchDashboardLayout, saveDashboardLayout } from "../../../shared/api/layoutApi"
import { useAuth } from "../../../core/auth/AuthProvider"

interface DashboardLayoutContextValue {
  layout: DashboardLayout
  editLayout: DashboardLayout | null
  isEditing: boolean
  isDirty: boolean
  isLoading: boolean

  enterEditMode: () => void
  exitEditMode: () => void
  saveLayout: () => Promise<void>
  resetToDefault: () => void

  moveWidget: (activeId: WidgetId, overId: WidgetId) => void
  moveWidgetToEnd: (id: WidgetId) => void
  moveWidgets: (ids: WidgetId[], overId: WidgetId) => void
  moveWidgetToStart: (id: WidgetId) => void
  moveWidgetsToStart: (ids: WidgetId[]) => void
  moveWidgetsToEnd: (ids: WidgetId[]) => void
  insertWidget: (id: WidgetId, targetId: WidgetId, position: "before" | "after") => void
  insertWidgets: (ids: WidgetId[], targetId: WidgetId, position: "before" | "after") => void
  resizeWidget: (id: WidgetId, colSpan: 1 | 2) => void
  setWidgetOffset: (id: WidgetId, offset: number) => void

  // Selection state (lifted so toolbar can access it)
  selected: Set<WidgetId>
  selectedCount: number
  shiftHeld: boolean
  toggleSelect: (id: WidgetId) => void
  clearSelection: () => void
}

const DashboardLayoutContext = createContext<DashboardLayoutContextValue | null>(null)

function getStorageKey(userId: string) {
  return `dashboard-layout:${userId}`
}

function loadFromLocalStorage(userId: string): DashboardLayout | null {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    return raw ? (JSON.parse(raw) as DashboardLayout) : null
  } catch {
    return null
  }
}

function saveToLocalStorage(userId: string, layout: DashboardLayout) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(layout))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

export function DashboardLayoutProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const userId = user?.uid ?? ""

  const cachedLayout = userId ? loadFromLocalStorage(userId) : null
  const [layout, setLayout] = useState<DashboardLayout>(cachedLayout ?? DEFAULT_DASHBOARD_LAYOUT)
  const [editLayout, setEditLayout] = useState<DashboardLayout | null>(null)
  // Only show loading if we have no cached layout and need to fetch
  const [isLoading, setIsLoading] = useState(!cachedLayout && !!userId)

  // Fetch from API on mount
  useEffect(() => {
    if (!userId) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    fetchDashboardLayout()
      .then((serverLayout) => {
        if (cancelled) return
        if (serverLayout) {
          setLayout(serverLayout)
          saveToLocalStorage(userId, serverLayout)
        }
      })
      .catch(() => {
        // API failed — keep localStorage/default layout
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const isEditing = editLayout !== null

  const isDirty = isEditing && JSON.stringify(editLayout) !== JSON.stringify(layout)

  const enterEditMode = useCallback(() => {
    setEditLayout(structuredClone(layout))
  }, [layout])

  const saveLayoutFn = useCallback(async () => {
    if (!editLayout) return
    setLayout(editLayout)
    setEditLayout(null)
    setSelected(new Set())

    if (userId) {
      saveToLocalStorage(userId, editLayout)
      try {
        await saveDashboardLayout(editLayout)
      } catch {
        // Save failed — layout is still applied locally
      }
    }
  }, [editLayout, userId])

  const resetToDefault = useCallback(() => {
    setEditLayout(structuredClone(DEFAULT_DASHBOARD_LAYOUT))
  }, [])

  const moveWidget = useCallback((activeId: WidgetId, overId: WidgetId) => {
    setEditLayout((prev) => {
      if (!prev) return prev
      const widgets = prev.widgets.map((w) => ({ ...w }))
      const activeIndex = widgets.findIndex((w) => w.id === activeId)
      const overIndex = widgets.findIndex((w) => w.id === overId)
      if (activeIndex === -1 || overIndex === -1) return prev

      // Swap colSpans so each widget inherits the other's size
      const tempColSpan = widgets[activeIndex].colSpan
      widgets[activeIndex].colSpan = widgets[overIndex].colSpan
      widgets[overIndex].colSpan = tempColSpan

      // Clear offsets on swapped widgets
      delete widgets[activeIndex].offset
      delete widgets[overIndex].offset

      // Swap positions
      const temp = widgets[activeIndex]
      widgets[activeIndex] = widgets[overIndex]
      widgets[overIndex] = temp

      return { ...prev, widgets }
    })
  }, [])

  const moveWidgetToEnd = useCallback((id: WidgetId) => {
    setEditLayout((prev) => {
      if (!prev) return prev
      const widgets = prev.widgets.map((w) => ({ ...w }))
      const index = widgets.findIndex((w) => w.id === id)
      if (index === -1 || index === widgets.length - 1) return prev

      const [moved] = widgets.splice(index, 1)
      delete moved.offset
      widgets.push(moved)

      return { ...prev, widgets }
    })
  }, [])

  const moveWidgetToStart = useCallback((id: WidgetId) => {
    setEditLayout((prev) => {
      if (!prev) return prev
      const widgets = prev.widgets.map((w) => ({ ...w }))
      const index = widgets.findIndex((w) => w.id === id)
      if (index <= 0) return prev

      const [moved] = widgets.splice(index, 1)
      delete moved.offset
      widgets.unshift(moved)

      return { ...prev, widgets }
    })
  }, [])

  const moveWidgetsToStart = useCallback((ids: WidgetId[]) => {
    setEditLayout((prev) => {
      if (!prev) return prev
      const idSet = new Set(ids)
      const remaining = prev.widgets.filter((w) => !idSet.has(w.id))
      const moved = prev.widgets.filter((w) => idSet.has(w.id)).map((w) => ({ ...w, offset: undefined }))

      return { ...prev, widgets: [...moved, ...remaining].map((w) => ({ ...w })) }
    })
  }, [])

  const moveWidgets = useCallback((ids: WidgetId[], overId: WidgetId) => {
    setEditLayout((prev) => {
      if (!prev) return prev
      const idSet = new Set(ids)

      if (idSet.has(overId)) return prev

      const moved = prev.widgets.filter((w) => idSet.has(w.id)).map((w) => ({ ...w, offset: undefined }))
      const remaining = prev.widgets.filter((w) => !idSet.has(w.id))

      const newOverIndex = remaining.findIndex((w) => w.id === overId)
      if (newOverIndex === -1) return prev

      remaining.splice(newOverIndex, 0, ...moved)

      return { ...prev, widgets: remaining.map((w) => ({ ...w })) }
    })
  }, [])

  const moveWidgetsToEnd = useCallback((ids: WidgetId[]) => {
    setEditLayout((prev) => {
      if (!prev) return prev
      const idSet = new Set(ids)
      const remaining = prev.widgets.filter((w) => !idSet.has(w.id))
      const moved = prev.widgets.filter((w) => idSet.has(w.id)).map((w) => ({ ...w, offset: undefined }))

      return { ...prev, widgets: [...remaining, ...moved].map((w) => ({ ...w })) }
    })
  }, [])

  const insertWidget = useCallback((id: WidgetId, targetId: WidgetId, position: "before" | "after") => {
    setEditLayout((prev) => {
      if (!prev || id === targetId) return prev
      const widgets = prev.widgets.filter((w) => w.id !== id)
      const item = prev.widgets.find((w) => w.id === id)
      if (!item) return prev
      const targetIndex = widgets.findIndex((w) => w.id === targetId)
      if (targetIndex === -1) return prev
      const insertAt = position === "before" ? targetIndex : targetIndex + 1
      widgets.splice(insertAt, 0, { ...item, offset: undefined })
      // If inserting before a widget with offset, clear its offset (the gap is now filled)
      if (position === "before" && widgets[insertAt + 1]?.offset) {
        widgets[insertAt + 1] = { ...widgets[insertAt + 1], offset: undefined }
      }
      return { ...prev, widgets }
    })
  }, [])

  const insertWidgets = useCallback((ids: WidgetId[], targetId: WidgetId, position: "before" | "after") => {
    setEditLayout((prev) => {
      if (!prev) return prev
      const idSet = new Set(ids)
      if (idSet.has(targetId)) return prev
      const moved = prev.widgets.filter((w) => idSet.has(w.id)).map((w) => ({ ...w, offset: undefined }))
      const remaining = prev.widgets.filter((w) => !idSet.has(w.id))
      const targetIndex = remaining.findIndex((w) => w.id === targetId)
      if (targetIndex === -1) return prev
      const insertAt = position === "before" ? targetIndex : targetIndex + 1
      remaining.splice(insertAt, 0, ...moved)
      // If inserting before a widget with offset, clear its offset
      if (position === "before") {
        const afterInsert = remaining[insertAt + moved.length]
        if (afterInsert?.offset) {
          remaining[insertAt + moved.length] = { ...afterInsert, offset: undefined }
        }
      }
      return { ...prev, widgets: remaining.map((w) => ({ ...w })) }
    })
  }, [])

  const setWidgetOffset = useCallback((id: WidgetId, offset: number) => {
    setEditLayout((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        widgets: prev.widgets.map((w) =>
          w.id === id ? { ...w, offset: offset > 0 ? offset : undefined } : w
        ),
      }
    })
  }, [])

  // ── Selection state (shared with toolbar) ──────────────────────────
  const [selected, setSelected] = useState<Set<WidgetId>>(new Set())
  const [shiftHeld, setShiftHeld] = useState(false)

  const selectedCount = selected.size

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") setShiftHeld(true)
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") setShiftHeld(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [])

  const toggleSelect = useCallback((id: WidgetId) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
  }, [])

  // Clear selection when exiting edit mode
  const exitEditModeAndClearSelection = useCallback(() => {
    setEditLayout(null)
    setSelected(new Set())
    setShiftHeld(false)
  }, [])

  const resizeWidget = useCallback((id: WidgetId, colSpan: 1 | 2) => {
    setEditLayout((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        widgets: prev.widgets.map((w) =>
          w.id === id ? { ...w, colSpan, offset: colSpan === 2 ? undefined : w.offset } : w
        ),
      }
    })
  }, [])

  return (
    <DashboardLayoutContext.Provider
      value={{
        layout,
        editLayout,
        isEditing,
        isDirty,
        isLoading,
        enterEditMode,
        exitEditMode: exitEditModeAndClearSelection,
        saveLayout: saveLayoutFn,
        resetToDefault,
        moveWidget,
        moveWidgetToEnd,
        moveWidgetToStart,
        moveWidgets,
        moveWidgetsToStart,
        moveWidgetsToEnd,
        insertWidget,
        insertWidgets,
        resizeWidget,
        setWidgetOffset,
        selected,
        selectedCount,
        shiftHeld,
        toggleSelect,
        clearSelection,
      }}
    >
      {children}
    </DashboardLayoutContext.Provider>
  )
}

export function useDashboardLayout() {
  const ctx = useContext(DashboardLayoutContext)
  if (!ctx) throw new Error("useDashboardLayout must be used within DashboardLayoutProvider")
  return ctx
}
