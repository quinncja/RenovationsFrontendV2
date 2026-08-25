import { useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { fetchPageData, type PageDataResponse } from "../../shared/api/pageApi"
import { History, Check, CloudUpload, Undo2, Redo2, AlertCircle, X, Download } from "lucide-react"
import Page from "../../shared/components/Page"
import { SkelText } from "../../shared/components/SkelText"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import { formatMoneyFull, formatRatioPercent, shortMonth } from "../../shared/utils/format"
import { useAuth } from "../../core/auth/AuthProvider"
import { useProjectionBoard, type SaveState } from "./useProjectionBoard"
import { useProjectionCollab, CollabContext, peerColor, peerLabel, type PresencePeer } from "./useProjectionCollab"
import { CellFormatProvider } from "./CellFormat"
import { useOverlayScroll } from "./useOverlayScroll"
import { ProjectionGrid } from "./ProjectionGrid"
import { PipelineTable } from "./PipelineTable"
import { ProjectionDnd } from "./RowDrag"
import { BoardHistoryDrawer } from "./BoardHistoryDrawer"
import { exportProjectionWorkbook } from "./exportProjection"
import type { CellEdit, ProjectionSummary } from "./types"

// The Projection Board: the Master Projection Sheet as a living page. The grid
// holds the per-project inputs; every formula column and the monthly P&L
// summary recompute locally on each keystroke (calc.ts) while edits batch to
// the backend. History/versions live in the drawer.

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null
  return (
    <span className={`pj-save-indicator callout${state === "saved" ? " pj-save-indicator-saved" : ""}`}>
      {state === "saved" ? <Check size={12} /> : <CloudUpload size={12} />}
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Unsaved edits"}
    </span>
  )
}

/** Who ELSE is on the board right now: one initials chip per person, colored
 *  by the same stable hash their cell rings use. The signed-in user is never
 *  shown to themselves — the hook only excludes this tab's connection, so a
 *  second tab or a stale connection lingering through a reconnect would
 *  otherwise put your own badge in the roster. */
