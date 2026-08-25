import { useCallback, useEffect, useRef, useState } from "react"
import {
  addProjectionRow,
  deleteProjectionRow,
  fetchProjectionSheet,
  moveProjectionRow,
  patchProjectionRows,
  reorderProjectionRows,
  restoreProjectionSnapshot,
} from "./api"
import { computeSummary } from "./calc"
import { parseStyleToken, styleToken } from "./cellStyles"
import type { CellEdit, ProjectionRow, ProjectionSheet } from "./types"

export type SaveState = "idle" | "pending" | "saving" | "saved"

/** One entry in the local undo/redo history: the edit as sent plus the value
 *  the cell held before it. Only this user's own edits are recorded — peers'
 *  changes arrive via sheet adoption and are never undoable from here. */
/** What the undo/redo toast says, as a finished sentence for each direction
 *  ("Undid the % Win edit on 4512 N Ashland" / "Redid the % Win edit on
 *  4512 N Ashland"). Written per direction so nothing gets glued together
 *  at display time. */
export interface HistoryLabel {
  undo: string
  redo: string
}

/** What an undo/redo did: the toast sentence, plus the single cell it
 *  changed when it changed exactly one (so the page can make it the active
 *  cell). null cell = a group stroke, a row add, or a sheet-level field. */
export interface HistoryResult {
  label: string
  cell: { rowId: string; field: string } | null
}

type HistoryEntry =
  | {
      kind: "cell"
      edit: CellEdit
      before: string | number
      label: HistoryLabel
    }
  | {
      /** Several cell edits made as ONE gesture (an area paint stroke):
       *  undo/redo replays them all together. */
      kind: "group"
      entries: { edit: CellEdit; before: string | number }[]
      label: HistoryLabel
    }
  | {
      /** An "Add project" press. Undo deletes the row; redo adds a fresh row
       *  and re-applies whatever had been typed into the removed one. */
      kind: "add"
      section: "rows" | "pipeline"
      rowId: string
      snapshot: ProjectionRow | null
      label: HistoryLabel
    }
  | {
      /** A pipeline award (or its reverse). Undo moves the row back to the
       *  section it came from; redo moves it forward again. */
      kind: "move"
      rowId: string
      from: "rows" | "pipeline"
      to: "rows" | "pipeline"
      label: HistoryLabel
    }

const HISTORY_LIMIT = 100

const FIELD_LABELS: Record<string, string> = {
  address: "Address",
  client: "Client",
  name: "Name",
  units: "Units",
  avgUnitPrice: "Avg Unit Price",
  pctWin: "% Win",
  grossMargin: "Margin",
  overheadMonthly: "monthly overhead",
}

const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** The thing that changed, as it reads mid-sentence: "the % Win edit",
 *  "the March edit", "the March actual COGS edit", "the color". */
function fieldPhrase(field: string): string {
  if (field.startsWith("style:")) return "the color"
  if (field.startsWith("month:")) return `the ${LONG_MONTHS[Number(field.slice(6))] ?? "month"} edit`
  if (field.startsWith("actual:")) {
    const [, metric, idx] = field.split(":")
    const name = metric === "cogs" ? "COGS" : metric
    return `the ${LONG_MONTHS[Number(idx)] ?? ""} actual ${name} edit`.replace(/\s+/g, " ")
  }
  return `the ${FIELD_LABELS[field] ?? field} edit`
}

function findRow(sheet: ProjectionSheet, rowId: string | null): ProjectionRow | undefined {
  if (rowId == null) return undefined
  return sheet.rows.find((r) => r.rowId === rowId) ?? sheet.pipeline.find((r) => r.rowId === rowId)
}

function describeEdit(sheet: ProjectionSheet, edit: CellEdit): HistoryLabel {
  const what = fieldPhrase(edit.field)
  const row = findRow(sheet, edit.rowId)
  const rowName = row ? row.address || row.name || row.client : ""
  const where = rowName ? ` on ${rowName}` : ""
  if (edit.field.startsWith("style:")) {
    return { undo: `Put the color back${where}`, redo: `Changed the color again${where}` }
  }
  return { undo: `Undid ${what}${where}`, redo: `Redid ${what}${where}` }
}

