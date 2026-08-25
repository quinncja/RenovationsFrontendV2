import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Trash2, Maximize2, Minimize2, ArrowUpFromLine } from "lucide-react"
import { ConfirmModal } from "../../shared/components/ConfirmModal/ConfirmModal"
import { SortTh } from "../../shared/components/SortTh"
import { formatMoneyFull } from "../../shared/utils/format"
import { computeRow } from "./calc"
import { useOverlayScroll, useCardFullscreen } from "./useOverlayScroll"
import { CellFormatBar } from "./CellFormat"
import { ActiveCellEditor } from "./ActiveCellEditor"
import { EditableCell, ComputedCell, IDENTITY_COLS, ECON_COLS, AddProjectRow, PIPELINE_ADD_SLOTS, useDraftRow, type RenderCells } from "./ProjectionGrid"
import { RowDragTable, RowGrip, SortableRow } from "./RowDrag"
import { orderRows, pinAddrClick, pinHeaderClick, useProjectionSort } from "./rowOrder"
import type { CellEdit, PipelineSummary, ProjectionRow } from "./types"

interface PipelineTableProps {
  rows: ProjectionRow[]
  summary: PipelineSummary
  lastAddedRowId?: string | null
  onEdit: (edit: CellEdit) => void
  onAddRow: (rowId: string, initial: CellEdit[]) => void
  onDeleteRow: (rowId: string) => Promise<void> | void
  onReorder: (order: string[], movedRowId: string) => void
  /** Award: the row leaves the pipeline for the projection grid. */
  onAward: (rowId: string) => void
}

/** How long the awarded row's send-off plays before it actually leaves the
 *  table (CSS: pj-row-leaving). */
const LEAVE_MS = 220

/**
 * The sheet's Pipeline section: bidding / pre-award projects. Same row shape
 * as the projection grid but no monthly schedule — these never touch the P&L
 * until they're re-entered in the main table on award.
 */
