import { useMemo, useState } from "react"
import { History, Check, CloudUpload } from "lucide-react"
import Page from "../../shared/components/Page"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { formatMoneyFull, formatRatioPercent, shortMonth } from "../../shared/utils/format"
import { useProjectionBoard, type SaveState } from "./useProjectionBoard"
import { ProjectionGrid } from "./ProjectionGrid"
import { BoardHistoryDrawer } from "./BoardHistoryDrawer"
import type { ProjectionSummary } from "./types"

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

function money0(v: number): string {
  return formatMoneyFull(Math.round(v))
}

/** The sheet's summary zone: monthly Units / Revenue / COGS / Overhead / Net /
 *  Cumulative. Overhead is the one editable figure here (a flat $/month). */
function MonthlySummary({
  summary,
  onOverheadChange,
}: {
  summary: ProjectionSummary
  onOverheadChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const commitOverhead = () => {
    if (draft == null) return
    const n = Number(draft.replace(/[$,\s,]/g, ""))
    setDraft(null)
    if (Number.isFinite(n) && n >= 0 && n !== summary.overheadMonthly) onOverheadChange(n)
  }

  const rows: Array<{ label: string; cells: number[]; kind: "int" | "money"; className?: string }> = [
    { label: "Units", cells: summary.unitsByMonth, kind: "int" },
    { label: "Revenue", cells: summary.revenueByMonth, kind: "money" },
    { label: "COGS", cells: summary.cogsByMonth, kind: "money" },
    { label: "Net", cells: summary.netByMonth, kind: "money", className: "pj-summary-net" },
    { label: "Cumulative", cells: summary.cumulativeNet, kind: "money", className: "pj-summary-cumulative" },
  ]

  return (
    <div className="pj-summary card">
      <div className="pj-summary-head">
        <h2 className="headline">Monthly Summary</h2>
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
      <div className="pj-summary-scroll">
        <table className="pj-summary-table">
          <thead>
            <tr>
              <th className="pj-sticky" />
              {Array.from({ length: 12 }, (_, m) => (
                <th key={m} className="pj-num">{shortMonth(m + 1)}</th>
              ))}
              <th className="pj-num pj-summary-total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className={row.className}>
                <td className="pj-sticky pj-summary-label">{row.label}</td>
                {row.cells.map((v, m) => (
                  <td key={m} className={`pj-num${v < 0 ? " pj-negative" : ""}`}>
                    {row.kind === "int" ? (v === 0 ? "–" : v) : money0(v)}
                  </td>
                ))}
                <td className={`pj-num pj-summary-total-col${(row.label === "Net" ? summary.scheduledNet : 0) < 0 ? " pj-negative" : ""}`}>
                  {row.label === "Units"
                    ? summary.scheduledUnits
                    : row.label === "Revenue"
                      ? money0(summary.scheduledRevenue)
                      : row.label === "COGS"
                        ? money0(summary.cogsByMonth.reduce((s, c) => s + c, 0))
                        : row.label === "Net"
                          ? money0(summary.scheduledNet)
                          : money0(summary.cumulativeNet[11] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="pj-stack">
      <div className="pj-stat-strip">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="stat-widget card">
            <div className="stat-widget-head">
              <span className="stat-widget-title subheadline">&nbsp;</span>
            </div>
            <div className="stat-widget-skeleton" />
          </div>
        ))}
      </div>
      <div className="pj-grid card">
        <div className="pj-skeleton-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skel-line pj-skeleton-row" />
          ))}
        </div>
      </div>
      <div className="pj-summary card">
        <div className="pj-skeleton-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skel-line pj-skeleton-row" />
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
  const board = useProjectionBoard(year)
  const { sheet } = board

  const yearOptions = useMemo(() => {
    const set = new Set([...board.years, currentYear, currentYear + 1, year])
    return [...set].sort((a, b) => b - a)
  }, [board.years, currentYear, year])

  return (
    <Page
      title="Projections"
      subtitle="Master unit projection board"
      actions={
        <div className="pj-header-actions">
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
          <button className="button secondary-button" onClick={() => setDrawerOpen(true)}>
            <History size={14} />
            History
          </button>
        </div>
      }
    >
      {board.conflict && (
        <div className="pj-banner pj-banner-conflict body-text">
          Someone else saved changes — the board reloaded with the latest version.
          <button className="pj-banner-dismiss callout" onClick={board.dismissConflict}>Dismiss</button>
        </div>
      )}
      {board.error && !board.loading && (
        <div className="pj-banner pj-banner-error body-text">
          {board.error}
          <button className="pj-banner-dismiss callout" onClick={board.reload}>Retry</button>
        </div>
      )}

      {board.loading || !sheet ? (
        <BoardSkeleton />
      ) : (
        <MotionList className="pj-stack">
          <MotionItem className="pj-stat-strip">
            <StatWidget title="Projected Units" value={sheet.summary.totalUnits} format="number" />
            <StatWidget title="Total Value" value={sheet.summary.totalValue} format="money" />
            <StatWidget
              title="Gross Profit"
              value={sheet.summary.totalGrossProfit}
              format="money"
              caption={`${formatRatioPercent(sheet.summary.blendedMargin)} blended margin`}
            />
            <StatWidget
              title="Projected Net"
              value={sheet.summary.scheduledNet}
              format="money"
              caption={`after ${formatMoneyFull(sheet.overheadMonthly)}/mo overhead`}
            />
          </MotionItem>
          <MotionItem>
            <ProjectionGrid
              rows={sheet.rows}
              summary={sheet.summary}
              onEdit={board.applyEdit}
              onAddRow={board.addRow}
              onDeleteRow={board.deleteRow}
            />
          </MotionItem>
          <MotionItem>
            <MonthlySummary
              summary={sheet.summary}
              onOverheadChange={(value) => board.applyEdit({ rowId: null, field: "overheadMonthly", value })}
            />
          </MotionItem>
        </MotionList>
      )}

      <BoardHistoryDrawer
        open={drawerOpen}
        year={year}
        refreshKey={sheet?.revision ?? 0}
        onClose={() => setDrawerOpen(false)}
        onRestore={board.restoreSnapshot}
      />
    </Page>
  )
}
