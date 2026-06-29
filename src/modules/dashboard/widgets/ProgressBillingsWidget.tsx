import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import { ChevronRight, X } from "lucide-react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { useWidgetData } from "../../../shared/context/PageContext"
import { SortableHeader } from "../../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../../shared/hooks/useTableSort"
import { useModalLayer } from "../../../shared/hooks/useModalLayer"
import { formatMoney, formatMoneyFull } from "../../../shared/utils/format"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import type { DashboardWidgetProps } from "../config/widgetRegistry"

// One job's billing position: how much has been billed vs. how much *should* be
// billed (earned via cost-to-cost % of completion). `variance` (expected −
// billed) is positive when under-billed, negative when over-billed.
interface ProjectRow {
  id: string
  name: string
  client: string | null
  contract: number
  billed: number
  expected: number
  billedPct: number // billed ÷ contract (0–1)
  expectedPct: number // earned ÷ contract (0–1) = % complete
  variance: number
}

interface ProgressBillings {
  netOverUnder: number
  underBilledCount: number
  overBilledCount: number
  projects: ProjectRow[]
  // Every ranked job (over- and under-billed); the widget shows the largest by
  // absolute value, the page lists them all.
  allProjects: ProjectRow[]
}

const TOP_N = 5
// Full-list page is a later task; the Top 5 Billing Variance header "See All"
// points here so the nav is consistent the moment it ships.
const FULL_LIST_ROUTE = "/dashboard/progress-billings"

const pct = (v: number) => `${Math.round(v * 100)}%`

const UNDER_COLOR = "#22c55e"
const OVER_COLOR = "#ef4444"

type PbSortKey = "name" | "contract" | "billed" | "expected" | "variance"

/**
 * Modal listing every ranked job's billing position (over- and under-billed).
 * Opened from the Net headline metric — the full breakdown behind that figure.
 * The rows are already in the dashboard payload (`allProjects`), so nothing is
 * fetched lazily; each row drills into job costing like the widget table.
 */