/** The value a cell currently holds, addressed the same way applyLocally
 *  writes it. null = target not found (row deleted, unknown field). */
function readValue(sheet: ProjectionSheet, edit: CellEdit): string | number | null {
  if (edit.field === "overheadMonthly") return sheet.overheadMonthly
  if (edit.field.startsWith("actual:")) {
    const [, metric, idxRaw] = edit.field.split(":")
    if (metric === "revenue" || metric === "cogs" || metric === "overhead") {
      return sheet.actuals[metric][Number(idxRaw)] ?? 0
    }
    return null
  }
  const row = findRow(sheet, edit.rowId)
  if (!row) return null
  // Style edits: the "value" is the cell's full color token ("" = unstyled),
  // so undo replays the exact prior state.
  if (edit.field.startsWith("style:")) return styleToken(row.styles?.[edit.field.slice(6)])
  if (edit.field.startsWith("month:")) return row.months[Number(edit.field.slice(6))] ?? 0
  const v = row[edit.field as keyof ProjectionRow]
  return typeof v === "string" || typeof v === "number" ? v : null
}

/** A backend that predates the pipeline/actuals fields (or an old snapshot
 *  restore) serves sheets without them — fill defaults and recompute the
 *  summary locally so the UI never sees a partial shape. */
function normalizeSheet(sheet: ProjectionSheet): ProjectionSheet {
  if (sheet.pipeline && sheet.actuals && sheet.summary?.pipeline && sheet.summary?.actuals) return sheet
  const pipeline = sheet.pipeline ?? []
  const actuals = sheet.actuals ?? {
    revenue: Array(12).fill(0),
    cogs: Array(12).fill(0),
    overhead: Array(12).fill(0),
  }
  return { ...sheet, pipeline, actuals, summary: computeSummary(sheet.rows, sheet.overheadMonthly, pipeline, actuals) }
}

/** How a row reached the projection grid: dropped by hand (it's already
 *  where the user is looking) or sent from the pipeline's award button
 *  (the grid may be off-screen, so the page glides to it). */
export type AwardVia = "drag" | "button"

const FLUSH_DELAY_MS = 750
const SAVED_BADGE_MS = 1800

function pendingKey(edit: CellEdit) {
  return `${edit.rowId ?? "sheet"}|${edit.field}`
}

