import { useState } from "react"
import { createPortal } from "react-dom"
import { useJobcostNav } from "../../../jobcost/useJobcostNav"
import { X, TriangleAlert, Calculator } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useWidgetData, usePageDisconnected } from "../../../../shared/context/PageContext"
import { useModalLayer } from "../../../../shared/hooks/useModalLayer"
import { formatNumber } from "../../../../shared/utils/format"

// Summary counts come from the `dataValidation` query (a single-row recordset),
// the per-issue job rows from `dataValidationOpen` (tagged with `category`).
// These two queries already ship in PAGE_QUERIES.adminDashboard, so each of the
// three report widgets reading them via the shared page store costs no extra
// fetch.
interface ValidationCounts {
  open: number
  missing: number
  unknown: number
  wrong: number
  subcontracts: number
  noBudget: number
}

interface ValidationDetailRow {
  category: string
  JobNumber: string | number
  jobnme: string
  status: number
  detail: string
}

type ReportVariant = "red" | "orange" | "gray" | "navy"

type ReportWidgetId = "reconciliation" | "dataQuality" | "missingContracts" | "openProjectsNoBudget"

interface ReportDefinition {
  /** Field on the counts row, also the `category` tag on detail rows. */
  accessor: keyof ValidationCounts
  variant: ReportVariant
  /** Icon glyph shown in the colored tile. */
  glyph: React.ReactNode
  title: string
  /** Short label for the compact pill rendering (GM home alert strip). */
  shortTitle: string
  subtitle: string
}

// One definition per split widget. Was the `REPORTS` array in ReportsWidget.
const REPORT_DEFINITIONS: Record<ReportWidgetId, ReportDefinition> = {
  reconciliation: {
    accessor: "open",
    variant: "red",
    glyph: <TriangleAlert size={16} strokeWidth={2.5} />,
    title: "Reconciliation Report",
    shortTitle: "Reconciliation",
    subtitle: "Open POs or Subcontracts on Closed Jobs",
  },
  dataQuality: {
    accessor: "missing",
    variant: "orange",
    glyph: "!",
    title: "Data Quality Report",
    shortTitle: "Data Quality",
    subtitle: "Missing Required Fields",
  },
  missingContracts: {
    accessor: "unknown",
    variant: "gray",
    glyph: "?",
    title: "Missing Contracts Report",
    shortTitle: "Missing Contracts",
    subtitle: "Jobs Missing Contracts",
  },
  openProjectsNoBudget: {
    accessor: "noBudget",
    variant: "navy",
    glyph: <Calculator size={16} strokeWidth={2.5} />,
    title: "Missing Budgets Report",
    shortTitle: "Missing Budgets",
    subtitle: "Open Projects With a Contract but No Budget",
  },
}

/**
 * One data-validation report rendered as a standalone widget: a clickable stat
 * card showing the issue count, opening a modal that lists the flagged jobs.
 * Split out of the former monolithic ReportsWidget so each report can be
 * arranged independently within the Reports section.
 *
 * `compact` renders the trigger as a slim one-line pill (icon, count, short
 * title) instead of the stat card — the GM home's alert strip. The modal is
 * identical in both renderings.
 */
export function ReportWidget({ reportId, compact = false }: { reportId: ReportWidgetId; compact?: boolean }) {
  const report = REPORT_DEFINITIONS[reportId]
  const { data, isLoading } = useWidgetData<{
    dataValidation: ValidationCounts[] | null
    dataValidationOpen: ValidationDetailRow[] | null
  }>(["dataValidation", "dataValidationOpen"])
  const disconnected = usePageDisconnected()
  const { goToJobcost } = useJobcostNav()

  const [open, setOpen] = useState(false)
  const { overlayZ, contentZ } = useModalLayer(open)

  // Rows in this modal correspond to jobs flagged by the data-validation
  // queries; clicking the Job / Job # cells jumps to the job detail page so
  // the user can act on the issue without hunting through Job Costing.
  function goToJob(jobNumber: string | number) {
    const n = String(jobNumber ?? "").trim()
    if (!n) return
    setOpen(false)
    goToJobcost(n, { backLabel: "Reports" })
  }

  const counts = data?.dataValidation?.[0] ?? null
  const details = Array.isArray(data?.dataValidationOpen) ? data.dataValidationOpen : []
  const count = counts ? counts[report.accessor] ?? 0 : null
  const activeRows = details.filter((d) => d.category === report.accessor)

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="report-pill"
          onClick={() => setOpen(true)}
          disabled={isLoading || disconnected}
          title={report.subtitle}
        >
          <span className={`report-icon report-icon-${report.variant}`}>{report.glyph}</span>
          {isLoading ? (
            <span className="report-pill-count-skeleton widget-skeleton" aria-hidden="true" />
          ) : (
            <span className="report-pill-count num">
              {disconnected || count == null ? "—" : formatNumber(count)}
            </span>
          )}
          <span className="report-pill-title">{report.shortTitle}</span>
        </button>
      ) : (
        <button
          type="button"
          className="card report-card"
          onClick={() => setOpen(true)}
          disabled={isLoading || disconnected}
        >
          <div className="report-card-head">
            <span className={`report-icon report-icon-${report.variant}`}>{report.glyph}</span>
            <span className="widget-title headline">{report.title}</span>
          </div>
          {isLoading ? (
            <span className="report-card-count-skeleton widget-skeleton" aria-hidden="true" />
          ) : (
            <span className="report-card-count">
              {disconnected || count == null ? "—" : formatNumber(count)}
            </span>
          )}
          <span className="report-card-subtitle">{report.subtitle}</span>
        </button>
      )}

      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                className="modal-overlay"
                style={{ zIndex: overlayZ }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              />
              <div className="modal-positioner" style={{ zIndex: contentZ }}>
                <motion.div
                  className="modal reports-modal"
                  initial={{ opacity: 0, scale: 0.96, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 16 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <div className="modal-header">
                    <div className="reports-modal-title">
                      <span className={`report-icon report-icon-${report.variant}`}>{report.glyph}</span>
                      <div>
                        <h2 className="title2 emphasized">{report.title}</h2>
                        <span className="reports-modal-subtitle">{report.subtitle}</span>
                      </div>
                    </div>
                    <button className="button modal-close" onClick={() => setOpen(false)}>
                      <X size={16} />
                    </button>
                  </div>

                  <div className="reports-modal-body">
                    {activeRows.length === 0 ? (
                      <p className="reports-modal-empty body-text text-secondary">No issues found.</p>
                    ) : (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Job</th>
                            <th>Job Number</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeRows.map((row, i) => (
                            <tr key={`${row.JobNumber}-${i}`} className="reports-modal-row">
                              <td
                                className="reports-modal-job-cell"
                                onClick={() => goToJob(row.JobNumber)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === "Enter" && goToJob(row.JobNumber)}
                                title="Open job"
                              >
                                {row.jobnme}
                              </td>
                              <td
                                className="reports-modal-job-cell"
                                onClick={() => goToJob(row.JobNumber)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === "Enter" && goToJob(row.JobNumber)}
                                title="Open job"
                              >
                                {row.JobNumber}
                              </td>
                              <td className="text-secondary">{row.detail}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

export function ReconciliationWidget() {
  return <ReportWidget reportId="reconciliation" />
}

export function DataQualityWidget() {
  return <ReportWidget reportId="dataQuality" />
}

export function MissingContractsWidget() {
  return <ReportWidget reportId="missingContracts" />
}

export function OpenProjectsNoBudgetWidget() {
  return <ReportWidget reportId="openProjectsNoBudget" />
}
