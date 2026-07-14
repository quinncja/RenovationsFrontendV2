import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { DashboardLayout, SectionId, WidgetId, WidgetLayoutItem } from "../types/dashboardLayout"
import { DEFAULT_DASHBOARD_LAYOUT } from "../config/defaultLayout"
import { buildTemplateLayout, type LayoutTemplate } from "../config/layoutTemplates"
import { reconcileLayout } from "../config/reconcileLayout"
import { saveDashboardLayout } from "../../../shared/api/layoutApi"
import { useAuth } from "../../../core/auth/AuthProvider"
import { useOnboarding, loadUserPreferencesOnce } from "../../../core/onboarding/OnboardingProvider"

interface DashboardLayoutContextValue {
  layout: DashboardLayout
  editLayout: DashboardLayout | null
  isEditing: boolean
  isDirty: boolean
  isLoading: boolean
  /** False until the user has picked/saved a layout — drives the welcome walkthrough. */
  hasChosenLayout: boolean
  /** Commit a template as the user's live layout (new-user welcome selection). */
  chooseTemplate: (template: LayoutTemplate) => void

  // Home-page pager position (which section is shown), persisted per user.
  activeSectionIndex: number
  setActiveSectionIndex: (index: number) => void

  // Edit-mode: which section the right pane is editing.
  selectedSectionId: SectionId | null
  selectSection: (id: SectionId) => void

  enterEditMode: () => void
  exitEditMode: () => void
  saveLayout: () => Promise<void>
  /** Reset the in-edit layout to a named template (section order + widget defaults). */
  applyTemplate: (template: LayoutTemplate) => void

  // Section-level (edit mode)
  moveSection: (activeId: SectionId, overId: SectionId) => void

