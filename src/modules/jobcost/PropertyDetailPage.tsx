import { useState, useEffect, useMemo, useRef, useDeferredValue, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Building2, ExternalLink, Hammer, ChevronRight, X } from "lucide-react"
import Page from "../../shared/components/Page"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { SkelText } from "../../shared/components/SkelText"
import { ChartAreaSkeleton } from "../../shared/components/Chart/ChartSkeletons"
import { fetchPageData } from "../../shared/api/pageApi"
import { trackProjectView } from "../../shared/analytics/analytics"
import { formatMoney, formatMoneyFull, marginTextColor } from "../../shared/utils/format"
import useIsMobile from "../../shared/hooks/useIsMobile"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole } from "../../core/auth/roles"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { JOB_STATUS_LABELS } from "../directory/directoryShared"
import {
  SummaryRow,
  JobTable,
  normalizeProject,
  SEG_SPRING,
  type Job,
  type JobDetail,
  type RawProject,
  type SortKey,
  type SortDir,
} from "./Jobcost"
import { Fact, Meta } from "./detailPrimitives"
import { oneoffFromRecnum, parseValidDate, fmtLongDate, propertySlug } from "./jobcostShared"
import { JOBCOST_BACK_FALLBACK, useJobcostNav, type JobcostBackState } from "./useJobcostNav"
import { thinLabels } from "./weeklySpend"
import type { LineMarker } from "../../shared/components/Chart/chart.types"

// Property detail page (/jobcost/property/:parent) — the full-screen report
// behind a Job Costing property card. The :parent param is the slugged Sage
// actr_u.parent shared-address string, the same key the grouped list view
// rolls jobs up by. Data is the SAME all-time getPhases fetch the list uses,
// filtered to this parent client-side — so every figure here reconciles with
// the property card by construction.

// Units bars wear the brand orange the app's other single-series charts use.
const COLOR_UNITS = "#c27c3e"

// Same hues as the .status-N badge classes (App.css), reused so the matrix
// tooltip's status line reads consistently with badges elsewhere on the page.
const JOB_STATUS_COLORS: Record<number, string> = {
  1: "#3b82f6", // Bidding
  2: "#9ca3af", // Refused
  3: "#eab308", // Contract
  4: "#e0985a", // Current — lighter primary-color tint for the dark tooltip pill
  5: "#22c55e", // Complete
  6: "#9ca3af", // Closed
}

interface RawPhaseRow {
  recnum: string | number
  name: string
  status: number
  unitCount?: number | string | null
  startDate?: string | null
  completedDate?: string | null
  updatedDate?: string | null
  totalContract?: number
  originalContract?: number
  changeOrderAmount?: number
  totalCost?: number
  totalCommitted?: number
  totalIncome?: number
  budget?: number
  pmId?: number | null
  pmName?: string | null
  clientId?: number | null
  clientName?: string | null
  parent?: string | null
  oneoff?: number | null
  // actr_u.oofnme — the one-off's given display name. Only newer one-offs
  // carry it; fall back to the job name.
  oofnme?: string | null
}

interface Member {
  recnum: string
  name: string
  status: number
  contract: number
  budget: number
  totalCost: number
  totalCommitted: number
  margin: number | null
  units: number
  pmId: number | null
  pmName: string
  clientId: number | null
  clientName: string
  oneoff: boolean
  startDate: Date | null
  completedDate: Date | null
  updatedDate: Date | null
  // "YYYY-MM" the job belongs to on the property's monthly history axis.
  // Phases carry their month in the recnum (YY prefix = year, last two
  // digits = phase month); everything else walks a date fallback chain
  // (start → completed → updated) so a job only drops off the charts when
  // it carries no dates at all.
  monthKey: string | null
  // Phase month from the recnum suffix (1-12), null for one-offs — drives
  // the "P7" tile labels and their ordering.
  phaseNum: number | null
}

function dateMonthKey(d: Date | null): string | null {
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null
}

function normalizeMember(p: RawPhaseRow): Member {
  const recnum = String(p.recnum).trim()
  const contract = p.totalContract ?? 0
  const totalCost = p.totalCost ?? 0
  const oneoff = p.oneoff != null ? p.oneoff === 1 : oneoffFromRecnum(recnum)
  const startDate = parseValidDate(p.startDate)
  const completedDate = parseValidDate(p.completedDate)
  const updatedDate = parseValidDate(p.updatedDate)
  let phaseNum: number | null = null
  let monthKey: string | null = null
  if (!oneoff && /^\d{8}$/.test(recnum)) {
    const yy = Number(recnum.slice(0, 2))
    const mm = Number(recnum.slice(-2))
    if (mm >= 1 && mm <= 12) {
      phaseNum = mm
      monthKey = `${2000 + yy}-${String(mm).padStart(2, "0")}`
    }
  }
  if (!monthKey) {
    monthKey = dateMonthKey(startDate) ?? dateMonthKey(completedDate) ?? dateMonthKey(updatedDate)
  }
  return {
    recnum,
    // One-offs go by their given name (oofnme) when Sage has one — the raw
    // job name is the fallback. Everything on this page (matrix tooltips,
    // ledger, jobs table, kind modals) reads this field.
    name: (oneoff ? p.oofnme?.trim() : null) || p.name,
    status: p.status,
    contract,
    budget: p.budget ?? 0,
    totalCost,
    totalCommitted: p.totalCommitted ?? 0,
    margin: contract > 0 ? ((contract - totalCost) / contract) * 100 : null,
    // One-offs (repairs, extras) aren't unit deliveries — never count them,
    // even when Sage carries a unitCount on the record.
    units: oneoff ? 0 : Number(p.unitCount) || 0,
    pmId: p.pmId ?? null,
    pmName: p.pmName?.trim() ?? "",
    clientId: p.clientId ?? null,
    clientName: p.clientName?.trim() ?? "",
    oneoff,
    startDate,
    completedDate,
    updatedDate,
    monthKey,
    phaseNum,
  }
}

