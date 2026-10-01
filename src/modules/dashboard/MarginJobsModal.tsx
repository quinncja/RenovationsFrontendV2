import { useId, useState } from "react"
import { SegmentedControl } from "../../shared/components/SegmentedControl"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronRight } from "lucide-react"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { useCloseOnRouteChange } from "../../shared/hooks/useCloseOnRouteChange"
import { formatMoneyFull, formatPercent, marginTextColor } from "../../shared/utils/format"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import { useJobcostNav } from "../jobcost/useJobcostNav"
import { totalsOf, withMargin, type MarginJob } from "./marginReport"

type SortKey = "name" | "client" | "pm" | "kind" | "status" | "revenue" | "wip" | "cost" | "grossProfit" | "margin"

/**
 * The jobs behind one Margin Report figure (a kind card, a margin band, a
 * client or property row, a month). Same shell + sortable table as the
 * overdue AR/AP invoice modal; a row opens the job's cost detail page.
 */
export function MarginJobsModal({
  open,
  title,
  subtitle,
  jobs,
  showPm,
  hideKind,
  projectBasis = false,
  selectedYearJobs,
  fullJobJobs,
  link,
  onClose,
}: {
  open: boolean
  title: string
  subtitle?: string
  jobs: MarginJob[]
  /** Company-wide views name the PM; a manager's own-jobs view doesn't need to. */
  showPm: boolean
  /** Hide the Type column when every listed job is the same kind. */
  hideKind?: boolean
  projectBasis?: boolean
  selectedYearJobs?: MarginJob[]
  fullJobJobs?: MarginJob[]
  /** Optional secondary destination for the group behind the list (client /
   *  property page), rendered as a header link. */
  link?: { label: string; onClick: () => void }
  onClose: () => void
}) {
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(open)
  useCloseOnRouteChange(open, onClose)

  const [view, setView] = useState<"year" | "full">(projectBasis ? "full" : "year")
  const toggleId = useId()
  const canSwitch = selectedYearJobs != null && fullJobJobs != null
  const showingFullJob = canSwitch ? view === "full" : projectBasis
  const visibleJobs = canSwitch ? (view === "full" ? fullJobJobs : selectedYearJobs) : jobs
  const totals = totalsOf(visibleJobs)

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={`modal-overlay${isTopLayer ? " modal-overlay--blur" : ""}`}
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              className="modal reports-modal mgr-jobs-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <div className="reports-modal-title">
                  <div>
                    <h2 className="title2 emphasized">{title}</h2>
                    <span className="reports-modal-subtitle">
                      {subtitle ? `${subtitle} · ` : ""}
                      {visibleJobs.length} job{visibleJobs.length === 1 ? "" : "s"} · {formatMoneyFull(totals.revenue)} {showingFullJob ? "contract" : "revenue + work completed"} ·{" "}
                      {totals.margin != null ? formatPercent(totals.margin) : "—"} margin
                    </span>
                  </div>
                </div>
                <div className="mgr-modal-actions">
                  {canSwitch && <SegmentedControl
                    variant="ohr"
                    value={view}
                    options={[{ key: "year", label: "Selected Year" }, { key: "full", label: "Full Job" }]}
                    onChange={setView}
                    layoutId={`marginModalBasis-${toggleId}`}
                    ariaLabel="Financial basis"
                  />}

                  {link && (
                    <button className="widget-link-btn" onClick={link.onClick}>
                      {link.label} <ChevronRight size={12} />
                    </button>
                  )}
                  <button className="button modal-close" onClick={onClose}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="reports-modal-body">
                {visibleJobs.length === 0 ? (
                  <p className="reports-modal-empty body-text text-secondary">No jobs available for this view.</p>
                ) : (
                  <div className="mgr-basis-scroll">
                    <MarginJobsTable key={showingFullJob ? "full" : "year"} jobs={visibleJobs} showPm={showPm} hideKind={hideKind} projectBasis={showingFullJob} />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

/** Sortable job table shared by the modal and the Monthly Margin rows. */
export function MarginJobsTable({
  jobs,
  showPm,
  hideKind = false,
  projectBasis = false,
  defaultSort = "grossProfit",
  residual,
}: {
  jobs: MarginJob[]
  showPm: boolean
  hideKind?: boolean
  projectBasis?: boolean
  defaultSort?: SortKey
  /** Book revenue/cost not attributable to any listed job; rendered as a
   *  final quiet line and folded into the footer total. */
  residual?: { revenue: number; cost: number }
}) {
  const sort = useTableSort<SortKey>(defaultSort, "desc")
  const marginColorsOn = useMarginColorsEnabled()
  const { goToJobcost } = useJobcostNav()
  const openJob = (recnum: string) => goToJobcost(recnum, { backLabel: "Margin Report" })
  const marginStyle = (m: number | null) =>
    m != null && marginColorsOn ? { color: marginTextColor(m) } : undefined
  const attributed = totalsOf(jobs)
  const hasResidual = residual != null && (Math.abs(residual.revenue) >= 1 || Math.abs(residual.cost) >= 1)
  const totals = hasResidual
    ? withMargin({ ...attributed, revenue: attributed.revenue + residual.revenue, cost: attributed.cost + residual.cost })
    : attributed
  // The WIP column only earns its place when something is folded in.
  const showWip = jobs.some((j) => j.wip !== 0)
  const sorted = applySort(jobs, sort, (j, key) =>
    key === "name"
      ? j.name
      : key === "client"
        ? j.clientName
        : key === "pm"
          ? j.pmName ?? ""
          : key === "kind"
            ? j.kind
            : key === "status"
              ? (j.closed ? 1 : 0)
              : key === "revenue"
                ? j.revenue
                : key === "wip"
                  ? j.wip
                : key === "cost"
                  ? j.cost
                  : key === "grossProfit"
                    ? j.grossProfit
                    : j.margin ?? -Infinity
  )

  return (
    <table className="data-table billings-invoice-table mgr-jobs-table">
      <thead>
        <tr>
          <SortableHeader label="Job" columnKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Client" columnKey="client" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          {showPm && <SortableHeader label="PM" columnKey="pm" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />}
          {!hideKind && <SortableHeader label="Type" columnKey="kind" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />}
          <SortableHeader label="Status" columnKey="status" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label={projectBasis ? "Contract" : "Revenue + Work Completed"} columnKey="revenue" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
          {showWip && <SortableHeader label="WIP" columnKey="wip" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />}
          <SortableHeader label={projectBasis ? "Committed + Spent" : "Posted Cost"} columnKey="cost" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
          <SortableHeader label="Gross Profit" columnKey="grossProfit" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
          <SortableHeader label="Margin" columnKey="margin" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((j) => (
          <tr
            key={j.recnum}
            className="clickable-row"
            onClick={() => openJob(j.recnum)}
            title="View job cost detail"
            tabIndex={0}
            role="button"
            onKeyDown={(e) => e.key === "Enter" && openJob(j.recnum)}
          >
            <td>
              <span className="mgr-job-name">{j.name}</span>
              <span className="mgr-job-recnum text-secondary">{j.recnum}</span>
            </td>
            <td className="text-secondary">{j.clientName}</td>
            {showPm && <td className="text-secondary">{j.pmName ?? "—"}</td>}
            {!hideKind && <td className="text-secondary">{j.kind === "phase" ? "Phase" : "One-off"}</td>}
            <td className="text-secondary">{j.closed ? "Closed" : "Current"}</td>
            <td className="num" title={j.wip !== 0 ? `${formatMoneyFull(j.revenue - j.wip)} billed + ${formatMoneyFull(j.wip)} WIP` : undefined}>
              {formatMoneyFull(j.revenue)}
            </td>
            {showWip && <td className="num text-secondary">{formatMoneyFull(j.wip)}</td>}
            <td className="num text-secondary">{formatMoneyFull(j.cost)}</td>
            <td className="num">{formatMoneyFull(j.grossProfit)}</td>
            <td className="num" style={marginStyle(j.margin)}>
              {j.margin != null ? formatPercent(j.margin) : "—"}
            </td>
          </tr>
        ))}
        {hasResidual && residual && (
          <tr className="mgr-residual-row">
            <td colSpan={(showPm ? 5 : 4) - (hideKind ? 1 : 0)}>
              <span className="mgr-job-name text-secondary">Not on a job</span>
              <span className="mgr-job-recnum text-secondary">Postings with no linked invoice or cost record, incl. WIP</span>
            </td>
            <td className="num text-secondary">{formatMoneyFull(residual.revenue)}</td>
            {showWip && <td className="num text-secondary">—</td>}
            <td className="num text-secondary">{formatMoneyFull(residual.cost)}</td>
            <td className="num text-secondary">{formatMoneyFull(residual.revenue - residual.cost)}</td>
            <td className="num text-secondary">—</td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={(showPm ? 5 : 4) - (hideKind ? 1 : 0)}>Total</td>
          <td className="num">{formatMoneyFull(totals.revenue)}</td>
          {showWip && <td className="num">{formatMoneyFull(totals.wip)}</td>}
          <td className="num">{formatMoneyFull(totals.cost)}</td>
          <td className="num">{formatMoneyFull(totals.grossProfit)}</td>
          <td className="num" style={marginStyle(totals.margin)}>
            {totals.margin != null ? formatPercent(totals.margin) : "—"}
          </td>
        </tr>
      </tfoot>
    </table>
  )
}