  // Widget-level (edit mode) — all scoped to selectedSectionId
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

function getSectionStorageKey(userId: string) {
  return `dashboard-section:${userId}`
}

function loadFromLocalStorage(userId: string): DashboardLayout | null {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    if (!raw) return null
    return reconcileLayout(JSON.parse(raw))
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

// Live chooseTemplate from whichever DashboardLayoutProvider instance is
// currently mounted (there's only ever one). Lets the app-level onboarding
// host update React state in place — no remount — when the provider is
// present; falls back to commitTemplateChoice below when it isn't.
let liveChooseTemplate: ((template: LayoutTemplate) => void) | null = null
// eslint-disable-next-line react-refresh/only-export-components
export function getLiveChooseTemplate() {
  return liveChooseTemplate
}

// Commits a template straight to storage for the provider-absent case (user
// isn't on a dashboard route). This file owns the `dashboard-layout:{uid}` key,
// which is why the standalone commit lives here rather than in the onboarding
// host. Does NOT call completeSetup — the caller owns that decision. When the
// user next lands on /dashboard, the provider mounts and adopts this cache via
// its existing localStorage bootstrap, same as any other returning user.
// eslint-disable-next-line react-refresh/only-export-components
export function commitTemplateChoice(userId: string, template: LayoutTemplate): void {
  const next = buildTemplateLayout(template)
  saveToLocalStorage(userId, next)
  void saveDashboardLayout(next).catch(() => {
    // Save failed — layout is still applied locally for this session.
  })
}

function loadSectionIndex(userId: string): number {
  if (!userId) return 0
  try {
    const raw = localStorage.getItem(getSectionStorageKey(userId))
    const n = raw == null ? 0 : Number.parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

export function DashboardLayoutProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { completeSetup } = useOnboarding()
  const userId = user?.uid ?? ""

  const cachedLayout = userId ? loadFromLocalStorage(userId) : null
  const [layout, setLayout] = useState<DashboardLayout>(cachedLayout ?? DEFAULT_DASHBOARD_LAYOUT)
  const [editLayout, setEditLayout] = useState<DashboardLayout | null>(null)
  // Only show loading if we have no cached layout and need to fetch
  const [isLoading, setIsLoading] = useState(!cachedLayout && !!userId)
  // A cached layout means the user has chosen before; otherwise the fetch below
  // resolves it (server layout → chosen; 404 → new user → welcome walkthrough).
  const [hasChosenLayout, setHasChosenLayout] = useState<boolean>(cachedLayout != null)

  // Home-page pager position. Persisted per user; clamped to the section count.
  const [activeSectionIndex, setActiveSectionIndexState] = useState<number>(() => loadSectionIndex(userId))

  // Edit-mode right-pane section. Kept in a ref too so the (stable) widget
  // mutation callbacks can read it without being re-created on every change.
  const [selectedSectionId, setSelectedSectionId] = useState<SectionId | null>(null)
  const selectedSectionIdRef = useRef<SectionId | null>(null)

  // Selection state (shared with toolbar). Declared up here so saveLayoutFn can
  // clear it without referencing the setter before it exists.
  const [selected, setSelected] = useState<Set<WidgetId>>(new Set())
  const [shiftHeld, setShiftHeld] = useState(false)
  const selectedCount = selected.size

  // Fetch from API on mount
  useEffect(() => {
    if (!userId) {
      // No user → nothing to fetch; clear the loading flag.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false)
      return
    }

    let cancelled = false

    // Layout data comes from the shared prefs bootstrap (one fetch per load,
    // deduped with OnboardingProvider) rather than a second dedicated request.
    loadUserPreferencesOnce()
      .then(({ dashboardLayout }) => {
        if (cancelled) return
        if (dashboardLayout) {
          const reconciled = reconcileLayout(dashboardLayout)
          setLayout(reconciled)
          saveToLocalStorage(userId, reconciled)
          setHasChosenLayout(true)
        }
        // A null response with no cache leaves hasChosenLayout false → the
        // new-user welcome walkthrough shows once loading settles.
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

  // When auth resolves (userId becomes available), adopt the persisted section.
  useEffect(() => {
    if (!userId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSectionIndexState(loadSectionIndex(userId))
  }, [userId])

  // Keep the pager position within range if the section count changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSectionIndexState((prev) => Math.max(0, Math.min(prev, layout.sections.length - 1)))
  }, [layout.sections.length])

  const setActiveSectionIndex = useCallback(
    (index: number) => {
      setActiveSectionIndexState((prev) => {
        const max = layout.sections.length - 1
        const next = Math.max(0, Math.min(index, max))
        if (next !== prev && userId) {
          try {
            localStorage.setItem(getSectionStorageKey(userId), String(next))
          } catch {
            // non-critical
          }
        }
        return next
      })
    },
    [layout.sections.length, userId]
  )

  const isEditing = editLayout !== null

  const isDirty = isEditing && JSON.stringify(editLayout) !== JSON.stringify(layout)

  const setSelectedSection = useCallback((id: SectionId | null) => {
    selectedSectionIdRef.current = id
    setSelectedSectionId(id)
  }, [])

  const enterEditMode = useCallback(() => {
    const clone = structuredClone(layout)
    setEditLayout(clone)
    // Default selected section = the one currently shown on the home page.
    const current = clone.sections[activeSectionIndex] ?? clone.sections[0]
    setSelectedSection(current ? current.id : null)
  }, [layout, activeSectionIndex, setSelectedSection])

  const selectSection = useCallback(
    (id: SectionId) => {
      setSelectedSection(id)
      // A selection from another section is meaningless in the new one.
      setSelected(new Set())
    },
    [setSelectedSection]
  )

  const saveLayoutFn = useCallback(async () => {
    if (!editLayout) return
    setLayout(editLayout)
    setEditLayout(null)
    setSelected(new Set())
    setSelectedSection(null)

    if (userId) {
      saveToLocalStorage(userId, editLayout)
      try {
        await saveDashboardLayout(editLayout)
      } catch {
        // Save failed — layout is still applied locally
      }
    }
  }, [editLayout, userId, setSelectedSection])

  const applyTemplate = useCallback(
    (template: LayoutTemplate) => {
      const layout = buildTemplateLayout(template)
      setEditLayout(layout)
      setSelectedSection(layout.sections[0]?.id ?? null)
      setSelected(new Set())
    },
    [setSelectedSection]
  )

  // New-user welcome selection: commit a template straight to the live layout
  // (not edit mode) and persist it. State updates apply immediately; the save
  // runs in the background so the dashboard reveals without waiting on the API.
  const chooseTemplate = useCallback(
    (template: LayoutTemplate) => {
      const next = buildTemplateLayout(template)
      setLayout(next)
      setHasChosenLayout(true)
      if (userId) {
        saveToLocalStorage(userId, next)
        // Onboarding just completed — the daily report first greets tomorrow.
        completeSetup()
        void saveDashboardLayout(next).catch(() => {
          // Save failed — layout is still applied locally for this session.
        })
      }
    },
    [userId, completeSetup]
  )

  // Publish the live chooseTemplate for getLiveChooseTemplate() (onboarding
  // host reads it when this provider is mounted). Clears on unmount, but only
  // if nothing newer has already replaced it (guards a stale unmount racing a
  // fresh mount's effect).
  useEffect(() => {
    liveChooseTemplate = chooseTemplate
    return () => {
      if (liveChooseTemplate === chooseTemplate) liveChooseTemplate = null
    }
  }, [chooseTemplate])

  // ── Section-level mutation ─────────────────────────────────────────
  const moveSection = useCallback((activeId: SectionId, overId: SectionId) => {
    setEditLayout((prev) => {
      if (!prev) return prev
      const activeIndex = prev.sections.findIndex((s) => s.id === activeId)
      const overIndex = prev.sections.findIndex((s) => s.id === overId)
      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return prev
      const sections = [...prev.sections]
      const [moved] = sections.splice(activeIndex, 1)
      sections.splice(overIndex, 0, moved)
      return { ...prev, sections }
    })
  }, [])

  // ── Scoped widget mutations ────────────────────────────────────────
  // Locate the selected section and map only its widgets. Each mutation below
  // returns the original array (by reference) when it's a no-op so we can skip
  // the state update entirely (keeps isDirty honest).
  const updateSectionWidgets = useCallback(
    (fn: (widgets: WidgetLayoutItem[]) => WidgetLayoutItem[]) => {
      setEditLayout((prev) => {
        if (!prev) return prev
        const sectionId = selectedSectionIdRef.current
        if (!sectionId) return prev
        let changed = false
        const sections = prev.sections.map((s) => {
          if (s.id !== sectionId) return s
          const next = fn(s.widgets)
          if (next === s.widgets) return s
          changed = true
          return { ...s, widgets: next }
        })
        return changed ? { ...prev, sections } : prev
      })
    },
    []
  )

  const moveWidget = useCallback(
    (activeId: WidgetId, overId: WidgetId) => {
      updateSectionWidgets((input) => {
        const widgets = input.map((w) => ({ ...w }))
        const activeIndex = widgets.findIndex((w) => w.id === activeId)
        const overIndex = widgets.findIndex((w) => w.id === overId)
        if (activeIndex === -1 || overIndex === -1) return input

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

        return widgets
      })
    },
    [updateSectionWidgets]
  )

  const moveWidgetToEnd = useCallback(
    (id: WidgetId) => {
      updateSectionWidgets((input) => {
        const widgets = input.map((w) => ({ ...w }))
        const index = widgets.findIndex((w) => w.id === id)
        if (index === -1 || index === widgets.length - 1) return input
        const [moved] = widgets.splice(index, 1)
        delete moved.offset
        widgets.push(moved)
        return widgets
      })
    },
    [updateSectionWidgets]
  )

  const moveWidgetToStart = useCallback(
    (id: WidgetId) => {
      updateSectionWidgets((input) => {
        const widgets = input.map((w) => ({ ...w }))
        const index = widgets.findIndex((w) => w.id === id)
        if (index <= 0) return input
        const [moved] = widgets.splice(index, 1)
        delete moved.offset
        widgets.unshift(moved)
        return widgets
      })
    },
    [updateSectionWidgets]
  )

  const moveWidgetsToStart = useCallback(
    (ids: WidgetId[]) => {
      updateSectionWidgets((input) => {
        const idSet = new Set(ids)
        const moved = input.filter((w) => idSet.has(w.id)).map((w) => ({ ...w, offset: undefined }))
        if (moved.length === 0) return input
        const remaining = input.filter((w) => !idSet.has(w.id))
        return [...moved, ...remaining].map((w) => ({ ...w }))
      })
    },
    [updateSectionWidgets]
  )

  const moveWidgets = useCallback(
    (ids: WidgetId[], overId: WidgetId) => {
      updateSectionWidgets((input) => {
        const idSet = new Set(ids)
        if (idSet.has(overId)) return input
        const moved = input.filter((w) => idSet.has(w.id)).map((w) => ({ ...w, offset: undefined }))
        if (moved.length === 0) return input
        const remaining = input.filter((w) => !idSet.has(w.id))
        const newOverIndex = remaining.findIndex((w) => w.id === overId)
        if (newOverIndex === -1) return input
        remaining.splice(newOverIndex, 0, ...moved)
        return remaining.map((w) => ({ ...w }))
      })
    },
    [updateSectionWidgets]
  )

  const moveWidgetsToEnd = useCallback(
    (ids: WidgetId[]) => {
      updateSectionWidgets((input) => {
        const idSet = new Set(ids)
        const moved = input.filter((w) => idSet.has(w.id)).map((w) => ({ ...w, offset: undefined }))
        if (moved.length === 0) return input
        const remaining = input.filter((w) => !idSet.has(w.id))
        return [...remaining, ...moved].map((w) => ({ ...w }))
      })
    },
    [updateSectionWidgets]
  )

  const insertWidget = useCallback(
    (id: WidgetId, targetId: WidgetId, position: "before" | "after") => {
      updateSectionWidgets((input) => {
        if (id === targetId) return input
        const item = input.find((w) => w.id === id)
        if (!item) return input
        const widgets = input.filter((w) => w.id !== id)
        const targetIndex = widgets.findIndex((w) => w.id === targetId)
        if (targetIndex === -1) return input
        const insertAt = position === "before" ? targetIndex : targetIndex + 1
        widgets.splice(insertAt, 0, { ...item, offset: undefined })
        // If inserting before a widget with offset, clear its offset (the gap is now filled)
        if (position === "before" && widgets[insertAt + 1]?.offset) {
          widgets[insertAt + 1] = { ...widgets[insertAt + 1], offset: undefined }
        }
        return widgets
      })
    },
    [updateSectionWidgets]
  )

  const insertWidgets = useCallback(
    (ids: WidgetId[], targetId: WidgetId, position: "before" | "after") => {
      updateSectionWidgets((input) => {
        const idSet = new Set(ids)
        if (idSet.has(targetId)) return input
        const moved = input.filter((w) => idSet.has(w.id)).map((w) => ({ ...w, offset: undefined }))
        if (moved.length === 0) return input
        const remaining = input.filter((w) => !idSet.has(w.id))
        const targetIndex = remaining.findIndex((w) => w.id === targetId)
        if (targetIndex === -1) return input
        const insertAt = position === "before" ? targetIndex : targetIndex + 1
        remaining.splice(insertAt, 0, ...moved)
        // If inserting before a widget with offset, clear its offset
        if (position === "before") {
          const afterInsert = remaining[insertAt + moved.length]
          if (afterInsert?.offset) {
            remaining[insertAt + moved.length] = { ...afterInsert, offset: undefined }
          }
        }
        return remaining.map((w) => ({ ...w }))
      })
    },
    [updateSectionWidgets]
  )

  const setWidgetOffset = useCallback(
    (id: WidgetId, offset: number) => {
      updateSectionWidgets((input) => {
        const target = input.find((w) => w.id === id)
        const nextOffset = offset > 0 ? offset : undefined
        if (!target || target.offset === nextOffset) return input
        return input.map((w) => (w.id === id ? { ...w, offset: nextOffset } : w))
      })
    },
    [updateSectionWidgets]
  )

  const resizeWidget = useCallback(
    (id: WidgetId, colSpan: 1 | 2) => {
      updateSectionWidgets((input) => {
        const target = input.find((w) => w.id === id)
        if (!target) return input
        const clearingOffset = colSpan === 2 && target.offset !== undefined
        if (target.colSpan === colSpan && !clearingOffset) return input
        return input.map((w) =>
          w.id === id ? { ...w, colSpan, offset: colSpan === 2 ? undefined : w.offset } : w
        )
      })
    },
    [updateSectionWidgets]
  )

  // ── Selection keyboard tracking ────────────────────────────────────
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
    setSelectedSection(null)
  }, [setSelectedSection])

  return (
    <DashboardLayoutContext.Provider
      value={{
        layout,
        editLayout,
        isEditing,
        isDirty,
        isLoading,
        hasChosenLayout,
        chooseTemplate,
        activeSectionIndex,
        setActiveSectionIndex,
        selectedSectionId,
        selectSection,
        enterEditMode,
        exitEditMode: exitEditModeAndClearSelection,
        saveLayout: saveLayoutFn,
        applyTemplate,
        moveSection,
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

// eslint-disable-next-line react-refresh/only-export-components
export function useDashboardLayout() {
  const ctx = useContext(DashboardLayoutContext)
  if (!ctx) throw new Error("useDashboardLayout must be used within DashboardLayoutProvider")
  return ctx
}