function ProgressBillingsModal({
  open,
  projects,
  onClose,
  onSelectJob,
}: {
  open: boolean
  projects: ProjectRow[]
  onClose: () => void
  onSelectJob: (id: string) => void
}) {
  // Default to the most under-billed at the top (largest positive variance).
  const sort = useTableSort<PbSortKey>("variance", "desc")
  const { overlayZ, contentZ } = useModalLayer(open)
  const sorted = useMemo(
    () =>
      applySort(projects, sort, (p, key) =>
        key === "name" ? p.name : p[key]
      ),
    [projects, sort]
  )

  let totalUnder = 0
  let totalOver = 0
  for (const p of projects) {
    if (p.variance > 0) totalUnder += p.variance
    else if (p.variance < 0) totalOver += -p.variance
  }
  const net = totalUnder - totalOver
  const netLabel = net > 0 ? "Net Under-billed" : net < 0 ? "Net Over-billed" : "Net (balanced)"

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
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
                  <div>
                    <h2 className="title2 emphasized">{netLabel}</h2>
                    <span className="reports-modal-subtitle">
                      {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
                      {formatMoneyFull(totalUnder)} under · {formatMoneyFull(totalOver)} over ·{" "}
                      {formatMoneyFull(Math.abs(net))} net
                    </span>
                  </div>
                </div>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              <div className="reports-modal-body">
                {projects.length === 0 ? (
                  <p className="reports-modal-empty body-text text-secondary">No projects to show.</p>
                ) : (
                  <table className="data-table billings-invoice-table">
                    <thead>
                      <tr>
                        <SortableHeader label="Project" columnKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Contract" columnKey="contract" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Billed" columnKey="billed" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Earned" columnKey="expected" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Over / Under" columnKey="variance" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p) => (
                        <tr
                          key={p.id}
                          className="clickable-row"
                          onClick={() => onSelectJob(p.id)}
                          title="Open job costing"
                        >
                          <td>
                            {p.name}
                            {p.client && <span className="text-secondary"> · {p.client}</span>}
                          </td>
                          <td className="num text-secondary">{formatMoneyFull(p.contract)}</td>
                          <td className="num text-secondary">{formatMoneyFull(p.billed)}</td>
                          <td className="num text-secondary">{formatMoneyFull(p.expected)}</td>
                          <td
                            className="num"
                            style={{ color: p.variance < 0 ? OVER_COLOR : p.variance > 0 ? UNDER_COLOR : undefined }}
                          >
                            {formatMoneyFull(Math.abs(p.variance))}{" "}
                            {p.variance < 0 ? "over" : p.variance > 0 ? "under" : "even"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>{netLabel}</td>
                        <td className="num" style={{ color: net < 0 ? OVER_COLOR : net > 0 ? UNDER_COLOR : undefined }}>
                          {formatMoneyFull(Math.abs(net))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
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

export function ProgressBillingsWidget({ colSpan }: DashboardWidgetProps) {
  const { goToJobcost } = useJobcostNav()
  // Full numbers read best at the widget's full width; compact only on mobile.
  const isMobile = useIsMobile()
  const money = isMobile ? formatMoney : formatMoneyFull
  const { data, isLoading, disconnected } = useWidgetData<{ progressBillings: ProgressBillings | null }>([
    "progressBillings",
  ])
  const pb = data?.progressBillings

  const [netOpen, setNetOpen] = useState(false)
  // The full set behind the Net figure (over- and under-billed), ranked by the
  // modal itself. Falls back to the under-billed-only list on older backends.
  const allProjects = pb?.allProjects ?? pb?.projects ?? []

  const viewLink = (
    <Link to={FULL_LIST_ROUTE} className="widget-link-btn" title="View all projects by billing status">
      See All <ChevronRight size={12} />
    </Link>
  )

  // Largest billing positions by absolute value — both under- and over-billed —
  // most significant first. (Falls back to the under-billed-only `projects` if
  // an older backend hasn't shipped `allProjects` yet.)
  const top = [...(pb?.allProjects ?? pb?.projects ?? [])]
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, TOP_N)
  // Totals summed over the ranked projects, with Net = Under − Over so the three
  // figures reconcile (and match the Progress Billings page band).
  let totalUnder = 0
  let totalOver = 0
  for (const p of pb?.allProjects ?? []) {
    if (p.variance > 0) totalUnder += p.variance
    else if (p.variance < 0) totalOver += -p.variance
  }
  const net = totalUnder - totalOver
  const netLabel = net > 0 ? "Net Under-billed" : net < 0 ? "Net Over-billed" : "Net (balanced)"

  // Full width: the stat boxes (Net + the two totals) stack in a column beside
  // the table. Half width / mobile: just the Net box sits above the table.
  const wide = colSpan === 2 && !isMobile

  const netBox = (
    <button
      type="button"
      className="pb-headline-metric pb-headline-metric--net pb-net-clickable"
      onClick={() => setNetOpen(true)}
      title="View all billing positions"
    >
      <span className="pb-headline-value large-title emphasized">{formatMoneyFull(Math.abs(net))}</span>
      <span className="pb-headline-label">{netLabel}</span>
    </button>
  )

  // Stat column (Net hero + under/over split) — shared by the wide Progress
  // Billings card body.
  const statsBody = (
    <div className="pb-stats-body">
      {/* Net is the hero — a large figure centered in the column. Clickable to
          open the full breakdown of every billing position. */}
      <button
        type="button"
        className="pb-net-hero pb-net-clickable"
        onClick={() => setNetOpen(true)}
        title="View all billing positions"
      >
        <span
          className={`pb-net-hero-label${net > 0 ? " pb-net-hero-label--under" : net < 0 ? " pb-net-hero-label--over" : ""}`}
        >
          {netLabel}
        </span>
        <span className={`pb-net-hero-value large-title emphasized${net < 0 ? " pb-net-hero-value--over" : ""}`}>
          {formatMoneyFull(Math.abs(net))}
        </span>
      </button>
      <div className="pb-net-split">
        <div className="pb-net-split-item">
          <span className="pb-net-split-label pb-net-split-label--under">Under-billed</span>
          <span className="pb-net-split-value">{money(totalUnder)}</span>
        </div>
        <div className="pb-net-split-item">
          <span className="pb-net-split-label pb-net-split-label--over">Over-billed</span>
          <span className="pb-net-split-value">{money(totalOver)}</span>
        </div>
      </div>
    </div>
  )

  const tableEl = (
    <table className="data-table data-table-airy pb-table">
      <thead>
        <tr>
          <th>{wide ? "Project" : `Top ${TOP_N} Projects with Variance`}</th>
          {wide && <th className="num">Contract</th>}
          <th className="num">Billed</th>
          <th className="num">Earned</th>
          <th style={{ textAlign: "center" }}>Over / Under</th>
        </tr>
      </thead>
      <tbody>
        {top.map((p) => (
          <tr
            key={p.id}
            className="clickable-row"
            role="button"
            tabIndex={0}
            title="Open job costing"
            onClick={() => goToJobcost(p.id)}
            onKeyDown={(e) => e.key === "Enter" && goToJobcost(p.id)}
          >
            <td>
              <div className="pb-name body-text emphasized">{p.name}</div>
            </td>
            {wide && (
              <td className="num">
                <div className="pb-amt">{money(p.contract)}</div>
              </td>
            )}
            <td className="num">
              <div className="pb-amt">{money(p.billed)}</div>
              <div className="pb-sub">{pct(p.billedPct)} billed</div>
            </td>
            <td className="num">
              <div className="pb-amt">{money(p.expected)}</div>
              <div className="pb-sub">{pct(p.expectedPct)} complete</div>
            </td>
            <td className="pb-overunder-cell">
              <div className="pb-overunder-inner">
                {p.variance < 0 ? (
                  <span className="pb-dir-pill pb-dir-pill--over">
                    {money(Math.abs(p.variance))} over
                  </span>
                ) : p.variance > 0 ? (
                  <span className="pb-dir-pill pb-dir-pill--under">
                    {money(Math.abs(p.variance))} under
                  </span>
                ) : (
                  <span className="pb-dir-pill pb-dir-pill--even">even</span>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  // Full width: two separate widget cards — the Progress Billings stat column
  // (1/4) and the Top 5 Billing Variance table (3/4) — paired side by side. Each
  // is a real Widget so it gets its own card shadow, header, and skeleton, and
  // the pair sits in the grid exactly like the Banking/Overdue pair. Half width
  // keeps the standard single-card layout.
  if (wide) {
    return (
      <div className="pb-pair">
        <Widget
          className="pb-stats-widget"
          title="Progress Billings"
          loading={isLoading}
          noData={!pb}
          disconnected={disconnected}
        >
          {pb && statsBody}
        </Widget>

        <Widget
          className="pb-projects-widget"
          title="Top 5 Billing Variance"
          actions={viewLink}
          loading={isLoading}
          noData={!pb}
          disconnected={disconnected}
        >
          {pb && tableEl}
        </Widget>

        <ProgressBillingsModal
          open={netOpen}
          projects={allProjects}
          onClose={() => setNetOpen(false)}
          onSelectJob={(id) => goToJobcost(id)}
        />
      </div>
    )
  }

  return (
    <Widget
      title="Progress Billings"
      loading={isLoading}
      noData={!pb}
      disconnected={disconnected}
      actions={viewLink}
    >
      {pb && (
        <div className="pb-widget">
          <div className="pb-headline">{netBox}</div>
          {tableEl}
        </div>
      )}

      <ProgressBillingsModal
        open={netOpen}
        projects={allProjects}
        onClose={() => setNetOpen(false)}
        onSelectJob={(id) => goToJobcost(id)}
      />
    </Widget>
  )
}
