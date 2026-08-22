import { useRef, useState, type KeyboardEvent } from "react"
import { Trash2, Plus } from "lucide-react"
import { ConfirmModal } from "../../shared/components/ConfirmModal/ConfirmModal"
import { formatMoneyFull, shortMonth } from "../../shared/utils/format"
import { computeRow } from "./calc"
import type { CellEdit, ProjectionRow, ProjectionSummary } from "./types"

type CellKind = "text" | "int" | "money" | "pct"

interface EditableCol {
  key: string
  label: string
  kind: CellKind
}

// Column order mirrors the source sheet: identity → economics → monthly schedule.
const IDENTITY_COLS: EditableCol[] = [
  { key: "address", label: "Address", kind: "text" },
  { key: "client", label: "Client", kind: "text" },
  { key: "name", label: "Name", kind: "text" },
]
const ECON_COLS: EditableCol[] = [
  { key: "units", label: "Units", kind: "int" },
  { key: "avgUnitPrice", label: "Avg Unit Price", kind: "money" },
  { key: "pctWin", label: "% Win", kind: "pct" },
  { key: "grossMargin", label: "Margin", kind: "pct" },
]
const MONTH_COLS: EditableCol[] = Array.from({ length: 12 }, (_, m) => ({
  key: `month:${m}`,
  label: shortMonth(m + 1),
  kind: "int",
}))