function PresenceRoster({ peers, selfUid }: { peers: PresencePeer[]; selfUid?: string | null }) {
  const byUid = new Map<string, PresencePeer>()
  for (const p of peers) if (p.uid !== selfUid && !byUid.has(p.uid)) byUid.set(p.uid, p)
  const list = [...byUid.values()]
  if (list.length === 0) return null
  const initials = (p: PresencePeer) =>
    peerLabel(p)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
  return (
    <div className="pj-presence" title={`Also here: ${list.map(peerLabel).join(", ")}`}>
      {list.slice(0, 5).map((p) =>
        // The account's sign-in photo, ringed in the same color as their cell
        // highlight; initials only when the account has no photo.
        p.picture ? (
          <img
            key={p.uid}
            className="pj-presence-chip pj-presence-photo"
            style={{ borderColor: peerColor(p) }}
            src={p.picture}
            alt={peerLabel(p)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span key={p.uid} className="pj-presence-chip" style={{ background: peerColor(p) }}>
            {initials(p)}
          </span>
        )
      )}
      {list.length > 5 && <span className="pj-presence-chip pj-presence-more">+{list.length - 5}</span>}
    </div>
  )
}

interface HistoryToastState {
  id: number
  dir: "undo" | "redo"
  label: string
}

/** Transient confirmation of what Cmd+Z / Cmd+Shift+Z just did, as a full
 *  sentence from history ("Undid the % Win edit on 4512 N Ashland"). Keyed
 *  by id so rapid undos restart the entrance fade. */
function HistoryToast({ toast }: { toast: HistoryToastState | null }) {
  if (!toast) return null
  return (
    <div key={toast.id} className="pj-history-toast callout" role="status">
      {toast.dir === "undo" ? <Undo2 size={13} /> : <Redo2 size={13} />}
      <span>{toast.label}</span>
    </div>
  )
}

function money0(v: number): string {
  return formatMoneyFull(Math.round(v))
}

/** Booked actuals pulled live from Sage GL via the dashboard's monthly
 *  comparison queries (revenue = 4xxx, COGS = direct-expense families,
 *  overhead = 6xxx; all capped at the oldest open period so partial months
 *  never show). Months with no postings read as not-yet-entered. */
interface SageActuals {
  /** Units of the year's phase jobs, by phase month (monthlyUnitsActual). */
  units: number[]
  revenue: number[]
  cogs: number[]
  overhead: number[]
  net: number[]
  hasMonth: boolean[]
}

function buildSageActuals(data: PageDataResponse, year: number): SageActuals {
  const pick = (key: string, field: string): number[] => {
    const rows = (data[key] as Array<Record<string, number>> | null) ?? []
    const arr = Array(12).fill(0) as number[]
    for (const r of rows) {
      // monthlyUnitsActual rows carry no year (the query is year-scoped).
      const yearOk = r.year == null || Number(r.year) === year
      if (yearOk && r.month >= 1 && r.month <= 12) arr[r.month - 1] = Number(r[field]) || 0
    }
    return arr
  }
  const units = pick("monthlyUnitsActual", "units")
  const revenue = pick("monthlyRevenueComparison", "revenue")
  const cogs = pick("monthlyDirectExpenseComparison", "expense")
  const overhead = pick("monthlyOverheadComparison", "overhead")
  const hasMonth = revenue.map((v, m) => v !== 0 || cogs[m] !== 0 || overhead[m] !== 0)
  const net = revenue.map((v, m) => v - cogs[m] - overhead[m])
  return { units, revenue, cogs, overhead, net, hasMonth }
}

function useSageActuals(year: number): SageActuals | null {
  // Tagged with the year it was fetched for, so a year switch reads as
  // "loading" until the new response lands (no synchronous reset needed).
  const [state, setState] = useState<{ year: number; actuals: SageActuals } | null>(null)
  useEffect(() => {
    let alive = true
    fetchPageData({
      module: "dashboard",
      queries: ["monthlyRevenueComparison", "monthlyDirectExpenseComparison", "monthlyOverheadComparison", "monthlyUnitsActual"],
      // /home-data derives its SQL year bounds from this param — without it
      // the queries run with a null year and return nothing.
      params: { year },
    })
      .then((data) => {
        if (alive) setState({ year, actuals: buildSageActuals(data, year) })
      })
      .catch(() => {
        /* section falls back to dashes */
      })
    return () => {
      alive = false
    }
  }, [year])
  return state?.year === year ? state.actuals : null
}

/** The sheet's summary zone, split into two labeled sections: the PROJECTED
 *  P&L computed from the grid, and the booked ACTUAL figures entered by hand
 *  each month (revenue / COGS / overhead editable, net + variance derived). */
function MonthlySummary({
  summary,
  sage,
  onEdit,
}: {
  summary: ProjectionSummary
  sage: SageActuals | null
  onEdit: (edit: CellEdit) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const { scrollRef, frameRef, frameClass, onScroll, affordances } = useOverlayScroll()

  const commitOverhead = () => {
    if (draft == null) return
    const n = Number(draft.replace(/[$,\s,]/g, ""))
    setDraft(null)
    if (Number.isFinite(n) && n >= 0 && n !== summary.overheadMonthly) {
      onEdit({ rowId: null, field: "overheadMonthly", value: n })
    }
  }

  const sumAll = (arr: number[]) => arr.reduce((s, v) => s + v, 0)
  const a: SageActuals = sage ?? {
    units: Array(12).fill(0),
    revenue: Array(12).fill(0),
    cogs: Array(12).fill(0),
    overhead: Array(12).fill(0),
    net: Array(12).fill(0),
    hasMonth: Array(12).fill(false),
  }
  const sumEntered = (arr: number[]) => arr.reduce((s, v, m) => s + (a.hasMonth[m] ? v : 0), 0)

  // Plan vs booked, only across months that have actuals posted; the
  // cumulative line runs the gap forward so a bad month is visible in
  // the year-to-date position, not just its own column.
  const variance = a.net.map((v, m) => (a.hasMonth[m] ? v - summary.netByMonth[m] : 0))
  const cumulativeVariance: number[] = []
  variance.reduce((acc, v, m) => {
    cumulativeVariance[m] = acc + v
    return cumulativeVariance[m]
  }, 0)
  const varianceTotal = sumEntered(variance)
  // Booked net, run forward across entered months (mirrors the Projected
  // block's Cumulative line so the two statements read row-for-row).
  const cumulativeActualNet: number[] = []
  a.net.reduce((acc, v, m) => {
    cumulativeActualNet[m] = acc + (a.hasMonth[m] ? v : 0)
    return cumulativeActualNet[m]
  }, 0)

  type Line = {
    label: string
    cells: number[]
    kind: "int" | "money"
    total: number
    /** Masked cells render "–" (month not entered / no units). */
    mask?: (m: number) => boolean
    className?: string
  }
  type Group = { key: string; label: string; note?: string; className?: string; lines: Line[] }

  const overheadByMonth = Array(12).fill(summary.overheadMonthly) as number[]
  const groups: Group[] = [
    {
      key: "projected",
      label: "Projected",
      note: "from the board",
      className: "pj-summary-group-plan",
      lines: [
        { label: "Units", cells: summary.unitsByMonth, kind: "int", total: summary.scheduledUnits, mask: (m) => summary.unitsByMonth[m] === 0, className: "pj-summary-units" },
        { label: "Revenue", cells: summary.revenueByMonth, kind: "money", total: summary.scheduledRevenue },
        { label: "COGS", cells: summary.cogsByMonth, kind: "money", total: sumAll(summary.cogsByMonth) },
        { label: "Overhead", cells: overheadByMonth, kind: "money", total: summary.overheadMonthly * 12 },
        { label: "Net", cells: summary.netByMonth, kind: "money", total: summary.scheduledNet, className: "pj-summary-net" },
        { label: "Cumulative", cells: summary.cumulativeNet, kind: "money", total: summary.cumulativeNet[11] ?? 0, className: "pj-summary-cumulative" },
      ],
    },
    {
      key: "actual",
      label: "Actual",
      note: sage ? "booked in Sage" : "loading Sage…",
      className: "pj-summary-group-actual",
      lines: [
        { label: "Units", cells: a.units, kind: "int", total: sumAll(a.units), mask: (m) => a.units[m] === 0, className: "pj-summary-units" },
        { label: "Revenue", cells: a.revenue, kind: "money", total: sumEntered(a.revenue), mask: (m) => !a.hasMonth[m] },
        { label: "COGS", cells: a.cogs, kind: "money", total: sumEntered(a.cogs), mask: (m) => !a.hasMonth[m] },
        { label: "Overhead", cells: a.overhead, kind: "money", total: sumEntered(a.overhead), mask: (m) => !a.hasMonth[m] },
        { label: "Net", cells: a.net, kind: "money", total: sumEntered(a.net), mask: (m) => !a.hasMonth[m], className: "pj-summary-net" },
        { label: "Cumulative", cells: cumulativeActualNet, kind: "money", total: sumEntered(a.net), mask: (m) => !a.hasMonth[m], className: "pj-summary-cumulative" },
      ],
    },
    {
      key: "variance",
      label: "Net vs plan",
      note: "actual − projected",
      className: "pj-summary-group-variance",
      lines: [
        { label: "Variance", cells: variance, kind: "money", total: varianceTotal, mask: (m) => !a.hasMonth[m], className: "pj-summary-variance" },
        { label: "Cumulative", cells: cumulativeVariance, kind: "money", total: varianceTotal, mask: (m) => !a.hasMonth[m], className: "pj-summary-cumulative" },
      ],
    },
  ]

  const fmt = (line: Line, v: number) => (line.kind === "int" ? String(v) : money0(v))

  return (
    <div className="pj-summary card">
      <div className="pj-summary-head">
        <div className="pj-summary-title-group">
          <h2 className="widget-title headline">Monthly Summary</h2>
          <span className="widget-description">Projected P&amp;L vs actuals booked in Sage, by month</span>
        </div>
        <label className="pj-overhead-control callout text-secondary">
          Overhead / month
          <input
            className="pj-overhead-input"
            value={draft ?? money0(summary.overheadMonthly)}
            onFocus={(e) => {
              setDraft(String(summary.overheadMonthly))
              requestAnimationFrame(() => e.target.select())
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitOverhead}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
              if (e.key === "Escape") {
                setDraft(null)
                e.currentTarget.blur()
              }
            }}
            spellCheck={false}
          />
        </label>
      </div>
      <div className={frameClass} ref={frameRef}>
        <div className="pj-summary-scroll" ref={scrollRef} onScroll={onScroll}>
          <table className="pj-summary-table">
            <thead>
              <tr>
                <th className="pj-sticky" />
                {Array.from({ length: 12 }, (_, m) => (
                  <th key={m} className="pj-num">{shortMonth(m + 1)}</th>
                ))}
                <th className="pj-num pj-sticky-right pj-summary-total-col">Total</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key} className={`pj-summary-group ${g.className ?? ""}`}>
                <tr className="pj-summary-section">
                  <td className="pj-sticky">
                    <span className="pj-summary-section-label">{g.label}</span>
                    {g.note && <span className="pj-summary-section-note">{g.note}</span>}
                  </td>
                  <td colSpan={12} />
                  <td className="pj-sticky-right" />
                </tr>
                {g.lines.map((line) => (
                  <tr key={line.label} className={line.className}>
                    <td className="pj-sticky pj-summary-label">{line.label}</td>
                    {line.cells.map((v, m) => {
                      const masked = line.mask?.(m) ?? false
                      return (
                        <td key={m} className={`pj-num${!masked && v < 0 ? " pj-negative" : ""}${masked ? " pj-summary-blank" : ""}`}>
                          {masked ? "–" : fmt(line, v)}
                        </td>
                      )
                    })}
                    <td className={`pj-num pj-sticky-right pj-summary-total-col${line.total < 0 ? " pj-negative" : ""}`}>
                      {fmt(line, line.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        {affordances}
      </div>
    </div>
  )
}

/* ── Loading skeleton: mirrors the loaded stack card-for-card ──
   Stat strip (title/value/caption), Unit Projection grid (head, header band,
   rows with an address column and right-aligned numeric cells, totals bar,
   footer), Pipeline (same dress, fewer columns), Monthly Summary (label
   column + twelve month columns). Text-shaped pieces are SkelText inside the
   real type classes so heights track the loaded layout. */

const SKEL_CELL_PATTERNS = [
  [6, 7, 4, 5, 7, 6, 5],
  [8, 6, 5, 4, 6, 7, 6],
  [5, 7, 6, 4, 5, 6, 7],
]

function SkelTableRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="pj-skel-tr"
          style={{ gridTemplateColumns: `10rem repeat(${cols}, 1fr)` }}
        >
          <span className="skel-line pj-skel-addr" style={{ width: `${10 + (i % 3) * 3}ch` }} />
          {SKEL_CELL_PATTERNS[i % SKEL_CELL_PATTERNS.length].slice(0, cols).map((ch, j) => (
            <span key={j} className="skel-line" style={{ width: `${ch}ch` }} />
          ))}
        </div>
      ))}
    </>
  )
}

