import { useCallback, useEffect, useRef, useState } from "react"
import {
  addProjectionRow,
  deleteProjectionRow,
  fetchProjectionSheet,
  patchProjectionRows,
  restoreProjectionSnapshot,
} from "./api"
import { computeSummary } from "./calc"
import type { CellEdit, ProjectionSheet } from "./types"

export type SaveState = "idle" | "pending" | "saving" | "saved"

const FLUSH_DELAY_MS = 750
const SAVED_BADGE_MS = 1800

function pendingKey(edit: CellEdit) {
  return `${edit.rowId ?? "sheet"}|${edit.field}`
}

/** Apply an edit to a local sheet copy and recompute every derived value. */
function applyLocally(sheet: ProjectionSheet, edit: CellEdit): ProjectionSheet {
  let overheadMonthly = sheet.overheadMonthly
  let rows = sheet.rows
  if (edit.field === "overheadMonthly") {
    overheadMonthly = Number(edit.value) || 0
  } else {
    rows = sheet.rows.map((row) => {
      if (row.rowId !== edit.rowId) return row
      if (edit.field.startsWith("month:")) {
        const idx = Number(edit.field.slice(6))
        const months = [...row.months]
        months[idx] = Number(edit.value) || 0
        return { ...row, months }
      }
      const isText = edit.field === "address" || edit.field === "client" || edit.field === "name"
      return { ...row, [edit.field]: isText ? String(edit.value) : Number(edit.value) || 0 }
    })
  }
  return { ...sheet, rows, overheadMonthly, summary: computeSummary(rows, overheadMonthly) }
}

/**
 * The board's data engine: loads the year's sheet, applies edits optimistically
 * (derived columns + summary recompute locally via calc.ts), batches them, and
 * flushes after a short pause. Optimistic concurrency: a 409 (someone else
 * saved) surfaces as `conflict` and the board reloads their version.
 */
export function useProjectionBoard(year: number) {
  const [sheet, setSheet] = useState<ProjectionSheet | null>(null)
  const [years, setYears] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [conflict, setConflict] = useState(false)
  const [lastAddedRowId, setLastAddedRowId] = useState<string | null>(null)

  const pendingRef = useRef<Map<string, CellEdit>>(new Map())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetRef = useRef<ProjectionSheet | null>(null)
  sheetRef.current = sheet
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setConflict(false)
    pendingRef.current.clear()
    try {
      const { sheet: fresh, years: allYears } = await fetchProjectionSheet(year)
      setSheet(fresh)
      setYears(allYears)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  /** Server responded — adopt its sheet, replaying any edits typed since flush. */
  const adoptServerSheet = useCallback((fresh: ProjectionSheet) => {
    let next = fresh
    for (const edit of pendingRef.current.values()) {
      next = applyLocally(next, edit)
    }
    // Keep the ref current immediately (not at next render) so callers awaiting
    // a structural op can diff against the adopted sheet.
    sheetRef.current = next
    setSheet(next)
  }, [])

  const handleWriteError = useCallback(
    (err: unknown) => {
      if ((err as { status?: number }).status === 409) {
        setConflict(true)
        load()
      } else {
        setError(err instanceof Error ? err.message : "Save failed")
      }
    },
    [load]
  )

  const flush = useCallback(async () => {
    const current = sheetRef.current
    if (!current || pendingRef.current.size === 0 || inFlight.current) return
    const edits = [...pendingRef.current.values()]
    pendingRef.current.clear()
    inFlight.current = true
    setSaveState("saving")
    try {
      const { sheet: fresh } = await patchProjectionRows(current.year, current.revision, edits)
      adoptServerSheet(fresh)
      if (pendingRef.current.size === 0) {
        setSaveState("saved")
        if (savedTimer.current) clearTimeout(savedTimer.current)
        savedTimer.current = setTimeout(() => setSaveState("idle"), SAVED_BADGE_MS)
      }
    } catch (err) {
      handleWriteError(err)
      setSaveState("idle")
    } finally {
      inFlight.current = false
      // Edits typed while the request was in flight — send them now.
      if (pendingRef.current.size > 0) flush()
    }
  }, [adoptServerSheet, handleWriteError])

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(flush, FLUSH_DELAY_MS)
  }, [flush])

  const applyEdit = useCallback(
    (edit: CellEdit) => {
      setSheet((prev) => (prev ? applyLocally(prev, edit) : prev))
      pendingRef.current.set(pendingKey(edit), edit)
      setSaveState("pending")
      scheduleFlush()
    },
    [scheduleFlush]
  )

  /** Row add/delete/restore need a settled revision — flush pending edits first. */
  const structural = useCallback(
    async (op: (sheet: ProjectionSheet) => Promise<{ sheet: ProjectionSheet }>) => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      await flush()
      const current = sheetRef.current
      if (!current) return
      try {
        const { sheet: fresh } = await op(current)
        adoptServerSheet(fresh)
      } catch (err) {
        handleWriteError(err)
      }
    },
    [flush, adoptServerSheet, handleWriteError]
  )

  const addRow = useCallback(async () => {
    const prevIds = new Set((sheetRef.current?.rows ?? []).map((r) => r.rowId))
    await structural((s) => addProjectionRow(s.year, s.revision))
    const added = sheetRef.current?.rows.find((r) => !prevIds.has(r.rowId))
    if (added) setLastAddedRowId(added.rowId)
  }, [structural])
  const deleteRow = useCallback(
    (rowId: string) => structural((s) => deleteProjectionRow(s.year, s.revision, rowId)),
    [structural]
  )
  const restoreSnapshot = useCallback(
    (snapshotId: string) => structural(() => restoreProjectionSnapshot(snapshotId)),
    [structural]
  )

  // Flush on unmount / tab close so trailing keystrokes aren't lost.
  useEffect(() => {
    const onHide = () => {
      if (pendingRef.current.size > 0) flush()
    }
    window.addEventListener("pagehide", onHide)
    return () => {
      window.removeEventListener("pagehide", onHide)
      onHide()
      if (flushTimer.current) clearTimeout(flushTimer.current)
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [flush])

  return {
    sheet,
    years,
    loading,
    error,
    saveState,
    conflict,
    lastAddedRowId,
    applyEdit,
    addRow,
    deleteRow,
    restoreSnapshot,
    reload: load,
    dismissConflict: () => setConflict(false),
  }
}