export function PipelineTable({ rows, summary, lastAddedRowId, onEdit, onAddRow, onDeleteRow, onReorder, onAward }: PipelineTableProps) {
  const { sortKey, sortDir, onSort, clearSort, sorted } = useProjectionSort("pipeline")
  const ordered = useMemo(() => orderRows(rows, sortKey, sortDir), [rows, sortKey, sortDir])
  const { scrollRef, frameRef, frameClass, scopeClass, onScroll, affordances } = useOverlayScroll(rows.length, `${sortKey}|${sortDir}`)
  const [confirmDelete, setConfirmDelete] = useState<ProjectionRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { expanded, setExpanded } = useCardFullscreen(confirmDelete != null)

  const draft = useDraftRow({ ordered, scrollRef, onAddRow, onEdit })
  const visible = draft.rows

  // Award from the gutter button: the row lifts and fades out first (the one
  // focal animation), then moves for real and lands in the grid. A dropped
  // drag skips the send-off — the ghost already carried it away.
  const [leavingId, setLeavingId] = useState<string | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current) }, [])
  const awardWithSendOff = (rowId: string) => {
    if (leavingId) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { onAward(rowId); return }
    setLeavingId(rowId)
    leaveTimer.current = setTimeout(() => {
      setLeavingId(null)
      onAward(rowId)
    }, LEAVE_MS)
  }
  const renderGhost = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.rowId === rowId)
      if (!row) return null
      const c = computeRow(row)
      return (
        <>
          <strong>{row.name || row.address || "Pipeline project"}</strong>
          {row.name && row.address && <span className="pj-award-ghost-sub">{row.address}</span>}
          {c.total > 0 && <span className="pj-award-ghost-sub">{formatMoneyFull(c.total)}</span>}
        </>
      )
    },
    [rows]
  )
  const rowIds = useMemo(() => ordered.map((r) => r.rowId), [ordered])
  // A drop under a column sort adopts the displayed order (with the row
  // where it landed) as the sheet order, then clears the sort so it shows.
  const reorderAndUnsort = useCallback(
    (order: string[], movedRowId: string) => {
      onReorder(order, movedRowId)
      if (sorted) clearSort()
    },
    [onReorder, sorted, clearSort]
  )

  // Focus a row re-added from elsewhere (undo/redo; the grid's version of
  // this effect ignores rows that aren't in its own table, and vice versa).
  useEffect(() => {
    if (!lastAddedRowId) return
    if ((document.activeElement as HTMLElement | null)?.dataset.col) return
    scrollRef.current
      ?.querySelector<HTMLInputElement>(`tr[data-rowid="${CSS.escape(lastAddedRowId)}"] input[data-col="address"]`)
      ?.focus()
  }, [lastAddedRowId, scrollRef])

  const renderCells: RenderCells = (row, ri, commit, grip) => {
    const c = computeRow(row)
    return (
      <>
        {IDENTITY_COLS.map((col, i) => (
          <td key={col.key} className={i === 0 ? "pj-sticky" : undefined}>
            {i === 0 && grip && <RowGrip label={row.name || row.address || `row ${ri + 1}`} />}
            <EditableCell row={row} col={col} value={row[col.key as "address"]} rowIndex={ri} onCommit={commit} />
          </td>
        ))}
        <td className="pj-num pj-zone-start"><EditableCell row={row} col={ECON_COLS[0]} value={row.units} rowIndex={ri} onCommit={commit} /></td>
        <td className="pj-num"><EditableCell row={row} col={ECON_COLS[1]} value={row.avgUnitPrice} rowIndex={ri} onCommit={commit} /></td>
        <ComputedCell row={row} field="total" rowIndex={ri}>{c.total ? formatMoneyFull(c.total) : ""}</ComputedCell>
        <td className="pj-num"><EditableCell row={row} col={ECON_COLS[2]} value={row.pctWin} rowIndex={ri} onCommit={commit} /></td>
        <td className="pj-num"><EditableCell row={row} col={ECON_COLS[3]} value={row.grossMargin} rowIndex={ri} onCommit={commit} /></td>
        <ComputedCell row={row} field="grossRevenue" rowIndex={ri}>{c.grossRevenue ? formatMoneyFull(c.grossRevenue) : ""}</ComputedCell>
        <ComputedCell row={row} field="grossProfit" rowIndex={ri}>{c.grossProfit ? formatMoneyFull(c.grossProfit) : ""}</ComputedCell>
      </>
    )
  }

  return (
    <>
    {expanded && <div className="pj-expand-backdrop" aria-hidden="true" onClick={() => setExpanded(false)} />}
    <div className={`pj-grid pj-pipeline card${expanded ? " pj-grid-expanded" : ""}`}>
      <div className={scopeClass}>
      <div className="pj-summary-head">
        <div className="pj-summary-title-group">
          <h2 className="widget-title headline"><span className="pj-title-text">Pipeline</span></h2>
        </div>
        <div className="pj-head-actions">
          <CellFormatBar />
          <button
            className="pj-expand-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Exit full screen" : "View full screen"}
            title={expanded ? "Exit full screen (Esc)" : "Full screen"}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      <div className="pj-summary-sub">
        <span className="widget-description">
          Bidding and pre-award, not counted in the projection · {rows.length} project{rows.length === 1 ? "" : "s"} · {formatMoneyFull(summary.value)} potential
        </span>
      </div>
      <div className={frameClass} ref={frameRef}>
        {/* Pinned compact header — see ProjectionGrid's strip; the clone in
            .pj-pin-track is mounted and width-synced by useOverlayScroll. */}
        <div className="pj-pin-bound">
        <div className="pj-pin-rule" aria-hidden="true" />
        <div className="pj-pin-space" aria-hidden="true" />
          <div className="pj-pin-strip">
            <div className="pj-pin-tools">
              <div className="pj-pin-pill pj-pin-pill-name">
                <span className="pj-pin-title">Pipeline</span>
                {expanded && (
                  <span className="pj-pin-title pj-pin-title-value">{formatMoneyFull(summary.value)} potential</span>
                )}
              </div>
              <div className="pj-pin-pill-group">
                <div className="pj-pin-pill pj-pin-pill-paint">
                  <CellFormatBar />
                </div>
                <div className="pj-pin-pill pj-pin-pill-expand">
                  <button
                    className="pj-expand-btn"
                    onClick={() => setExpanded((v) => !v)}
                    aria-label={expanded ? "Exit full screen" : "View full screen"}
                    title={expanded ? "Exit full screen (Esc)" : "Full screen"}
                  >
                    {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="pj-pin-inner">
              <div className="pj-pin-track" aria-hidden="true" onClick={(e) => pinHeaderClick(scrollRef.current, e.target)} />
              <div className="pj-pin-addr" aria-hidden="true" onClick={() => pinAddrClick(scrollRef.current)} />
            </div>
          </div>
        </div>
        <div className="pj-grid-scroll pj-pipeline-scroll" ref={scrollRef} onScroll={onScroll}>
          <ActiveCellEditor>
          <RowDragTable section="pipeline" rowIds={rowIds} onReorder={reorderAndUnsort} renderGhost={renderGhost}>
          <table className="pj-table">
            <thead>
              <tr>
                {IDENTITY_COLS.map((c, i) => (
                  <SortTh key={c.key} col={c.key} label={c.label} className={i === 0 ? "pj-sticky" : undefined} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                ))}
                <SortTh col="units" label="Units" align="right" className="pj-num pj-zone-start" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh col="avgUnitPrice" label="Avg Unit Price" align="right" className="pj-num" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh col="total" label="Total" align="right" className="pj-num pj-computed-th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh col="pctWin" label="% Win" align="right" className="pj-num" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh col="grossMargin" label="Margin" align="right" className="pj-num" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh col="grossRevenue" label="Gross Rev" align="right" className="pj-num pj-computed-th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortTh col="grossProfit" label="Gross Profit" align="right" className="pj-num pj-computed-th" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <th className="pj-gutter" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row, ri) => {
                const isDraft = draft.isDraft(row)
                return (
                <SortableRow
                  key={row.rowId}
                  rowId={row.rowId}
                  disabled={isDraft}
                  className={[row.rowId === lastAddedRowId ? "pj-row-new" : "", row.rowId === leavingId ? "pj-row-leaving" : ""].filter(Boolean).join(" ") || undefined}
                >
                  {renderCells(row, ri, isDraft ? draft.commit : onEdit, !isDraft)}
                  <td className="pj-gutter">
                    {!isDraft && <button
                      className="pj-row-award"
                      aria-label={`Award ${row.name || row.address || `pipeline row ${ri + 1}`} — move to Unit Projection`}
                      title="Award · move to Unit Projection"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => awardWithSendOff(row.rowId)}
                    >
                      <ArrowUpFromLine size={15} />
                    </button>}
                    {!isDraft && <button
                      className="pj-row-delete"
                      aria-label={`Delete pipeline row ${row.name || row.address || ri + 1}`}
                      onClick={() => setConfirmDelete(row)}
                    >
                      <Trash2 size={15} />
                    </button>}
                  </td>
                </SortableRow>
                )
              })}
              {!draft.draftOpen && <AddProjectRow label="Add pipeline project" slots={PIPELINE_ADD_SLOTS} onOpen={draft.open} />}
            </tbody>
            <tfoot>
              <tr className="pj-totals-row">
                <td className="pj-sticky">Totals</td>
                <td colSpan={2} />
                <td className="pj-num pj-zone-start">{summary.units}</td>
                <td />
                <td className="pj-num">{formatMoneyFull(summary.value)}</td>
                <td colSpan={2} />
                <td />
                <td className="pj-num">{formatMoneyFull(summary.grossProfit)}</td>
                <td className="pj-gutter" />
              </tr>
            </tfoot>
          </table>
          </RowDragTable>
          </ActiveCellEditor>
        </div>
        {affordances}
      </div>
      </div>
      <ConfirmModal
        open={confirmDelete != null}
        title={`Delete ${confirmDelete?.address || confirmDelete?.name || "this row"}?`}
        message="This row will be removed from the pipeline. You can restore it later from a saved version."
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
    </>
  )
}