function SkelTableCard({
  card,
  titleCh,
  subtitleCh,
  rows,
  cols,
  footer,
}: {
  card: string
  titleCh: number
  subtitleCh: number
  rows: number
  cols: number
  footer?: boolean
}) {
  const template = { gridTemplateColumns: `10rem repeat(${cols}, 1fr)` }
  return (
    <div className={`${card} card`}>
      <div className="pj-summary-head">
        <div className="pj-summary-title-group">
          <h2 className="widget-title headline"><SkelText ch={titleCh} /></h2>
          <span className="widget-description"><SkelText ch={subtitleCh} /></span>
        </div>
      </div>
      <div className="pj-skel-table">
        <div className="pj-skel-tr pj-skel-th" style={template}>
          <span className="skel-line pj-skel-addr" style={{ width: "5ch" }} />
          {Array.from({ length: cols }, (_, j) => (
            <span key={j} className="skel-line" style={{ width: `${4 + (j % 3)}ch` }} />
          ))}
        </div>
        <SkelTableRows rows={rows} cols={cols} />
        {footer && (
          <div className="pj-skel-tr pj-skel-add">
            <span className="skel-line" style={{ width: "7.5rem", height: "1rem" }} />
            <span className="skel-line" style={{ width: "4.5rem", height: "0.8rem" }} />
          </div>
        )}
        <div className="pj-skel-tr pj-skel-totals" style={template}>
          <span className="skel-line pj-skel-addr" style={{ width: "5ch" }} />
          {Array.from({ length: cols }, (_, j) => (
            <span key={j} className="skel-line" style={{ width: `${5 + (j % 2) * 2}ch` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

const SKEL_STATS: Array<[number, number]> = [[15, 24], [18, 27], [15, 24], [13, 26]]
const SKEL_SUMMARY_LABELS = [5, 7, 5, 8, 4, 10, 5, 7, 5, 8, 4, 8, 10]

function BoardSkeleton() {
  return (
    <div className="pj-stack">
      <div className="pj-stat-strip">
        {SKEL_STATS.map(([titleCh, captionCh], i) => (
          <div key={i} className="stat-widget card">
            <div className="stat-widget-head">
              <span className="stat-widget-title subheadline"><SkelText ch={titleCh} /></span>
            </div>
            <div className="stat-widget-skeleton" />
            <span className="pj-stat-caption"><SkelText ch={captionCh} /></span>
          </div>
        ))}
      </div>
      <SkelTableCard card="pj-grid" titleCh={13} subtitleCh={42} rows={8} cols={7} footer />
      <SkelTableCard card="pj-grid pj-pipeline" titleCh={8} subtitleCh={40} rows={3} cols={5} footer />
      <div className="pj-summary card">
        <div className="pj-summary-head">
          <div className="pj-summary-title-group">
            <h2 className="widget-title headline"><SkelText ch={15} /></h2>
            <span className="widget-description"><SkelText ch={44} /></span>
          </div>
          <span className="skel-line" style={{ width: "11.5rem", height: "1.9rem", borderRadius: 999 }} />
        </div>
        <div className="pj-skel-table">
          <div className="pj-skel-tr pj-skel-th" style={{ gridTemplateColumns: "8rem repeat(13, 1fr)" }}>
            <span className="skel-line pj-skel-addr" style={{ width: "0ch" }} />
            {Array.from({ length: 13 }, (_, j) => (
              <span key={j} className="skel-line" style={{ width: "3.5ch" }} />
            ))}
          </div>
          {SKEL_SUMMARY_LABELS.map((labelCh, i) => (
            <div key={i} className="pj-skel-tr" style={{ gridTemplateColumns: "8rem repeat(13, 1fr)" }}>
              <span className="skel-line pj-skel-addr" style={{ width: `${labelCh}ch` }} />
              {Array.from({ length: 13 }, (_, j) => (
                <span key={j} className="skel-line" style={{ width: `${4 + ((i + j) % 2)}ch` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ProjectionsPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { user } = useAuth()
  const board = useProjectionBoard(year)
  const sageActuals = useSageActuals(year)
  const { sheet } = board
  const collab = useProjectionCollab(year, sheet?.revision ?? null, {
    onSheet: board.adoptRemoteSheet,
    onStale: board.resync,
  })

  // Cmd+Z / Cmd+Shift+Z (Ctrl / Ctrl+Y on Windows) over the user's own edits.
  // A replayed edit rides the normal pending→flush→commit pipeline, so it hits
  // the audit log and broadcasts to collab peers like any hand-typed change.
  const [historyToast, setHistoryToast] = useState<HistoryToastState | null>(null)
  const toastSeq = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { undo, redo } = board
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== "z" && key !== "y") return
      const active = document.activeElement as HTMLElement | null
      const isBoardCell =
        active?.classList.contains("pj-cell-input") === true ||
        active?.classList.contains("pj-overhead-input") === true
      // Other text fields (the drawer's version label, search boxes) keep the
      // browser's native text undo.
      const isOtherField =
        !isBoardCell &&
        (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA" || active?.isContentEditable === true)
      if (isOtherField) return
      e.preventDefault()
      // A half-typed draft commits on blur first, becoming its own undo step —
      // so Cmd+Z mid-edit reads as "discard what I was just typing".
      if (isBoardCell) active?.blur()
      const dir: HistoryToastState["dir"] = key === "y" || e.shiftKey ? "redo" : "undo"
      // flushSync so the replayed value is rendered before the cell is
      // focused: the anchor's onFocus hands the editor the value it shows.
      // Boxed: TS narrows a plain `let` to null across the flushSync callback.
      const box: { result: ReturnType<typeof undo> } = { result: null }
      flushSync(() => {
        box.result = dir === "redo" ? redo() : undo()
      })
      if (!box.result) return
      const { label, cell } = box.result
      // The cell the step changed becomes the active cell (opens the editor
      // chip on it, scrolling it into view) unless it already is.
      if (cell) {
        const anchor = document.querySelector<HTMLInputElement>(
          `input.pj-cell-input[data-rowid="${CSS.escape(cell.rowId)}"][data-col="${CSS.escape(cell.field)}"]:not(.pj-cell-editor)`
        )
        if (anchor && document.activeElement !== anchor) anchor.focus({ preventScroll: true })
      }
      setHistoryToast({ id: ++toastSeq.current, dir, label })
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setHistoryToast(null), 2600)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [undo, redo])

  const yearOptions = useMemo(() => {
    const set = new Set([...board.years, currentYear, currentYear + 1, year])
    return [...set].sort((a, b) => b - a)
  }, [board.years, currentYear, year])

  return (
    <CollabContext.Provider value={collab}>
    <CellFormatProvider sheet={sheet} onEdit={board.applyEdit} onEdits={board.applyEdits}>
    <Page
      title="Projections"
      subtitle="Master unit projection board"
      actions={
        <div className="pj-header-actions">
          <PresenceRoster peers={collab.peers} selfUid={user?.uid} />
          <SaveIndicator state={board.saveState} />
          <select
            className="year-selector"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Projection year"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            className="pj-history-btn"
            disabled={!sheet}
            title="Download the board as an Excel workbook"
            onClick={() => {
              if (!sheet) return
              exportProjectionWorkbook(
                {
                  year,
                  overheadMonthly: sheet.overheadMonthly,
                  rows: sheet.rows,
                  pipeline: sheet.pipeline,
                  actuals: sheet.actuals,
                  bookedActuals: sageActuals,
                },
                `Projection_Board_${year}_${new Date().toISOString().slice(0, 10)}`
              )
            }}
          >
            <Download size={14} />
            Export
          </button>
          <button className="pj-history-btn" onClick={() => setDrawerOpen(true)}>
            <History size={14} />
            History
          </button>
        </div>
      }
    >
      {board.conflict && (
        <div className="pj-notice-toast pj-notice-conflict callout" role="status">
          <span className="pj-notice-text">Someone else saved changes. The board reloaded with the latest version.</span>
          <button className="pj-notice-btn" onClick={board.dismissConflict}>Dismiss</button>
        </div>
      )}
      {board.error && !board.loading && (
        <div className="pj-notice-toast pj-notice-error callout" role="alert">
          <AlertCircle size={14} />
          <span className="pj-notice-text">
            {board.error}
            {board.pendingCount > 0 && (
              <span className="pj-notice-sub">
                {board.pendingCount} unsaved edit{board.pendingCount === 1 ? "" : "s"} kept, not lost
              </span>
            )}
          </span>
          <button className="pj-notice-btn pj-notice-btn-primary" onClick={board.retry}>Retry</button>
          <button className="pj-notice-btn" onClick={board.dismissError} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      {board.loading || !sheet ? (
        <BoardSkeleton />
      ) : (
        // No MotionList entrance here (the app-wide page-load standard): the
        // skeleton mirrors this layout card-for-card, so the loaded board
        // swaps into it in place — a fade-in would read as skeleton fading
        // out and content fading back in, which the user rejected.
        <div className="pj-stack">
          <div className="pj-stat-strip">
            <StatWidget
              title="Projected Units"
              value={sheet.summary.totalUnits}
              format="number"
              caption={<span className="pj-stat-caption">{sheet.rows.length} projects · {sheet.summary.scheduledUnits} scheduled</span>}
            />
            <StatWidget
              title="Projected Contract"
              value={sheet.summary.totalValue}
              format="money"
              caption={<span className="pj-stat-caption">{formatMoneyFull(sheet.summary.totalGrossRevenue)} win-adjusted</span>}
            />
            <StatWidget
              title="Projected Gross"
              value={sheet.summary.totalGrossProfit}
              format="money"
              caption={<span className="pj-stat-caption">bid at {formatRatioPercent(sheet.summary.blendedMargin)} margin</span>}
            />
            <StatWidget
              title="Projected Net"
              value={sheet.summary.scheduledNet}
              format="money"
              caption={<span className="pj-stat-caption">after {formatMoneyFull(sheet.overheadMonthly)}/mo overhead</span>}
            />
          </div>
          <ProjectionDnd onAward={(id) => board.awardRow(id, "drag")}>
          <ProjectionGrid
              rows={sheet.rows}
              summary={sheet.summary}
              lastAddedRowId={board.lastAddedRowId}
              landed={board.landed}
              onEdit={board.applyEdit}
              onAddRow={board.addRow}
              onDeleteRow={board.deleteRow}
              onReorder={(order, moved) => board.reorderRows("rows", order, moved)}
            />
          <PipelineTable
              rows={sheet.pipeline}
              summary={sheet.summary.pipeline}
              lastAddedRowId={board.lastAddedRowId}
              onEdit={board.applyEdit}
              onAddRow={board.addPipelineRow}
              onDeleteRow={board.deleteRow}
              onReorder={(order, moved) => board.reorderRows("pipeline", order, moved)}
              onAward={(id) => board.awardRow(id, "button")}
            />
          </ProjectionDnd>
          <MonthlySummary summary={sheet.summary} sage={sageActuals} onEdit={board.applyEdit} />
        </div>
      )}

      <HistoryToast toast={historyToast} />

      <BoardHistoryDrawer
        open={drawerOpen}
        year={year}
        refreshKey={sheet?.revision ?? 0}
        bookedActuals={sageActuals}
        onClose={() => setDrawerOpen(false)}
        onRestore={board.restoreSnapshot}
      />
    </Page>
    </CellFormatProvider>
    </CollabContext.Provider>
  )
}