/** Apply an edit to a local sheet copy and recompute every derived value. */
function applyLocally(sheet: ProjectionSheet, edit: CellEdit): ProjectionSheet {
  let overheadMonthly = sheet.overheadMonthly
  let rows = sheet.rows
  let pipeline = sheet.pipeline
  let actuals = sheet.actuals
  const editRow = (row: (typeof rows)[number]) => {
    if (row.rowId !== edit.rowId) return row
    if (edit.field.startsWith("style:")) {
      const target = edit.field.slice(6)
      const style = parseStyleToken(String(edit.value))
      const styles = { ...(row.styles ?? {}) }
      if (style) styles[target] = style
      else delete styles[target]
      return { ...row, styles: Object.keys(styles).length ? styles : undefined }
    }
    if (edit.field.startsWith("month:")) {
      const idx = Number(edit.field.slice(6))
      const months = [...row.months]
      months[idx] = Number(edit.value) || 0
      return { ...row, months }
    }
    const isText = edit.field === "address" || edit.field === "client" || edit.field === "name"
    return { ...row, [edit.field]: isText ? String(edit.value) : Number(edit.value) || 0 }
  }
  if (edit.field === "overheadMonthly") {
    overheadMonthly = Number(edit.value) || 0
  } else if (edit.field.startsWith("actual:")) {
    const [, metric, idxRaw] = edit.field.split(":")
    const idx = Number(idxRaw)
    if (metric === "revenue" || metric === "cogs" || metric === "overhead") {
      const arr = [...actuals[metric]]
      arr[idx] = Number(edit.value) || 0
      actuals = { ...actuals, [metric]: arr }
    }
  } else if (sheet.rows.some((r) => r.rowId === edit.rowId)) {
    rows = sheet.rows.map(editRow)
  } else {
    pipeline = sheet.pipeline.map(editRow)
  }
  return { ...sheet, rows, pipeline, actuals, overheadMonthly, summary: computeSummary(rows, overheadMonthly, pipeline, actuals) }
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
  /** The row that just arrived in the projection grid from the pipeline
   *  (award, or the redo of one): the grid glides to it and starts its
   *  schedule in January. Bumped per landing so a second award of the same
   *  row (undo → redo) lands again. */
  const [landed, setLanded] = useState<{ rowId: string; seq: number; via: AwardVia } | null>(null)

  const pendingRef = useRef<Map<string, CellEdit>>(new Map())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetRef = useRef<ProjectionSheet | null>(null)
  sheetRef.current = sheet
  const inFlight = useRef(false)
  /** Rows shown optimistically whose POST hasn't landed yet: their edits stay
   *  pending (the server would 404 them) until the row exists. */
  const unbornRows = useRef<Set<string>>(new Set())
  const failed = useRef(false)
  const conflictRetries = useRef(0)
  // What "Retry" re-runs after a failed write. Failed cell edits are already
  // back in the pending map (so a retry just flushes); a failed structural
  // op (add/delete/reorder/restore) is remembered here as a thunk. Null =
  // the failure was the initial load, so retry reloads.
  const retryRef = useRef<(() => void) | null>(null)

  // Undo/redo over this user's own cell edits. Stacks live in refs (pushes
  // happen inside event handlers); the size state drives canUndo/canRedo.
  const undoStack = useRef<HistoryEntry[]>([])
  const redoStack = useRef<HistoryEntry[]>([])
  const [historySizes, setHistorySizes] = useState({ undo: 0, redo: 0 })
  const syncHistorySizes = () =>
    setHistorySizes({ undo: undoStack.current.length, redo: redoStack.current.length })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setConflict(false)
    pendingRef.current.clear()
    undoStack.current = []
    redoStack.current = []
    setHistorySizes({ undo: 0, redo: 0 })
    try {
      const { sheet: fresh, years: allYears } = await fetchProjectionSheet(year)
      setSheet(normalizeSheet(fresh))
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
    let next = normalizeSheet(fresh)
    for (const edit of pendingRef.current.values()) {
      next = applyLocally(next, edit)
    }
    // Keep the ref current immediately (not at next render) so callers awaiting
    // a structural op can diff against the adopted sheet.
    sheetRef.current = next
    setSheet(next)
  }, [])

  /** A sheet pushed over the collab socket (someone else saved). Adopt only if
   *  it's genuinely newer — the saver's own HTTP response and the broadcast
   *  race, and either may arrive first. Pending local edits replay on top. */
  const adoptRemoteSheet = useCallback(
    (fresh: ProjectionSheet) => {
      const current = sheetRef.current
      if (!current || fresh.year !== current.year || fresh.revision <= current.revision) return
      adoptServerSheet(fresh)
    },
    [adoptServerSheet]
  )

  /** Silent refetch (no skeleton, no banner) — used when a reconnect reveals
   *  commits happened while the socket was down. */
  const resync = useCallback(async () => {
    try {
      const { sheet: fresh } = await fetchProjectionSheet(year)
      adoptRemoteSheet(normalizeSheet(fresh))
    } catch {
      /* next save or reload will surface any real problem */
    }
  }, [year, adoptRemoteSheet])

  const handleWriteError = useCallback(
    (err: unknown, retry: (() => void) | null) => {
      if ((err as { status?: number }).status === 409) {
        setConflict(true)
        load()
      } else {
        retryRef.current = retry
        setError(err instanceof Error ? err.message : "Save failed")
      }
    },
    [load]
  )

  /** Flip the header badge to "Saved" and let it fade back to idle. */
  const markSaved = useCallback(() => {
    setSaveState("saved")
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaveState("idle"), SAVED_BADGE_MS)
  }, [])

  const flush = useCallback(async () => {
    const current = sheetRef.current
    if (!current || pendingRef.current.size === 0 || inFlight.current) return
    const edits: CellEdit[] = []
    for (const [key, edit] of pendingRef.current) {
      if (unbornRows.current.has(edit.rowId)) continue
      edits.push(edit)
      pendingRef.current.delete(key)
    }
    if (edits.length === 0) return
    inFlight.current = true
    failed.current = false
    setSaveState("saving")
    try {
      const { sheet: fresh } = await patchProjectionRows(current.year, current.revision, edits)
      conflictRetries.current = 0
      adoptServerSheet(fresh)
      if (pendingRef.current.size === 0) markSaved()
    } catch (err) {
      if ((err as { status?: number }).status === 409) {
        // With live collaboration a 409 usually just means a peer's save
        // landed between our broadcast and our flush. Recover silently: put
        // the failed batch back (newer keystrokes win), adopt their sheet,
        // and retry. Only repeated failures surface the conflict banner.
        for (const edit of edits) {
          const key = pendingKey(edit)
          if (!pendingRef.current.has(key)) pendingRef.current.set(key, edit)
        }
        conflictRetries.current += 1
        if (conflictRetries.current >= 3) {
          conflictRetries.current = 0
          setConflict(true)
          load()
          setSaveState("idle")
        } else {
          try {
            const { sheet: fresh } = await fetchProjectionSheet(current.year)
            adoptServerSheet(normalizeSheet(fresh))
            setSaveState("pending")
            if (flushTimer.current) clearTimeout(flushTimer.current)
            flushTimer.current = setTimeout(() => flush(), FLUSH_DELAY_MS)
          } catch {
            setConflict(true)
            load()
            setSaveState("idle")
          }
        }
      } else {
        // Anything else (network, 5xx): nothing is lost. The batch goes back
        // into pending (newer keystrokes win) and stays there until a retry
        // or the next flush lands.
        for (const edit of edits) {
          const key = pendingKey(edit)
          if (!pendingRef.current.has(key)) pendingRef.current.set(key, edit)
        }
        failed.current = true
        handleWriteError(err, null)
        setSaveState("pending")
      }
    } finally {
      inFlight.current = false
      // Edits typed while the request was in flight — send them now (not
      // after a failure: those are waiting on Retry, and looping would hammer
      // a server that just said no).
      if (!failed.current && [...pendingRef.current.values()].some((e) => !unbornRows.current.has(e.rowId))) flush()
    }
  }, [adoptServerSheet, handleWriteError, markSaved])

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(flush, FLUSH_DELAY_MS)
  }, [flush])

  /** Optimistic apply + queue for flush, no history bookkeeping — the shared
   *  path under both user edits and undo/redo replays. */
  const pushEdit = useCallback(
    (edit: CellEdit) => {
      setSheet((prev) => (prev ? applyLocally(prev, edit) : prev))
      pendingRef.current.set(pendingKey(edit), edit)
      setSaveState("pending")
      scheduleFlush()
    },
    [scheduleFlush]
  )

  /** A user-originated edit: record the prior value for undo, then apply.
   *  Undo/redo replays travel the same pending→flush→commit pipeline, so they
   *  reach the audit log and broadcast to collab peers like any other edit. */
  const applyEdit = useCallback(
    (edit: CellEdit) => {
      const current = sheetRef.current
      if (current) {
        const before = readValue(current, edit)
        if (before != null && before !== edit.value) {
          undoStack.current.push({ kind: "cell", edit, before, label: describeEdit(current, edit) })
          if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
          redoStack.current = []
          syncHistorySizes()
        }
      }
      pushEdit(edit)
    },
    [pushEdit]
  )

  /** Several user edits as one undoable step (an area paint stroke). Cells
   *  whose value wouldn't change are skipped; nothing is recorded if none
   *  change. */
  const applyEdits = useCallback(
    (edits: CellEdit[], label: HistoryLabel) => {
      const current = sheetRef.current
      if (!current) return
      const entries: { edit: CellEdit; before: string | number }[] = []
      for (const edit of edits) {
        const before = readValue(current, edit)
        if (before != null && before !== edit.value) entries.push({ edit, before })
      }
      if (entries.length === 0) return
      undoStack.current.push({ kind: "group", entries, label })
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      redoStack.current = []
      syncHistorySizes()
      for (const { edit } of entries) pushEdit(edit)
    },
    [pushEdit]
  )

  // `structural` is declared below (it needs flush); history replays reach
  // it through a ref so the callback order doesn't matter.
  const structuralRef = useRef<
    ((op: (sheet: ProjectionSheet) => Promise<{ sheet: ProjectionSheet }>) => Promise<void>) | null
  >(null)
  const moveRowRef = useRef<
    ((rowId: string, to: "rows" | "pipeline", label: HistoryLabel | null) => Promise<void>) | null
  >(null)

  /** Redo of an undone add: a fresh server row (new rowId), then the removed
   *  row's inputs re-applied to it as ordinary edits. The history entry is
   *  re-pointed at the new id so a further undo takes back the right row. */
  const readdRow = useCallback(
    async (entry: Extract<HistoryEntry, { kind: "add" }>) => {
      const prevIds = new Set((sheetRef.current?.[entry.section] ?? []).map((r) => r.rowId))
      await structuralRef.current?.((s) =>
        addProjectionRow(s.year, s.revision, entry.section === "pipeline" ? "pipeline" : undefined)
      )
      const added = sheetRef.current?.[entry.section].find((r) => !prevIds.has(r.rowId))
      if (!added) return
      entry.rowId = added.rowId
      setLastAddedRowId(added.rowId)
      const snap = entry.snapshot
      if (!snap) return
      const fields: CellEdit[] = [
        { rowId: added.rowId, field: "address", value: snap.address },
        { rowId: added.rowId, field: "client", value: snap.client },
        { rowId: added.rowId, field: "name", value: snap.name },
        { rowId: added.rowId, field: "units", value: snap.units },
        { rowId: added.rowId, field: "avgUnitPrice", value: snap.avgUnitPrice },
        { rowId: added.rowId, field: "pctWin", value: snap.pctWin },
        { rowId: added.rowId, field: "grossMargin", value: snap.grossMargin },
        ...snap.months.map((m, i) => ({ rowId: added.rowId, field: `month:${i}`, value: m })),
      ]
      for (const edit of fields) {
        if (readValue(sheetRef.current!, edit) !== edit.value) pushEdit(edit)
      }
    },
    [pushEdit]
  )

  /** Pop the newest history entry whose target row still exists (a peer may
   *  have deleted it) and replay it in the given direction. Returns what it
   *  did, or null when there was nothing (left) to do. */
  const replayHistory = useCallback(
    (dir: "undo" | "redo"): HistoryResult | null => {
      const [from, to] = dir === "undo" ? [undoStack, redoStack] : [redoStack, undoStack]
      let result: HistoryResult | null = null
      while (from.current.length > 0) {
        const entry = from.current.pop()!
        const current = sheetRef.current
        if (entry.kind === "move") {
          const [src, dst] = dir === "undo" ? [entry.to, entry.from] : [entry.from, entry.to]
          if (!current?.[src].some((r) => r.rowId === entry.rowId)) continue
          to.current.push(entry)
          void moveRowRef.current?.(entry.rowId, dst, null)
          result = { label: entry.label[dir], cell: null }
          break
        }
        if (entry.kind === "add") {
          if (dir === "undo") {
            // The row must still exist to be taken back (a peer may have
            // deleted it). Remember its contents so redo can rebuild them.
            const row = current ? findRow(current, entry.rowId) : undefined
            if (!row) continue
            const next = { ...entry, snapshot: row }
            to.current.push(next)
            void structuralRef.current?.((s) => deleteProjectionRow(s.year, s.revision, entry.rowId))
          } else {
            to.current.push(entry)
            void readdRow(entry)
          }
          result = { label: entry.label[dir], cell: null }
          break
        }
        if (entry.kind === "group") {
          // Replay every member whose row still exists; skip the entry
          // entirely if none do.
          const live = entry.entries.filter(
            ({ edit }) => edit.rowId == null || (current != null && findRow(current, edit.rowId) != null)
          )
          if (live.length === 0) continue
          to.current.push(entry)
          for (const { edit, before } of live) pushEdit({ ...edit, value: dir === "undo" ? before : edit.value })
          result = { label: entry.label[dir], cell: null }
          break
        }
        if (entry.edit.rowId != null && (!current || !findRow(current, entry.edit.rowId))) continue
        to.current.push(entry)
        pushEdit({ ...entry.edit, value: dir === "undo" ? entry.before : entry.edit.value })
        const { rowId, field } = entry.edit
        // A color edit targets the cell it colored, not a "style:" column.
        result = { label: entry.label[dir], cell: rowId != null ? { rowId, field: field.replace(/^style:/, "") } : null }
        break
      }
      syncHistorySizes()
      return result
    },
    [pushEdit, readdRow]
  )
  const undo = useCallback(() => replayHistory("undo"), [replayHistory])
  const redo = useCallback(() => replayHistory("redo"), [replayHistory])

  /** Row add/delete/restore need a settled revision — flush pending edits first. */
  const structural = useCallback(
    async (op: (sheet: ProjectionSheet) => Promise<{ sheet: ProjectionSheet }>) => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      await flush()
      const current = sheetRef.current
      if (!current) return
      // Same header badge as cell edits: a row move, add, delete or restore
      // shows Saving while in flight and Saved once the server has it.
      setSaveState("saving")
      try {
        const { sheet: fresh } = await op(current)
        adoptServerSheet(fresh)
        if (pendingRef.current.size === 0) markSaved()
      } catch (err) {
        handleWriteError(err, () => structural(op))
        setSaveState(pendingRef.current.size > 0 ? "pending" : "idle")
      }
    },
    [flush, adoptServerSheet, handleWriteError, markSaved]
  )
  structuralRef.current = structural

  /** An add is undoable (Cmd+Z deletes the new row again). */
  const recordAdd = useCallback((section: "rows" | "pipeline", rowId: string, label: HistoryLabel) => {
    undoStack.current.push({ kind: "add", section, rowId, snapshot: null, label })
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
    redoStack.current = []
    syncHistorySizes()
  }, [])

  /** Optimistic add. The row appears in the sheet immediately under a
   *  client-minted id the server adopts, so the React key never changes and
   *  nothing remounts when the response lands. `initial` (whatever was typed
   *  into the blank line) rides along as ordinary edits: they apply locally
   *  now and flush the moment the row exists on the server. */
  const addOptimistic = useCallback(
    async (section: "rows" | "pipeline", rowId: string, initial: CellEdit[], label: HistoryLabel) => {
      const current = sheetRef.current
      if (!current) return
      const list = current[section]
      let next: ProjectionSheet = {
        ...current,
        [section]: [
          ...list,
          {
            rowId,
            address: "",
            client: "",
            name: "",
            units: 0,
            avgUnitPrice: 0,
            pctWin: 1,
            grossMargin: 0.22,
            months: Array(12).fill(0),
            sortOrder: list.length ? Math.max(...list.map((r) => r.sortOrder)) + 1 : 0,
          },
        ],
      }
      for (const e of initial) next = applyLocally(next, { ...e, rowId })
      sheetRef.current = next
      setSheet(next)
      unbornRows.current.add(rowId)
      for (const e of initial) pendingRef.current.set(pendingKey({ ...e, rowId }), { ...e, rowId })
      recordAdd(section, rowId, label)
      // adoptServerSheet replays pending (incl. this row's) over the response,
      // so the row keeps every value typed while the request was in flight.
      await structural((s) => addProjectionRow(s.year, s.revision, section === "pipeline" ? "pipeline" : undefined, rowId))
      unbornRows.current.delete(rowId)
      if (pendingRef.current.size > 0) {
        setSaveState("pending")
        scheduleFlush()
      }
    },
    [structural, recordAdd, scheduleFlush]
  )
  const addRow = useCallback(
    (rowId: string, initial: CellEdit[] = []) =>
      addOptimistic("rows", rowId, initial, {
        undo: "Removed the project you just added",
        redo: "Added the project back",
      }),
    [addOptimistic]
  )
  const addPipelineRow = useCallback(
    (rowId: string, initial: CellEdit[] = []) =>
      addOptimistic("pipeline", rowId, initial, {
        undo: "Removed the pipeline project you just added",
        redo: "Added the pipeline project back",
      }),
    [addOptimistic]
  )
  const deleteRow = useCallback(
    (rowId: string) => structural((s) => deleteProjectionRow(s.year, s.revision, rowId)),
    [structural]
  )
  /** Drag-rearranged order for one section: applied locally at once (the
   *  row lands where it was dropped, no round-trip flicker), then persisted
   *  as the sheet's sortOrder so every viewer sees the same arrangement. */
  const reorderRows = useCallback(
    async (section: "rows" | "pipeline", order: string[], movedRowId: string) => {
      const applyOrder = (list: ProjectionRow[]) => {
        const position = new Map(order.map((id, i) => [id, i]))
        return [...list]
          .map((r) => ({ ...r, sortOrder: position.get(r.rowId) ?? r.sortOrder }))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      }
      setSheet((prev) => (prev ? { ...prev, [section]: applyOrder(prev[section]) } : prev))
      await structural((s) => reorderProjectionRows(s.year, s.revision, section, order, movedRowId))
    },
    [structural]
  )
  /** Move a row between sections, applied locally at once (the row leaves
   *  one table and appears at the bottom of the other in the same render)
   *  then persisted. `label` null = a history replay (not recorded again). */
  const moveRow = useCallback(
    async (rowId: string, to: "rows" | "pipeline", label: HistoryLabel | null, via: AwardVia = "button") => {
      const from = to === "rows" ? "pipeline" : "rows"
      const current = sheetRef.current
      const row = current?.[from].find((r) => r.rowId === rowId)
      if (!current || !row) return
      const target = current[to]
      const moved: ProjectionRow = {
        ...row,
        sortOrder: target.length ? Math.max(...target.map((r) => r.sortOrder)) + 1 : 0,
      }
      const nextRows = to === "rows" ? [...current.rows, moved] : current.rows.filter((r) => r.rowId !== rowId)
      const nextPipeline = to === "pipeline" ? [...current.pipeline, moved] : current.pipeline.filter((r) => r.rowId !== rowId)
      const next: ProjectionSheet = {
        ...current,
        rows: nextRows,
        pipeline: nextPipeline,
        summary: computeSummary(nextRows, current.overheadMonthly, nextPipeline, current.actuals),
      }
      sheetRef.current = next
      setSheet(next)
      if (to === "rows") setLanded((prev) => ({ rowId, seq: (prev?.seq ?? 0) + 1, via }))
      if (label) {
        undoStack.current.push({ kind: "move", rowId, from, to, label })
        if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
        redoStack.current = []
        syncHistorySizes()
      }
      // The landing is fully optimistic: let the drop frame commit and its
      // scroll/confetti start before any network work (a pending-edit flush
      // plus the move POST) competes with it.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await structural((s) => moveProjectionRow(s.year, s.revision, rowId, to))
    },
    [structural]
  )
  moveRowRef.current = moveRow
  /** Award a pipeline project: it joins the projection grid, unscheduled. */
  const awardRow = useCallback(
    (rowId: string, via: AwardVia = "button") => {
      const row = sheetRef.current?.pipeline.find((r) => r.rowId === rowId)
      const name = row?.name || row?.address || "the project"
      return moveRow(
        rowId,
        "rows",
        {
          undo: `Returned ${name} to the pipeline`,
          redo: `Awarded ${name} again`,
        },
        via
      )
    },
    [moveRow]
  )
  const restoreSnapshot = useCallback(
    (snapshotId: string) => structural(() => restoreProjectionSnapshot(snapshotId)),
    [structural]
  )

  /** Re-run whatever failed: staged cell edits flush again, a failed
   *  structural op re-runs, and a failed initial load reloads. Never a full
   *  reload while edits are staged — that would throw them away. */
  const retry = useCallback(() => {
    setError(null)
    const op = retryRef.current
    retryRef.current = null
    if (flushTimer.current) clearTimeout(flushTimer.current)
    if (pendingRef.current.size > 0) flush()
    if (op) op()
    else if (pendingRef.current.size === 0 && !sheetRef.current) load()
  }, [flush, load])

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
    applyEdits,
    undo,
    redo,
    canUndo: historySizes.undo > 0,
    canRedo: historySizes.redo > 0,
    addRow,
    addPipelineRow,
    deleteRow,
    reorderRows,
    awardRow,
    landed,
    restoreSnapshot,
    adoptRemoteSheet,
    resync,
    retry,
    /** Staged edits still waiting to be saved (surfaced in the error toast). */
    pendingCount: pendingRef.current.size,
    reload: load,
    dismissError: () => setError(null),
    dismissConflict: () => setConflict(false),
  }
}