const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`
const fmtInt = (v: number) => (v === 0 ? "–" : String(v))

function display(kind: CellKind, value: string | number): string {
  if (kind === "text") return String(value)
  const n = Number(value)
  if (kind === "money") return n === 0 ? "" : formatMoneyFull(n)
  if (kind === "pct") return fmtPct(n)
  return n === 0 ? "" : String(n)
}

/** Raw string shown while a cell is focused (pct edits as "22", not "0.22"). */
function rawValue(kind: CellKind, value: string | number): string {
  if (kind === "text") return String(value)
  const n = Number(value)
  if (kind === "pct") return String(Math.round(n * 1000) / 10)
  return n === 0 ? "" : String(n)
}

function parseRaw(kind: CellKind, raw: string): string | number {
  if (kind === "text") return raw.trim()
  const cleaned = raw.replace(/[$,%\s,]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return 0
  if (kind === "pct") return Math.min(Math.max(n / 100, 0), 1)
  if (kind === "int") return Math.max(Math.round(n), 0)
  return Math.max(n, 0)
}

interface CellProps {
  row: ProjectionRow
  col: EditableCol
  value: string | number
  rowIndex: number
  onCommit: (edit: CellEdit) => void
}

/** One editable cell: formatted at rest, raw while focused, commit on blur. */
function EditableCell({ row, col, value, rowIndex, onCommit }: CellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  const commit = () => {
    setEditing(false)
    const parsed = parseRaw(col.kind, draft)
    if (parsed !== value) onCommit({ rowId: row.rowId, field: col.key, value: parsed })
  }

  return (
    <input
      className={`pj-cell-input pj-kind-${col.kind}`}
      data-row={rowIndex}
      data-col={col.key}
      value={editing ? draft : display(col.kind, value)}
      onFocus={(e) => {
        setDraft(rawValue(col.kind, value))
        setEditing(true)
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          // Revert: restore the at-rest raw value so the blur commit is a no-op.
          setDraft(rawValue(col.kind, value))
          e.currentTarget.blur()
        }
      }}
      spellCheck={false}
    />
  )
}

interface ProjectionGridProps {
  rows: ProjectionRow[]
  summary: ProjectionSummary
  onEdit: (edit: CellEdit) => void
  onAddRow: () => void
  onDeleteRow: (rowId: string) => Promise<void> | void
}

export function ProjectionGrid({ rows, summary, onEdit, onAddRow, onDeleteRow }: ProjectionGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState<ProjectionRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Excel-style vertical travel: Enter or ↑/↓ moves within the column. Tab is
  // native; Escape (handled in the cell) reverts the draft before blurring.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLInputElement
    if (!target.dataset.col) return
    let delta = 0
    if (e.key === "Enter" || e.key === "ArrowDown") delta = 1
    else if (e.key === "ArrowUp") delta = -1
    else return
    e.preventDefault()
    const nextRow = Number(target.dataset.row) + delta
    const next = scrollRef.current?.querySelector<HTMLInputElement>(
      `[data-row="${nextRow}"][data-col="${CSS.escape(target.dataset.col)}"]`
    )
    if (next) next.focus()
    else target.blur()
  }

  return (
    <div className="pj-grid card">
      <div className="pj-grid-scroll" ref={scrollRef} onKeyDown={onKeyDown}>
        <table className="pj-table">
          <thead>
            <tr className="pj-group-row">
              <th className="pj-sticky" colSpan={IDENTITY_COLS.length}>Project</th>
              <th colSpan={8}>Economics</th>
              <th colSpan={14}>Schedule · units per month</th>
              <th className="pj-gutter" />
            </tr>
            <tr>
              {IDENTITY_COLS.map((c, i) => (
                <th key={c.key} className={i === 0 ? "pj-sticky" : undefined}>{c.label}</th>
              ))}
              <th className="pj-num">Units</th>
              <th className="pj-num">Avg Unit Price</th>
              <th className="pj-num pj-computed-th">Total</th>
              <th className="pj-num">% Win</th>
              <th className="pj-num">Margin</th>
              <th className="pj-num pj-computed-th">COGS</th>
              <th className="pj-num pj-computed-th">Gross Rev</th>
              <th className="pj-num pj-computed-th">Gross Profit</th>
              {MONTH_COLS.map((c) => (
                <th key={c.key} className="pj-num pj-month-th">{c.label}</th>
              ))}
              <th className="pj-num pj-computed-th">Sched</th>
              <th className="pj-num pj-computed-th">Left</th>
              <th className="pj-gutter" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const c = computeRow(row)
              return (
                <tr key={row.rowId}>
                  {IDENTITY_COLS.map((col, i) => (
                    <td key={col.key} className={i === 0 ? "pj-sticky" : undefined}>
                      <EditableCell row={row} col={col} value={row[col.key as "address"]} rowIndex={ri} onCommit={onEdit} />
                    </td>
                  ))}
                  <td className="pj-num"><EditableCell row={row} col={ECON_COLS[0]} value={row.units} rowIndex={ri} onCommit={onEdit} /></td>
                  <td className="pj-num"><EditableCell row={row} col={ECON_COLS[1]} value={row.avgUnitPrice} rowIndex={ri} onCommit={onEdit} /></td>
                  <td className="pj-num pj-computed">{c.total ? formatMoneyFull(c.total) : ""}</td>
                  <td className="pj-num"><EditableCell row={row} col={ECON_COLS[2]} value={row.pctWin} rowIndex={ri} onCommit={onEdit} /></td>
                  <td className="pj-num"><EditableCell row={row} col={ECON_COLS[3]} value={row.grossMargin} rowIndex={ri} onCommit={onEdit} /></td>
                  <td className="pj-num pj-computed">{fmtPct(c.cogs)}</td>
                  <td className="pj-num pj-computed">{c.grossRevenue ? formatMoneyFull(c.grossRevenue) : ""}</td>
                  <td className="pj-num pj-computed">{c.grossProfit ? formatMoneyFull(c.grossProfit) : ""}</td>
                  {MONTH_COLS.map((col, m) => (
                    <td key={col.key} className="pj-num pj-month">
                      <EditableCell row={row} col={col} value={row.months[m] ?? 0} rowIndex={ri} onCommit={onEdit} />
                    </td>
                  ))}
                  <td className="pj-num pj-computed">{fmtInt(c.unitsScheduled)}</td>
                  <td className={`pj-num pj-computed${c.unitsRemaining < 0 ? " pj-negative" : ""}`}>
                    {fmtInt(c.unitsRemaining)}
                  </td>
                  <td className="pj-gutter">
                    <button
                      className="pj-row-delete"
                      aria-label={`Delete row ${row.name || row.address || ri + 1}`}
                      onClick={() => setConfirmDelete(row)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="pj-totals-row">
              <td className="pj-sticky">Totals</td>
              <td colSpan={2} />
              <td className="pj-num">{summary.totalUnits}</td>
              <td />
              <td className="pj-num">{formatMoneyFull(summary.totalValue)}</td>
              <td colSpan={3} />
              <td className="pj-num">{formatMoneyFull(summary.totalGrossRevenue)}</td>
              <td className="pj-num">{formatMoneyFull(summary.totalGrossProfit)}</td>
              {summary.unitsByMonth.map((u, m) => (
                <td key={m} className="pj-num">{fmtInt(u)}</td>
              ))}
              <td className="pj-num">{fmtInt(summary.scheduledUnits)}</td>
              <td className="pj-num">{fmtInt(summary.totalUnits - summary.scheduledUnits)}</td>
              <td className="pj-gutter" />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="pj-grid-footer">
        <button className="pj-add-row" onClick={onAddRow}>
          <Plus size={14} />
          Add project
        </button>
        <span className="pj-row-count callout text-secondary">
          {rows.length} project{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <ConfirmModal
        open={confirmDelete != null}
        title="Delete project row"
        message={
          confirmDelete
            ? `Remove "${confirmDelete.name || confirmDelete.address || "this row"}" from the projection? The change is recorded in history and recoverable from a version.`
            : undefined
        }
        confirmLabel="Delete row"
        danger
        loading={deleting}
        onConfirm={async () => {
          if (!confirmDelete) return
          setDeleting(true)
          try {
            await onDeleteRow(confirmDelete.rowId)
          } finally {
            setDeleting(false)
            setConfirmDelete(null)
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
