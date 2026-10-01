import { useState } from "react"
import { createPortal } from "react-dom"
import { useJobcostNav } from "../../../jobcost/useJobcostNav"
import { X, TriangleAlert, Calculator, Hash, Type, ArrowLeftRight, ArrowRight } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useWidgetData, usePageDisconnected } from "../../../../shared/context/PageContext"
import { useModalLayer } from "../../../../shared/hooks/useModalLayer"
import { formatNumber, formatMoneyFull } from "../../../../shared/utils/format"
import { InvoiceDetailModal } from "../../../../shared/components/InvoiceDetailModal/InvoiceDetailModal"

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
  noUnitCount: number
  noOneOffName: number
  costTypeMismatch: number
}

interface ValidationDetailRow {
  category: string
  JobNumber: string | number
  jobnme: string
  status: number
  detail: string
  // Cost type mismatch rows only (NULL for every other category).
  invoiceRecnum?: string | null
  invoiceNum?: string | null
  vendorName?: string | null
  accountNums?: string | null
  accountTypes?: string | null
  codedTypes?: string | null
  codedTypeNums?: string | null
  amount?: number | null
  /** jobcst.recnum(s) behind the row, comma-separated. */
  costRecnums?: string | null
}

type ReportVariant = "red" | "orange" | "gray" | "navy" | "teal" | "plum" | "indigo"

type ReportWidgetId =
  | "reconciliation"
  | "dataQuality"
  | "missingContracts"
  | "openProjectsNoBudget"
  | "missingUnitCounts"
  | "missingOneOffNames"
  | "costTypeMismatch"

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
  /** Reference table shown beside the modal (left of it on wide screens). */
  mapping?: { title: string; rows: { category: string; account: string; costType: string }[] }
  /** Columned table in place of the default Job / Job Number / Details. */
  table?: "costTypeMismatch"
}

// Mirrors AcctCostTypeMap in the backend's dashboard.queries.js; change both
// together.
const ACCOUNT_COST_TYPE_MAPPING = {
  title: "Expected Mapping",
  rows: [
    { category: "Material", account: "5500", costType: "1" },
    { category: "Labor", account: "5400", costType: "2" },
    { category: "Subcontractor", account: "5200", costType: "4" },
    { category: "WTPM", account: "5005", costType: "5" },
  ],
}