// One month on the property's history axis (only months with jobs exist —
// a rolling property is usually contiguous, gaps mean skipped months).
interface MonthBucket {
  jobs: number
  key: string // "YYYY-MM", sortable
  label: string // "Mar 24"
  contract: number
  budget: number
  cost: number
  units: number
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

// Property tenure reads in years once it outgrows days.
function tenureLabel(days: number): string {
  if (days < 365) return `${days} days`
  const years = days / 365
  return `${years.toFixed(years < 10 ? 1 : 0)} years`
}

// ─── Hero backdrop art ───────────────────────────────────────────────
// A single quiet Chicago School tower in the property hero's corner — the
// visual tell that this page is the PROPERTY lens on job costing (the
// project page carries a giant phase number instead). Drawn taller than the
// hero and cropped by it, so the surface reads as a mask over a larger
// scene. Openings are punched out via an SVG mask so the deck's gradient
// shows through them. The Chicago tells: a projecting flat cornice, strong
// corner piers, a tripartite base/shaft/capital elevation, and "Chicago
// windows" — one wide center pane flanked by two narrow sashes per bay.
function BuildingArt() {
  // Three bays of 44 (8/2/24/2/8 = narrow-wide-narrow) between 18-wide
  // piers: each tripartite group reads as ONE window unit, with real
  // masonry between units — that separation is what keeps the facade calm
  // at backdrop alpha.
  const BAYS = [46, 108, 170]
  const openings: React.ReactNode[] = []
  // Capital (attic) floor under the cornice: one small pair per bay.
  for (const bx of BAYS) {
    openings.push(<rect key={`a${bx}0`} x={bx + 1} y={42} width={19} height={15} rx={3} fill="#000" />)
    openings.push(<rect key={`a${bx}1`} x={bx + 24} y={42} width={19} height={15} rx={3} fill="#000" />)
  }
  // Shaft: five floors of Chicago windows (narrow / wide / narrow).
  for (let f = 0; f < 5; f++) {
    const y = 78 + f * 38
    for (const bx of BAYS) {
      openings.push(<rect key={`s${f}${bx}l`} x={bx} y={y} width={8} height={21} rx={2.5} fill="#000" />)
      openings.push(<rect key={`s${f}${bx}c`} x={bx + 10} y={y} width={24} height={21} rx={3} fill="#000" />)
      openings.push(<rect key={`s${f}${bx}r`} x={bx + 36} y={y} width={8} height={21} rx={2.5} fill="#000" />)
    }
  }
  return (
    <svg viewBox="0 0 260 380" preserveAspectRatio="xMaxYMax meet" className="pd-art-svg" aria-hidden="true">
      <defs>
        <mask id="pd-building-mask">
          {/* Projecting cornice slab + sub-band — the Chicago School crown */}
          <rect x={14} y={4} width={232} height={13} rx={4} fill="#fff" />
          <rect x={24} y={21} width={212} height={8} rx={3} fill="#fff" />
          {/* Main block: one straight masonry slab, bottom cropped by the hero */}
          <rect x={30} y={33} width={200} height={347} fill="#fff" />
          {openings}
          {/* String course dividing shaft from base */}
          <rect x={30} y={274} width={200} height={5} fill="#000" />
          {/* Ground floor: storefront bays flanking an arched entrance */}
          <rect x={46} y={296} width={54} height={56} rx={6} fill="#000" />
          <rect x={160} y={296} width={54} height={56} rx={6} fill="#000" />
          <rect x={112} y={302} width={36} height={78} rx={17} fill="#000" />
        </mask>
      </defs>
      <rect width={260} height={380} fill="currentColor" mask="url(#pd-building-mask)" />
    </svg>
  )
}

type MemberSortKey = "name" | "kind" | "status" | "pm" | "units" | "contract" | "budget" | "cost" | "margin"

// The property's jobs table — used full-width at the page foot and inside the
// kind-card modals, so the two always show identical columns. Rows open the
// job's full report.
function MembersTable({ members, showContract, marginColorsOn, onOpen, showKind = true }: {
  members: Member[]
  showContract: boolean
  marginColorsOn: boolean
  onOpen: (m: Member) => void
  /** Off inside the kind modals — the modal already IS one kind. */
  showKind?: boolean
}) {
  const sort = useTableSort<MemberSortKey>()
  const sorted = applySort(members, sort, (m, key) => {
    switch (key) {
      case "name": return m.name
      case "kind": return m.oneoff ? 1 : 0
      case "status": return m.status
      case "pm": return m.pmName || null
      case "units": return m.units
      case "contract": return m.contract
      case "budget": return m.budget
      case "cost": return m.totalCost
      case "margin": return m.margin
    }
  })
  return (
    <table className="spend-rank-table inv-table">
      <thead>
        <tr>
          <SortableHeader label="Job" columnKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          {showKind && (
            <SortableHeader label="Kind" columnKey="kind" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          )}
          <SortableHeader label="Status" columnKey="status" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} className="inv-th-status" />
          <SortableHeader label="PM" columnKey="pm" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} className="inv-th-date" />
          <SortableHeader label="Units" columnKey="units" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
          {showContract && (
            <SortableHeader label="Contract" columnKey="contract" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
          )}
          <SortableHeader label="Budget" columnKey="budget" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
          <SortableHeader label="Committed + Spent" columnKey="cost" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
          <SortableHeader label="Margin" columnKey="margin" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((m) => (
          <tr
            key={m.recnum}
            className="spend-rank-table-row"
            onClick={() => onOpen(m)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onOpen(m)}
          >
            <td className="spend-rank-table-name">
              <div className="body-text emphasized jc-name-text" title={m.name}>{m.name}</div>
              <div className="cell-secondary jc-name-sub">
                <span className="jc-name-number">#{m.recnum}</span>
              </div>
            </td>
            {showKind && (
              <td className="spend-rank-table-name">
                <span className="pd-kind">
                  {m.oneoff ? <Hammer size={12} /> : <Building2 size={12} />}
                  {m.oneoff ? "One-Off" : "Phase"}
                </span>
              </td>
            )}
            <td className="spend-rank-table-name inv-th-status">
              <span className={`status-badge status-${m.status}`}>
                {JOB_STATUS_LABELS[m.status] ?? m.status}
              </span>
            </td>
            <td className="spend-rank-table-name body-text text-secondary inv-th-date">{m.pmName || "—"}</td>
            <td className="spend-rank-table-value body-text">{m.units > 0 ? m.units : "—"}</td>
            {showContract && (
              <td className="spend-rank-table-value body-text">{formatMoneyFull(m.contract)}</td>
            )}
            <td className="spend-rank-table-value body-text">{formatMoneyFull(m.budget)}</td>
            <td className="spend-rank-table-value body-text">{formatMoneyFull(m.totalCost)}</td>
            <td
              className="spend-rank-table-value body-text emphasized"
              style={!marginColorsOn || m.margin == null ? undefined : { color: marginTextColor(m.margin) }}
            >
              {m.margin == null ? "—" : `${m.margin.toFixed(1)}%`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Modal behind the Rolling Phase Work / One-Off Work cards: that kind's jobs
// in the app's standard reports-modal table dress.
function KindJobsModal({ open, title, members, showContract, marginColorsOn, onClose, onOpen }: {
  open: boolean
  title: string
  members: Member[]
  showContract: boolean
  marginColorsOn: boolean
  onClose: () => void
  onOpen: (m: Member) => void
}) {
  const { overlayZ, contentZ } = useModalLayer(open)
  const contract = members.reduce((s, m) => s + m.contract, 0)
  const subtitle = [
    `${members.length} job${members.length === 1 ? "" : "s"}`,
    showContract ? `${formatMoney(contract)} contract volume` : null,
  ].filter(Boolean).join(" · ")

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
              className="modal reports-modal pd-jobs-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <div className="reports-modal-title">
                  <div>
                    <h2 className="title2 emphasized">{title}</h2>
                    <span className="reports-modal-subtitle">{subtitle}</span>
                  </div>
                </div>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
              <div className="reports-modal-body pd-jobs-modal-body">
                <MembersTable
                  members={members}
                  showContract={showContract}
                  marginColorsOn={marginColorsOn}
                  onOpen={onOpen}
                  showKind={false}
                />
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// One column of the Rolling Phase Work / One-Off Work ledger — the same
// figures the property card's expanded sub-cards show, in the detail pages'
// two-column ledger dress. The whole column is a drill-through into the
// kind's job list (modal). Loading renders the same rows with SkelText
// values.
function KindLedgerCol({ icon, title, singular, plural, members, loading, showContract, marginColorsOn, onOpen }: {
  icon: React.ReactNode
  title: string
  // Count noun: "25 Phases ›" / "2 One-Offs ›", not a bare number.
  singular: string
  plural: string
  members: Member[]
  loading: boolean
  showContract: boolean
  marginColorsOn: boolean
  onOpen: () => void
}) {
  const contract = members.reduce((s, m) => s + m.contract, 0)
  const budget = members.reduce((s, m) => s + m.budget, 0)
  const totalCost = members.reduce((s, m) => s + m.totalCost, 0)
  const margin = contract > 0 ? ((contract - totalCost) / contract) * 100 : null
  const marginColor = !marginColorsOn || margin == null ? undefined : marginTextColor(margin)
  // Budget Remaining/Exceeded: POSITIVE = under budget (good); NEGATIVE = over
  // (bad) — the row shows the absolute value with the label carrying the sign.
  const budgetVariance = budget - totalCost
  const varianceClass = budgetVariance === 0 ? undefined : budgetVariance > 0 ? "jc-variance-under" : "jc-variance-over"
  const empty = !loading && members.length === 0
  const clickable = !loading && !empty
  // min(member status) — same escalation rule as the property card's badge:
  // any Current member → Current; else any Complete → Complete; else Closed.
  const status = loading || members.length === 0 ? null : Math.min(...members.map((m) => m.status))

  return (
    <div
      className={`jcd-ledger-col${clickable ? " pd-ledger-col-link" : ""}`}
      onClick={clickable ? onOpen : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => e.key === "Enter" && onOpen() : undefined}
    >
      <div className="jc-summary-title subheadline text-secondary pd-kind-title">
        {icon}
        {title}
        {status != null && (
          <span className={`status-badge status-${status}`}>
            {JOB_STATUS_LABELS[status] ?? status}
          </span>
        )}
        {clickable && (
          <span className="pd-kind-count">
            {members.length} {members.length === 1 ? singular : plural}
            <ChevronRight size={13} className="pd-kind-chevron" />
          </span>
        )}
      </div>
      {empty ? (
        <div className="pd-kind-none body-text text-secondary">None at this property.</div>
      ) : (
        <>
          {showContract && (
            <SummaryRow label="Contract" value={loading ? <SkelText ch={9} /> : formatMoneyFull(contract)} />
          )}
          <SummaryRow label="Budget" value={loading ? <SkelText ch={9} /> : formatMoneyFull(budget)} />
          <SummaryRow label="Committed + Spent" value={loading ? <SkelText ch={9} /> : formatMoneyFull(totalCost)} />
          <div className="jc-summary-totals">
            {showContract && (
              <SummaryRow
                label="Gross Profit"
                value={loading ? <SkelText ch={8} /> : formatMoneyFull(contract - totalCost)}
                total
                valueColor={marginColor ?? (!loading && contract - totalCost < 0 ? "#ef4444" : undefined)}
              />
            )}
            <SummaryRow
              label={budgetVariance < 0 ? "Budget Exceeded" : "Budget Remaining"}
              value={loading ? <SkelText ch={8} /> : formatMoneyFull(Math.abs(budgetVariance))}
              total
              valueClass={varianceClass}
            />
            <SummaryRow
              label="Margin"
              value={loading ? <SkelText ch={5} /> : margin == null ? "—" : `${margin.toFixed(1)}%`}
              total
              valueColor={marginColor}
            />
          </div>
        </>
      )}
    </div>
  )
}

// One PM's lifetime share of the property, feeding the filter segments.
interface PmStat {
  name: string
  pmId: number | null
  jobs: number
  contract: number
  cost: number
}

// The Jobs section, self-contained: filter/sort/expand state lives HERE so a
// seg click re-renders only this card — the hero, matrix, and charts above
// are expensive and re-rendering them per click is what read as lag. The
// layout mirrors the list page exactly: a command-bar control deck above
// (PM filter + drill-through + count) and the table alone in its widget
// below (same Widget classes — its cell metrics are scoped under
// .co-widget); rows expand in place to the contract/cost summaries + cost
// breakdown, View opens the full report. Pinning stays a list-page
// affordance.
function JobsSection({ jobRows, pmStats, isLoading, isManager, marginColorsOn, canOpenEmployee }: {
  jobRows: Job[]
  pmStats: PmStat[]
  isLoading: boolean
  isManager: boolean
  marginColorsOn: boolean
  canOpenEmployee: boolean
}) {
  const navigate = useNavigate()
  const { goToJobcost } = useJobcostNav()
  const [openJobKey, setOpenJobKey] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, JobDetail | "loading">>({})
  // null = the page's default order (newest job first).
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  // PM segment filter: one PM at a time, click again (or All) to clear.
  const [pmFilter, setPmFilter] = useState<string | null>(null)
  // The table swap lags the seg click by one concurrent render so the thumb
  // glide stays instant while the heavy table re-renders in the background —
  // same pattern as the list page's view toggle.
  const deferredPmFilter = useDeferredValue(pmFilter)

  // Reserved card height: filtering must never shrink the page (the layout
  // shift reads as a glitch). The full unfiltered table — with no row
  // expanded — is the natural baseline; it's held as a min-height on the
  // table's wrapper, so a filtered-down table leaves quiet whitespace inside
  // the card instead of collapsing it. Measured off the table itself (the
  // wrapper's first child), which the min-height doesn't stretch, so the
  // baseline stays honest if the data ever changes.
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const [reservedH, setReservedH] = useState<number>()
  useLayoutEffect(() => {
    if (deferredPmFilter != null || openJobKey != null) return
    const table = tableWrapRef.current?.firstElementChild as HTMLElement | null
    if (table) setReservedH(table.offsetHeight)
  }, [deferredPmFilter, openJobKey, jobRows])

  const tableJobs = useMemo(() => {
    const list = deferredPmFilter ? jobRows.filter((j) => j.supervisor === deferredPmFilter) : [...jobRows]
    return list.sort((a, b) => {
      // No column sort = the page's default order: newest job first.
      if (sortKey == null) return Number(b.recnum) - Number(a.recnum)
      const dir = sortDir === "asc" ? 1 : -1
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir
      if (sortKey === "supervisor") return (a.supervisor ?? "").localeCompare(b.supervisor ?? "") * dir
      if (sortKey === "status") return (a.status - b.status) * dir
      if (sortKey === "contract") return (a.contract - b.contract) * dir
      if (sortKey === "totalCost") return (a.totalCost - b.totalCost) * dir
      if (sortKey === "budget") return (a.budget - b.budget) * dir
      if (sortKey === "variance") return (a.variance - b.variance) * dir
      // margin can be null — push nulls to the end regardless of direction.
      const am = a.margin == null ? Number.NEGATIVE_INFINITY : a.margin
      const bm = b.margin == null ? Number.NEGATIVE_INFINITY : b.margin
      return (am - bm) * dir
    })
  }, [jobRows, deferredPmFilter, sortKey, sortDir])

  function handleSort(key: SortKey) {
    // Same cycle as the list page: default direction → reversed → cleared
    // (back to newest-first).
    const defaultDir: SortDir = key === "name" || key === "supervisor" ? "asc" : "desc"
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir(defaultDir)
    } else if (sortDir === defaultDir) {
      setSortDir(defaultDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(null)
    }
  }

  function loadDetail(job: Job) {
    setDetails((d) => ({ ...d, [job.recnum]: "loading" }))
    // year null: the property page is pinned to All Time, so the inline
    // breakdown matches the all-time figures on the row.
    fetchPageData({
      module: "jobcost",
      queries: ["getBudgetByRecnum", "getAllCostItems"],
      params: { recnum: Number(job.jobNumber), year: null },
    })
      .then((result) => {
        setDetails((d) => ({
          ...d,
          [job.recnum]: {
            budget: (result.getBudgetByRecnum as JobDetail["budget"]) ?? null,
            costItems: Array.isArray(result.getAllCostItems)
              ? (result.getAllCostItems as JobDetail["costItems"])
              : [],
          },
        }))
      })
      .catch(() => {
        setDetails((d) => ({ ...d, [job.recnum]: { budget: null, costItems: [] } }))
      })
  }

  function toggleExpand(job: Job) {
    const willOpen = openJobKey !== job.recnum
    if (willOpen) {
      trackProjectView(job.jobNumber, job.name, "widget")
      if (!details[job.recnum]) loadDetail(job)
    }
    setOpenJobKey(willOpen ? job.recnum : null)
  }

  const activePm = pmStats.find((p) => p.name === pmFilter)
  // The drill-through button NEVER mounts/unmounts (a mounting flex item is
  // a layout shift, and a JS-driven entrance stutters when the table's
  // background re-render commits mid-fade). It always occupies its slot and
  // toggles via a CSS opacity/visibility transition — compositor-driven, so
  // it can't jank. The last openable PM sticks around as the label so the
  // fade-out doesn't blank the text mid-flight.
  const openablePm = canOpenEmployee && activePm && activePm.pmId != null ? activePm : null
  const lastPmRef = useRef<PmStat | null>(null)
  if (openablePm) lastPmRef.current = openablePm
  const gotoPm = openablePm ?? lastPmRef.current

  return (
    <section className="jcd-section">
      <h2 className="jcd-section-title title2 emphasized">Jobs</h2>
      {isLoading ? (
        <Widget loading className="co-widget" />
      ) : (
        <>
          {/* Command bar above the table — the list page's control deck, so
              the Jobs section reads as the same instrument: the PM filter
              leads (control before consequence), count trails on the right.
              Each segment is one quiet line — PM name + their margin, on the
              deck's copper-thumb seg control. */}
          <div className="jc-command-bar pd-jobs-bar">
            {pmStats.length > 0 && (
              <div className="jc-seg pd-pm-seg" role="group" aria-label="Filter jobs by project manager">
                <button
                  type="button"
                  className={`jc-seg-btn${pmFilter == null ? " jc-seg-btn-active" : ""}`}
                  aria-pressed={pmFilter == null}
                  onClick={() => setPmFilter(null)}
                >
                  {pmFilter == null && (
                    <motion.span layoutId="pdPmThumb" className="jc-seg-thumb" transition={SEG_SPRING} />
                  )}
                  <span className="jc-seg-label">All</span>
                </button>
                {pmStats.map((s) => {
                  const pmMargin = s.contract > 0 ? ((s.contract - s.cost) / s.contract) * 100 : null
                  const active = pmFilter === s.name
                  return (
                    <button
                      key={s.name}
                      type="button"
                      className={`jc-seg-btn${active ? " jc-seg-btn-active" : ""}`}
                      aria-pressed={active}
                      title={active ? "Clear PM filter" : `Show only ${s.name}'s jobs`}
                      onClick={() => setPmFilter(active ? null : s.name)}
                    >
                      {active && (
                        <motion.span layoutId="pdPmThumb" className="jc-seg-thumb" transition={SEG_SPRING} />
                      )}
                      <span className="jc-seg-label pd-pm-seg-label">
                        {s.name}
                        {pmMargin != null && (
                          <span
                            className="pd-pm-seg-margin"
                            // Margin-scale color only off the copper thumb —
                            // on it, the class's white keeps the text legible.
                            style={!active && marginColorsOn ? { color: marginTextColor(pmMargin) } : undefined}
                          >
                            {pmMargin.toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {/* Drill-through to the filtered PM's page. Permanently mounted
                (invisible when no PM is filtered) so showing it never moves
                a sibling; the CSS fade keeps the thumb glide the row's one
                focal animation. */}
            {canOpenEmployee && pmStats.some((p) => p.pmId != null) && (
              <button
                type="button"
                className={`jc-cb-dir pd-pm-goto${openablePm ? " pd-pm-goto-visible" : ""}`}
                aria-hidden={!openablePm}
                tabIndex={openablePm ? undefined : -1}
                onClick={() => gotoPm && navigate(`/employees/${gotoPm.pmId}`)}
                title={gotoPm ? `Open ${gotoPm.name}'s page` : undefined}
              >
                <ExternalLink size={13} /> View {gotoPm?.name ?? ""}
              </button>
            )}
            <span className="jc-cb-count">
              {activePm ? (
                <>
                  <span className="jc-cb-count-num">{activePm.jobs}</span> of {jobRows.length} Job{jobRows.length === 1 ? "" : "s"}
                </>
              ) : (
                <>
                  <span className="jc-cb-count-num">{jobRows.length}</span> Job{jobRows.length === 1 ? "" : "s"}
                </>
              )}
            </span>
          </div>
          <Widget className="co-widget jc-table-widget">
            <div ref={tableWrapRef} style={reservedH != null ? { minHeight: reservedH } : undefined}>
              <JobTable
                jobs={tableJobs}
                isManager={isManager}
                marginColorsOn={marginColorsOn}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                openJobKey={openJobKey}
                details={details}
                onToggleExpand={toggleExpand}
                onOpenJob={(job) => goToJobcost(job.jobNumber)}
              />
            </div>
          </Widget>
        </>
      )}
    </section>
  )
}

export default function PropertyDetailPage() {
  const { parent } = useParams<{ parent: string }>()
  if (!parent) {
    return <Page title="Property Not Found"><p>Invalid property.</p></Page>
  }
  return <PropertyDetail slug={parent} />
}

function PropertyDetail({ slug }: { slug: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { goToJobcost } = useJobcostNav()
  const back = (location.state as JobcostBackState | null) ?? null
  const backTo = back?.backTo ?? JOBCOST_BACK_FALLBACK.to
  const backLabel = back?.backLabel ?? JOBCOST_BACK_FALLBACK.label
  const isMobile = useIsMobile()
  const marginColorsOn = useMarginColorsEnabled()
  const { claims } = useAuth()
  const role = effectiveRole(claims["role"] as string | undefined)
  const isManager = role === "manager"
  const showContract = !isManager
  const canOpenClient = role === "executive" || role === "admin"
  const canOpenEmployee = canOpenClient || role === "manager" || role === "generalManager"
  // Managers ride the same scope toggle as the Job Costing list, so the
  // property page shows exactly the membership its card showed.
  const [showAllProjects] = useLocalStorage("jobcostShowAllProjects", false)

  const [rows, setRows] = useState<RawPhaseRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [openKind, setOpenKind] = useState<"phases" | "oneoffs" | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    // isLoading starts true and the deps (role, scope toggle) can't change
    // while this page is mounted, so no loading reset is needed here.
    // Same fetch as the list's grouped view, pinned to All Time (year null):
    // the property's history spans years by definition.
    fetchPageData({
      module: "jobcost",
      queries: ["getPhases"],
      params: { year: null, yearFlag: true, allProjects: isManager ? showAllProjects : null },
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return
        setRows(Array.isArray(result.getPhases) ? (result.getPhases as RawPhaseRow[]) : [])
        setIsLoading(false)
      })
      .catch((err) => {
        if (err.name !== "AbortError") setIsLoading(false)
      })
    return () => controller.abort()
  }, [isManager, showAllProjects])

  // Same membership rule as the list's buildGroups: a job with no parent yet
  // (actr_u row missing) groups under its own name. The URL carries a slug,
  // so candidates are matched by re-slugging their key.
  const members = useMemo(() => {
    const list = rows
      .filter((r) => propertySlug(r.parent?.trim() || r.name || "") === slug)
      .map(normalizeMember)
    // Newest first — the 8-digit recnum encodes creation order.
    list.sort((a, b) => Number(b.recnum) - Number(a.recnum))
    return list
  }, [rows, slug])

  // The real (unslugged) parent key, for display. While loading, the slug
  // with dashes relaxed back to spaces stands in.
  const parentKey = members.length
    ? (rows.find((r) => propertySlug(r.parent?.trim() || r.name || "") === slug)?.parent?.trim() || members[0].name)
    : slug.replace(/-/g, " ")

  const phases = members.filter((m) => !m.oneoff)
  const oneoffs = members.filter((m) => m.oneoff)

  // ── Lifetime rollups (identical math to the property card) ──
  const contract = members.reduce((s, m) => s + m.contract, 0)
  const budget = members.reduce((s, m) => s + m.budget, 0)
  const totalCost = members.reduce((s, m) => s + m.totalCost, 0)
  const margin = contract > 0 ? ((contract - totalCost) / contract) * 100 : null
  const marginColor = !marginColorsOn || margin == null ? undefined : marginTextColor(margin)
  const grossProfit = contract - totalCost
  const budgetVariance = budget - totalCost
  const totalUnits = members.reduce((s, m) => s + m.units, 0)
  const status = members.length ? Math.min(...members.map((m) => m.status)) : null
  const firstClient = members.find((m) => m.clientName)?.clientName ?? ""
  const multiClient = members.some((m) => m.clientName && m.clientName !== firstClient)
  const clientName = multiClient ? "Multiple clients" : firstClient
  const clientId = multiClient ? null : members.find((m) => m.clientId != null)?.clientId ?? null

  // ── Relationship timeline ──
  const firstStart = members.reduce<Date | null>(
    (min, m) => (m.startDate && (!min || m.startDate < min) ? m.startDate : min), null)
  const anyActive = members.some((m) => m.status <= 4)
  const lastCompleted = members.reduce<Date | null>(
    (max, m) => (m.completedDate && (!max || m.completedDate > max) ? m.completedDate : max), null)
  const timelineEnd = anyActive ? new Date() : lastCompleted
  const tenureDays = firstStart && timelineEnd
    ? Math.max(0, Math.round((timelineEnd.getTime() - firstStart.getTime()) / 86_400_000))
    : null
  const lastActivity = members.reduce<Date | null>(
    (max, m) => (m.updatedDate && (!max || m.updatedDate > max) ? m.updatedDate : max), null)

  // ── Phase matrix: the property's composition at a glance ──
  // One row per year, one column per phase number (phases are monthly, so
  // the column IS the phase), each filled cell carrying that job's margin.
  // One-offs (and any misnumbered stragglers) trail the row in their own
  // cluster. Newest year on top. Undatable jobs stay table-only.
  // Placement is kind-first: the oneoff flag ALONE decides which cluster a
  // job renders in (one-offs → trailing cluster, phases → the P columns);
  // column choice is best-effort within that. A phase whose recnum encodes a
  // valid month claims that column outright; the rest fall back to their
  // dated month, or the nearest free column when it's taken. A phase never
  // demotes to the one-off cluster (only a >12-phase year could overflow).
  const matrix = useMemo(() => {
    const byYear = new Map<string, { months: (Member | null)[]; extra: Member[]; loose: Member[] }>()
    const ensure = (y: string) => {
      let row = byYear.get(y)
      if (!row) {
        row = { months: Array<Member | null>(12).fill(null), extra: [], loose: [] }
        byYear.set(y, row)
      }
      return row
    }
    for (const m of members) {
      if (!m.monthKey) continue
      const row = ensure(m.monthKey.slice(0, 4))
      if (m.oneoff) row.extra.push(m)
      else if (m.phaseNum != null && row.months[m.phaseNum - 1] == null) row.months[m.phaseNum - 1] = m
      else row.loose.push(m)
    }
    for (const row of byYear.values()) {
      // Column-less phases settle oldest-first into their dated month, or the
      // nearest free column around it.
      row.loose.sort((a, b) => Number(a.recnum) - Number(b.recnum))
      for (const m of row.loose) {
        const preferred = (m.phaseNum ?? Number(m.monthKey!.slice(5))) - 1
        let slot = -1
        for (let d = 0; d < 12 && slot < 0; d++) {
          for (const c of d === 0 ? [preferred] : [preferred + d, preferred - d]) {
            if (c >= 0 && c < 12 && row.months[c] == null) {
              slot = c
              break
            }
          }
        }
        if (slot >= 0) row.months[slot] = m
        else row.extra.push(m)
      }
      row.extra.sort((a, b) => Number(a.recnum) - Number(b.recnum))
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, row]) => ({ year, months: row.months, extra: row.extra }))
  }, [members])
  const matrixHasExtras = matrix.some((r) => r.extra.length > 0)
  // The trailing cluster is usually pure one-offs, but a phase can land there
  // too (two phases sharing a month) — label and icon it honestly then.
  const matrixExtrasAllOneoff = matrix.every((r) => r.extra.every((m) => m.oneoff))

  // ── Monthly history buckets ──
  const buckets = useMemo<MonthBucket[]>(() => {
    const map = new Map<string, MonthBucket>()
    for (const m of members) {
      if (!m.monthKey) continue
      let b = map.get(m.monthKey)
      if (!b) {
        b = { key: m.monthKey, label: monthLabel(m.monthKey), contract: 0, budget: 0, cost: 0, units: 0, jobs: 0 }
        map.set(m.monthKey, b)
      }
      b.contract += m.contract
      b.budget += m.budget
      b.cost += m.totalCost
      b.units += m.units
      b.jobs += 1
    }
    const active = [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
    if (active.length < 2) return active
    // Fill the span with empty months so gaps in work read as gaps, not as
    // a contiguous history — the axis is the project's real calendar.
    const filled: MonthBucket[] = []
    let [y, mo] = active[0].key.split("-").map(Number)
    const last = active[active.length - 1].key
    for (let key = active[0].key; key <= last; ) {
      filled.push(map.get(key) ?? { key, label: monthLabel(key), contract: 0, budget: 0, cost: 0, units: 0, jobs: 0 })
      mo += 1
      if (mo > 12) { mo = 1; y += 1 }
      key = `${y}-${String(mo).padStart(2, "0")}`
    }
    return filled
  }, [members])

  const monthTicks = thinLabels(buckets.map((b) => b.label), isMobile ? 5 : 12)

  // Margin trend: one weighted margin per month (contract-weighted, so a big
  // phase and a tiny one-off in the same month don't average as equals).
  const marginPoints = buckets.map((b) => ({
    x: b.label,
    y: b.contract > 0 ? ((b.contract - b.cost) / b.contract) * 100 : null,
  }))
  const marginPointCount = marginPoints.filter((p) => p.y != null).length
  // Lifetime average as a quiet dashed reference — "is this month above or
  // below the property's norm" is the whole question the chart answers.
  const marginMarkers: LineMarker[] = margin != null
    ? [{
        axis: "y",
        value: Math.round(margin * 10) / 10,
        legend: `Avg ${margin.toFixed(1)}%`,
        lineStyle: { stroke: "var(--secondary-text)", strokeWidth: 1, strokeDasharray: "4 4", strokeOpacity: 0.7 },
        textStyle: { fill: "var(--secondary-text)", fontSize: 11, fontWeight: 600 },
        labelBackground: "var(--card-color)",
      }]
    : []

  // Units delivered per month — the property-native volume read (phases carry
  // per-job unit counts). Only meaningful once at least two months have units.
  const unitBars = buckets.map((b) => ({ label: b.label, value: b.units }))
  const unitMonthCount = buckets.filter((b) => b.units > 0).length
  // Tooltip with the month's story, not just the bar height: units delivered
  // plus the month's contract volume.
  const unitsTooltip = (label: string, value: number) => {
    const b = buckets.find((x) => x.label === label)
    if (!b || (b.jobs === 0 && value === 0)) {
      return (
        <div className="chart-line-tooltip">
          <div className="chart-line-tooltip-header">{label}</div>
          <div className="chart-line-tooltip-row">
            <span className="chart-line-tooltip-label">No work this month</span>
          </div>
        </div>
      )
    }
    return (
      <div className="chart-line-tooltip">
        <div className="chart-line-tooltip-header">{label}</div>
        <div className="chart-line-tooltip-row">
          <span className="chart-line-tooltip-label">Units</span>
          <span className="chart-line-tooltip-value">{Math.round(value)}</span>
        </div>
        <div className="chart-line-tooltip-row">
          <span className="chart-line-tooltip-label">Contract</span>
          <span className="chart-line-tooltip-value">{formatMoney(b.contract)}</span>
        </div>
      </div>
    )
  }
  // Units are whole numbers — hand the axis explicit integer ticks, otherwise
  // nivo picks fractional steps on small maxima and the rounded labels repeat
  // ("1, 1, 1"). Step up so the axis never exceeds ~7 ticks.
  const unitTicks = useMemo(() => {
    const max = Math.max(0, ...buckets.map((b) => b.units))
    const step = Math.max(1, Math.ceil(max / 6))
    const top = Math.ceil(max / step) * step
    const ticks: number[] = []
    for (let v = 0; v <= top; v += step) ticks.push(v)
    return ticks
  }, [buckets])
  const showUnitsChart = isLoading || unitMonthCount >= 2

  // A single month of history is a fact, not a trend — with fewer than two
  // months of margin data (and no unit history either) the whole Performance
  // History section stays hidden. While loading it renders with skeletons.
  const showMarginChart = isLoading || marginPointCount >= 2
  const showHistory = showMarginChart || showUnitsChart

  // ── PM history ──
  const pmStats = useMemo(() => {
    const map = new Map<string, { name: string; pmId: number | null; jobs: number; contract: number; cost: number }>()
    for (const m of members) {
      if (!m.pmName) continue
      let s = map.get(m.pmName)
      if (!s) {
        s = { name: m.pmName, pmId: m.pmId, jobs: 0, contract: 0, cost: 0 }
        map.set(m.pmName, s)
      }
      s.jobs += 1
      s.contract += m.contract
      s.cost += m.totalCost
    }
    return [...map.values()].sort((a, b) => b.jobs - a.jobs)
  }, [members])

  // ── Foot table: the list page's Project-view table, reused ──
  // The same member rows again, in the list page's Job shape, so the foot
  // table IS the Project view: rows expand to the contract/cost summaries +
  // cost breakdown, and View opens the full report.
  const jobRows = useMemo<Job[]>(
    () =>
      rows
        .filter((r) => propertySlug(r.parent?.trim() || r.name || "") === slug)
        .map((r) => normalizeProject(r as unknown as RawProject)),
    [rows, slug]
  )

  const openJob = (m: Member) => goToJobcost(m.recnum)
  const notFound = !isLoading && members.length === 0

  // Dev-only breadcrumb for the "charts say no data" reports we can't repro
  // without prod auth: shows exactly which derivation stage came up empty.
  useEffect(() => {
    if (isLoading || !import.meta.env.DEV) return
    console.debug("[property-detail]", {
      slug,
      rows: rows.length,
      members: members.length,
      buckets: buckets.length,
      marginMonths: marginPointCount,
      sample: members[0] ? { recnum: members[0].recnum, monthKey: members[0].monthKey, contract: members[0].contract } : null,
    })
  }, [isLoading, slug, rows.length, members, buckets.length, marginPointCount])

  const subtitle = !isLoading && status != null ? (
    <span className="jcd-subtitle">
      <span className={`status-badge status-${status}`}>
        {JOB_STATUS_LABELS[status] ?? status}
      </span>
      <span>{members.length} job{members.length === 1 ? "" : "s"}</span>
    </span>
  ) : isLoading ? (
    <span className="jcd-subtitle">
      <span className="status-badge jcd-badge-empty" aria-hidden="true">&nbsp;</span>
    </span>
  ) : undefined

  return (
    <Page
      title={parentKey}
      subtitle={subtitle}
      actions={
        isMobile ? undefined : (
          <button className="jc-export-btn" onClick={() => navigate(backTo)} title={`Back to ${backLabel}`}>
            <ArrowLeft size={14} /> {backLabel}
          </button>
        )
      }
    >
      {notFound ? (
        <Widget className="co-widget">
          <div className="widget-no-data">
            <Building2 size={24} className="widget-no-data-icon" />
            <span className="body-text">No jobs found for this property.</span>
          </div>
        </Widget>
      ) : (
      <MotionList className="jcd-sections">

        {/* ── Overview ─────────────────────────────────────────────── */}
        <MotionItem>
          <section className="jcd-section jcd-overview-section">
            <div className="jc-group-overview jcd-hero pd-hero">
              {/* Backdrop building — the property lens's signature mark. */}
              {!isMobile && (
                <div className="pd-hero-art" aria-hidden="true">
                  <BuildingArt />
                </div>
              )}
              {/* Verdict order mirrors the list page's property view:
                  Volume → Margin → Gross Profit, then Units. */}
              <div className="jcd-facts">
                {showContract && (
                  <Fact
                    label={isLoading ? <SkelText ch={12} /> : "Contract Volume"}
                    value={isLoading ? <SkelText ch={8} /> : formatMoneyFull(contract)}
                  />
                )}
                <Fact
                  label={isLoading ? <SkelText ch={11} /> : "Lifetime Margin"}
                  value={isLoading ? <SkelText ch={5} /> : margin == null ? "—" : `${margin.toFixed(1)}%`}
                  valueColor={marginColor}
                />
                {showContract ? (
                  <Fact
                    label={isLoading ? <SkelText ch={9} /> : "Gross Profit"}
                    value={isLoading ? <SkelText ch={8} /> : formatMoneyFull(grossProfit)}
                    valueColor={marginColor ?? (!isLoading && grossProfit < 0 ? "#ef4444" : undefined)}
                  />
                ) : (
                  <Fact
                    label={isLoading ? <SkelText ch={9} /> : budgetVariance < 0 ? "Budget Exceeded" : "Budget Remaining"}
                    value={isLoading ? <SkelText ch={8} /> : formatMoneyFull(Math.abs(budgetVariance))}
                    valueColor={isLoading ? undefined : budgetVariance < 0 ? "#ef4444" : "#22c55e"}
                  />
                )}
                <Fact
                  label={isLoading ? <SkelText ch={5} /> : "Units"}
                  value={isLoading ? <SkelText ch={3} /> : totalUnits > 0 ? String(totalUnits) : "—"}
                  // The kind counts live atop the matrix on desktop; when the
                  // matrix can't render (mobile, undatable jobs) they fold in
                  // here so the split is never lost.
                  sub={
                    isLoading || (!isMobile && matrix.length > 0)
                      ? undefined
                      : `${phases.length} phase${phases.length === 1 ? "" : "s"} · ${oneoffs.length} one-off${oneoffs.length === 1 ? "" : "s"}`
                  }
                />
              </div>

              {/* The property's composition as a year × phase matrix: rows
                  are years (newest first), columns are phase numbers, each
                  filled cell shows that job's margin and opens its report.
                  One-offs trail the row in their own cluster. The kind counts
                  head the grid — they're its caption. Loaded-only — the
                  grid's shape is unknowable while loading. Desktop-only:
                  12 columns don't fit a phone. */}
              {!isMobile && !isLoading && matrix.length > 0 && (
                <div className="pd-matrix">
                  <div className="pd-matrix-counts">
                    <span className="pd-matrix-count">
                      <Building2 size={13} />
                      {phases.length} Phase{phases.length === 1 ? "" : "s"}
                    </span>
                    <span className="pd-matrix-count">
                      <Hammer size={13} />
                      {oneoffs.length} One-Off{oneoffs.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="pd-matrix-row pd-matrix-head" aria-hidden="true">
                    <span className="pd-matrix-year" />
                    {Array.from({ length: 12 }, (_, i) => (
                      <span key={i} className="pd-matrix-col-label">P{i + 1}</span>
                    ))}
                    {matrixHasExtras && (
                      <span className="pd-matrix-col-label pd-matrix-extra-label">
                        {matrixExtrasAllOneoff ? "One-Offs" : "Other"}
                      </span>
                    )}
                  </div>
                  {matrix.map((row) => (
                    <div key={row.year} className="pd-matrix-row">
                      <span className="pd-matrix-year">'{row.year.slice(2)}</span>
                      {row.months.map((cell, i) =>
                        cell ? (
                          <button
                            key={i}
                            type="button"
                            className="pd-cell pd-cell-tip"
                            onClick={() => openJob(cell)}
                            style={marginColorsOn && cell.margin != null
                              ? { color: marginTextColor(cell.margin) }
                              : undefined}
                          >
                            {cell.margin == null ? "—" : `${Math.round(cell.margin)}%`}
                            <span className="pd-tip">
                              <span
                                className="pd-tip-status"
                                style={{ color: JOB_STATUS_COLORS[cell.status] ?? JOB_STATUS_COLORS[6] }}
                              >
                                {JOB_STATUS_LABELS[cell.status] ?? cell.status}
                              </span>
                              {`P${i + 1} ${row.year}`}
                              {showContract && <>{"\n"}{formatMoneyFull(cell.contract)}</>}
                            </span>
                          </button>
                        ) : (
                          <span key={i} className="pd-cell pd-cell-empty" />
                        )
                      )}
                      {row.extra.length > 0 && (
                        <span className="pd-matrix-extras">
                          {row.extra.map((m) => (
                            <button
                              key={m.recnum}
                              type="button"
                              className="pd-cell pd-cell-extra pd-cell-tip"
                              onClick={() => openJob(m)}
                            >
                              {m.oneoff ? <Hammer size={10} /> : <Building2 size={10} />}
                              <span
                                style={marginColorsOn && m.margin != null
                                  ? { color: marginTextColor(m.margin) }
                                  : undefined}
                              >
                                {m.margin == null ? "—" : `${Math.round(m.margin)}%`}
                              </span>
                              <span className="pd-tip">
                                <span
                                  className="pd-tip-status"
                                  style={{ color: JOB_STATUS_COLORS[m.status] ?? JOB_STATUS_COLORS[6] }}
                                >
                                  {JOB_STATUS_LABELS[m.status] ?? m.status}
                                </span>
                                {m.name}
                                {showContract && <>{"\n"}{formatMoneyFull(m.contract)}</>}
                              </span>
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="jcd-meta-row">
                {(isLoading || clientName) && (
                  <Meta
                    label={isLoading ? <SkelText ch={6} /> : "Client"}
                    value={isLoading ? <SkelText ch={16} /> : clientName}
                    onClick={!isLoading && canOpenClient && clientId != null
                      ? () => navigate(`/clients/${clientId}`)
                      : undefined}
                  />
                )}
                {(isLoading || lastActivity) && (
                  <Meta
                    label={isLoading ? <SkelText ch={7} /> : "Last Activity"}
                    value={isLoading ? <SkelText ch={9} /> : fmtLongDate(lastActivity!)}
                  />
                )}
              </div>

              {/* Loaded-only, like the project page's timeline: the strip only
                  exists once data confirms the property has dated work. */}
              {!isLoading && firstStart && timelineEnd && (
                <div className="jcd-timeline">
                  <div className="jcd-tl-cap">
                    <span className="jcd-tl-cap-label subheadline">First Job Started</span>
                    <span className="jcd-tl-cap-date body-text emphasized">{fmtLongDate(firstStart)}</span>
                  </div>
                  <div className="jcd-tl-line">
                    <span className="jcd-tl-dot" />
                    <span className="jcd-tl-rule" />
                    {tenureDays != null && <span className="jcd-tl-days footnote">{tenureLabel(tenureDays)}</span>}
                    <span className="jcd-tl-rule" />
                    <span className={`jcd-tl-dot ${anyActive ? "jcd-tl-dot-open" : "jcd-tl-dot-done"}`} />
                  </div>
                  <div className="jcd-tl-cap jcd-tl-cap-end">
                    <span className="jcd-tl-cap-label subheadline">{anyActive ? "Active" : "Last Completed"}</span>
                    <span className="jcd-tl-cap-date body-text emphasized">{anyActive ? "Today" : fmtLongDate(timelineEnd)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Rolling vs one-off ledger — the property card's two sub-cards,
                in the detail pages' two-column ledger dress. Each column
                drills into its kind's job list. */}
            <div className="card jcd-ledger">
              <KindLedgerCol
                icon={<Building2 size={13} />}
                title="Rolling Phase Work"
                singular="Phase"
                plural="Phases"
                members={phases}
                loading={isLoading}
                showContract={showContract}
                marginColorsOn={marginColorsOn}
                onOpen={() => setOpenKind("phases")}
              />
              <KindLedgerCol
                icon={<Hammer size={13} />}
                title="One-Off Work"
                singular="One-Off"
                plural="One-Offs"
                members={oneoffs}
                loading={isLoading}
                showContract={showContract}
                marginColorsOn={marginColorsOn}
                onOpen={() => setOpenKind("oneoffs")}
              />
            </div>
          </section>
        </MotionItem>

        {/* ── Performance History ──────────────────────────────────── */}
        {showHistory && (
          <MotionItem>
            <section className="jcd-section">
              <h2 className="jcd-section-title title2 emphasized">Performance History</h2>
              <div className="widget-grid widget-grid-2">
                {showMarginChart && (
                  <div className="col-span-full">
                    <Widget
                      title="Margin by Month"
                      loading={isLoading}
                      noData={!isLoading && marginPointCount === 0}
                      className="jcd-chart-widget"
                      skeleton={<ChartAreaSkeleton />}
                    >
                      <Chart config={{
                        type: "line",
                        // Single series, no legend (the title names it). With
                        // margin colors on, the line itself wears the margin
                        // scale — a vertical gradient plus per-point fills — so
                        // height and color tell the same story; off, it falls
                        // back to the default brand orange.
                        series: [{ id: "Margin", data: marginPoints }],
                        enableArea: false,
                        legend: false,
                        compactTop: true,
                        disableGrowthTooltip: true,
                        yFormat: (v) => `${v.toFixed(1)}%`,
                        axisBottomTickValues: monthTicks,
                        bridgeGaps: true,
                        markers: marginMarkers,
                        valueColor: marginColorsOn ? (v) => marginTextColor(v) : undefined,
                      }} />
                    </Widget>
                  </div>
                )}

                {showUnitsChart && (
                  <div className="col-span-full">
                    <Widget
                      title="Units by Month"
                      loading={isLoading}
                      noData={!isLoading && unitMonthCount < 2}
                      className="jcd-chart-widget"
                      skeleton={<ChartAreaSkeleton />}
                    >
                      <Chart config={{
                        type: "bar",
                        data: unitBars,
                        compactTop: true,
                        color: COLOR_UNITS,
                        barGradient: true,
                        barTooltip: unitsTooltip,
                        yFormat: (v) => String(Math.round(v)),
                        // Axis top rides the last tick so a max that lands
                        // between steps still sits under the top gridline.
                        maxValue: unitTicks[unitTicks.length - 1],
                        axisLeftTickValues: unitTicks,
                        axisBottomTickValues: monthTicks,
                      }} />
                    </Widget>
                  </div>
                )}
              </div>
            </section>
          </MotionItem>
        )}

        {/* ── Jobs ─────────────────────────────────────────────────── */}
        <MotionItem>
          <JobsSection
            jobRows={jobRows}
            pmStats={pmStats}
            isLoading={isLoading}
            isManager={isManager}
            marginColorsOn={marginColorsOn}
            canOpenEmployee={canOpenEmployee}
          />
        </MotionItem>
      </MotionList>
      )}

      <KindJobsModal
        open={openKind === "phases"}
        title="Rolling Phase Work"
        members={phases}
        showContract={showContract}
        marginColorsOn={marginColorsOn}
        onClose={() => setOpenKind(null)}
        onOpen={openJob}
      />
      <KindJobsModal
        open={openKind === "oneoffs"}
        title="One-Off Work"
        members={oneoffs}
        showContract={showContract}
        marginColorsOn={marginColorsOn}
        onClose={() => setOpenKind(null)}
        onOpen={openJob}
      />
    </Page>
  )
}