function MappingCard({ mapping, className }: { mapping: NonNullable<ReportDefinition["mapping"]>; className: string }) {
  return (
    <div className={`reports-mapping ${className}`}>
      <span className="reports-mapping-title footnote emphasized">{mapping.title}</span>
      <div className="reports-mapping-grid">
        <span className="reports-mapping-head" />
        <span className="reports-mapping-head">Account</span>
        <span className="reports-mapping-head" />
        <span className="reports-mapping-head">Cost Type</span>
        {mapping.rows.map((r) => (
          <div key={r.category} className="reports-mapping-row">
            <span className="reports-mapping-category">{r.category}</span>
            <span className="num">{r.account}</span>
            <ArrowRight size={12} className="reports-mapping-arrow" aria-label="maps to" />
            <span className="num">{r.costType}</span>
          </div>
        ))}
      </div>
    </div>
  )
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
  missingUnitCounts: {
    accessor: "noUnitCount",
    variant: "teal",
    glyph: <Hash size={16} strokeWidth={2.5} />,
    title: "Missing Unit Counts Report",
    shortTitle: "Missing Unit Counts",
    subtitle: "Phase Jobs Without a Unit Count",
  },
  missingOneOffNames: {
    accessor: "noOneOffName",
    variant: "plum",
    glyph: <Type size={16} strokeWidth={2.5} />,
    title: "Missing One-Off Names Report",
    shortTitle: "Missing One-Off Names",
    subtitle: "One-Off Jobs Without a One-Off Name",
  },
  costTypeMismatch: {
    accessor: "costTypeMismatch",
    variant: "indigo",
    glyph: <ArrowLeftRight size={16} strokeWidth={2.5} />,
    title: "Cost Type Mismatch Report",
    shortTitle: "Cost Type Mismatch",
    subtitle: "Invoice Accounts Not Matching Job Cost Types",
    mapping: ACCOUNT_COST_TYPE_MAPPING,
    table: "costTypeMismatch",
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
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(open)

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
          className={`report-pill${disconnected ? " report-card--offline" : ""}`}
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
          className={`card report-card${disconnected ? " report-card--offline" : ""}`}
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
                className={`modal-overlay${isTopLayer ? " modal-overlay--blur" : ""}`}
                style={{ zIndex: overlayZ }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
              />
              <div className="modal-positioner" style={{ zIndex: contentZ }}>
                <div className="reports-modal-anchor">
                {report.mapping && (
                  <motion.div
                    className="reports-mapping-side"
                    initial={{ opacity: 0, scale: 0.96, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 16 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <MappingCard mapping={report.mapping} className="card" />
                  </motion.div>
                )}
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

                  {report.mapping && (
                    <MappingCard mapping={report.mapping} className="reports-mapping--inline" />
                  )}

                  <div className="reports-modal-body">
                    {activeRows.length === 0 ? (
                      <p className="reports-modal-empty body-text text-secondary">No issues found.</p>
                    ) : report.table === "costTypeMismatch" ? (
                      <CostTypeMismatchTable rows={activeRows} onJob={goToJob} />
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
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

/**
 * Cost type mismatch rows as columns: the invoice's account (and the cost type
 * it implies) beside the cost type the job cost was actually coded to.
 * Largest dollar mismatches first. A row opens its AP invoice in the shared
 * invoice modal (stacked above this one); the job cell still opens the job.
 */
function CostTypeMismatchTable({ rows, onJob }: { rows: ValidationDetailRow[]; onJob: (n: string | number) => void }) {
  const sorted = [...rows].sort((a, b) => Math.abs(Number(b.amount ?? 0)) - Math.abs(Number(a.amount ?? 0)))
  const [invoice, setInvoice] = useState<ValidationDetailRow | null>(null)
  const openInvoice = (row: ValidationDetailRow) => {
    if (row.invoiceRecnum) setInvoice(row)
  }
  return (
    <>
    <table className="data-table ctm-table">
      <thead>
        <tr>
          <th>Job</th>
          <th>Invoice</th>
          <th>Invoice Account</th>
          <th>Coded in Job Cost</th>
          <th className="ctm-num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => (
          <tr
            key={`${row.invoiceNum}-${row.JobNumber}-${i}`}
            className={`reports-modal-row${row.invoiceRecnum ? " clickable-row" : ""}`}
            onClick={() => openInvoice(row)}
            title={row.invoiceRecnum ? "Open invoice" : undefined}
          >
            <td
              className="reports-modal-job-cell"
              onClick={(e) => {
                e.stopPropagation()
                onJob(row.JobNumber)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return
                e.stopPropagation()
                onJob(row.JobNumber)
              }}
              title="Open job"
            >
              <span className="ctm-primary">{row.jobnme}</span>
              <span className="ctm-secondary num">{row.JobNumber}</span>
            </td>
            <td>
              <span className="ctm-primary num">#{row.invoiceNum}</span>
              {row.vendorName && <span className="ctm-secondary">{row.vendorName}</span>}
            </td>
            <td>
              <span className="ctm-primary">{row.accountTypes}</span>
              <span className="ctm-secondary num">Account {row.accountNums}</span>
            </td>
            <td>
              <span className="ctm-primary ctm-coded">{row.codedTypes}</span>
              <span className="ctm-secondary num">Cost type {row.codedTypeNums}</span>
              {row.costRecnums && (
                <span className="ctm-secondary num">
                  {row.costRecnums.includes(",") ? "Job cost recs" : "Job cost rec"} {row.costRecnums}
                </span>
              )}
            </td>
            <td className="ctm-num num">{row.amount == null ? "—" : formatMoneyFull(Number(row.amount))}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <InvoiceDetailModal
      invoiceId={invoice?.invoiceRecnum ?? null}
      module={invoice?.accountTypes?.includes("Subcontractor") ? "subcontractors" : "suppliers"}
      onClose={() => setInvoice(null)}
    />
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

export function MissingUnitCountsWidget() {
  return <ReportWidget reportId="missingUnitCounts" />
}

export function MissingOneOffNamesWidget() {
  return <ReportWidget reportId="missingOneOffNames" />
}

export function CostTypeMismatchWidget() {
  return <ReportWidget reportId="costTypeMismatch" />
}
