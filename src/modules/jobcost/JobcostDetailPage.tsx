import { useState, useEffect, useMemo, useRef, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Building2, ChevronDown, ChevronLeft, ChevronRight, Download, Hammer, Plus, X } from "lucide-react"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { downloadXlsx } from "../../shared/utils/exportXlsx"
import { buildJobCostXlsx } from "./exportJobCostXlsx"
import { CostBreakdownTable, CostBreakdownSkeleton } from "./components/CostBreakdownTable"
import { SkelText } from "../../shared/components/SkelText"
import { PieWithListSkeleton, ChartAreaSkeleton } from "../../shared/components/Chart/ChartSkeletons"
import { computeCostGroups, type BudgetBreakdown, type CostItem } from "./types"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { Widget } from "../../shared/components/Widget/Widget"
import { Badge } from "../../shared/components/Badge"
import { invoiceStatusLabel, invoiceStatusTone } from "../../shared/utils/invoiceStatus"
import { Chart } from "../../shared/components/Chart/Chart"
import { ChartLegend } from "../../shared/components/Chart/ChartLegend"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { fetchPageData } from "../../shared/api/pageApi"
import { formatMoneyFull, formatDate, marginTextColor } from "../../shared/utils/format"
import useIsMobile from "../../shared/hooks/useIsMobile"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import useHashedRelationColors from "../../shared/hooks/useHashedRelationColors"
import { JOB_STATUS_LABELS } from "../directory/directoryShared"
import { SummaryRow } from "./Jobcost"
import { ChangeOrderModal } from "../change-orders/components/ChangeOrderModal"
import type { ChangeOrder } from "../change-orders/types"
import type { SpendItem, LineMarker } from "../../shared/components/Chart/chart.types"
import { computeWeeklySpend, computeCostVsBilled, thinLabels, type DailySpend } from "./weeklySpend"
import { colorRamp, hashColor, RAMP_SCHEMES } from "../../shared/config/chartColors"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { DrillDownModal, type DrillRow } from "../../shared/components/DrillDownModal/DrillDownModal"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { JOBCOST_BACK_FALLBACK, useJobcostNav, type JobcostBackState } from "./useJobcostNav"
import { Fact, Meta } from "./detailPrimitives"
import { oneoffFromRecnum, parseValidDate, fmtLongDate, propertySlug } from "./jobcostShared"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole, isTechRole } from "../../core/auth/roles"
import { trackProjectView } from "../../shared/analytics/analytics"


type InvSortKey = "num" | "date" | "status" | "total" | "paid" | "remaining"
type CoSortKey = "num" | "name" | "budget" | "contract"
type PhaseSortKey = "num" | "name" | "status" | "pm" | "units" | "contract" | "cost" | "margin"

// ─── Backend shapes ──────────────────────────────────────────────────
interface Phase {
  recnum: string
  name: string
  status: number
  pmId?: number | null
  pmName: string | null
  // Enriched fields carried through consolidatePhasesIntoProjects — optional
  // until the backend that emits them is deployed.
  unitCount?: number | string | null
  startDate?: string | null
  completedDate?: string | null
  totalContract?: number
  totalCost?: number
  budget?: number
  margin?: number | null
  // actrec.insusr — the backend emits it only for the tech role, and only
  // when the column exists in this Sage install.
  createdBy?: string | null
}
interface Project {
  recnum: string
  name: string
  status: number
  originalContract: number
  changeOrderAmount: number
  totalContract: number
  totalBudget: number
  totalCost: number
  totalIncome: number
  totalMargin: number | null
  phases: Phase[]
  // Consolidated rollups (actrec.usrdf1 units; sttdte/cmpdte dates; committed
  // POs + subs; client) — optional until the emitting backend is deployed.
  totalUnitCount?: number
  totalCommitted?: number
  clientId?: number | null
  clientName?: string | null
  startDate?: string | null
  completedDate?: string | null
  // Sage actr_u.parent (shared-address grouping key) — powers the Property
  // meta link. Optional until the emitting backend is deployed.
  parent?: string | null
  // Sage actr_u.oneoff (1 = non-phase project). Null/absent when the lazily
  // created custom-field row doesn't exist — fall back to the recnum suffix.
  oneoff?: number | null
  // actrec.insusr (see Phase.createdBy) — first non-null across phases.
  createdBy?: string | null
}
interface MonthlyCost { year: number; month: number; spending: number }
interface JobInvoice {
  id: string
  invoiceNum: string
  description: string | null
  total: number
  invoiceDate: string
  status: number
  amountPaid: number
  amountRemaining: number
}
// One job's billing position: how much has been billed vs. how much *should* be
// billed (earned via cost-to-cost % of completion). `variance` (expected −
// billed) is positive when under-billed, negative when over-billed. Mirrors the
// dashboard Progress Billings row so the two reconcile.
interface ProgressBilling {
  contract: number
  budget: number
  cost: number
  billed: number
  expected: number
  billedPct: number // billed ÷ contract (0–1)
  expectedPct: number // earned ÷ contract (0–1) = % complete
  variance: number
  hasBudget: boolean
}

// Fact / Meta / date helpers live in detailPrimitives.tsx, shared with the
// property detail page so both heroes render identically.

// ─── Phase rail ──────────────────────────────────────────────────────
// One member of this job's property, in the hero rail's cycle order:
// phases chronologically (recnum encodes creation order), one-offs
// trailing — the same split the property page's matrix draws.
interface RailSib {
  recnum: string
  name: string
  oneoff: boolean
  label: string
}

// Minimal slice of the property fetch's rows the rail needs.
interface RailRow {
  recnum: string | number
  name: string
  parent?: string | null
  oneoff?: number | null
  oofnme?: string | null
}

// The membership list doesn't depend on WHICH property — parent only
// filters it — so it's fetched in parallel with the page load (waiting for
// the page to reveal the parent made the rail pop in a beat late) and
// cached module-level so job-to-job hops don't refetch it.
const railRowsCache = new Map<string, { at: number; promise: Promise<RailRow[]> }>()
const RAIL_CACHE_TTL = 120_000

function fetchRailRows(allProjects: boolean | null): Promise<RailRow[]> {
  const key = String(allProjects)
  const hit = railRowsCache.get(key)
  if (hit && Date.now() - hit.at < RAIL_CACHE_TTL) return hit.promise
  const promise = fetchPageData({
    module: "jobcost",
    queries: ["getPhases"],
    params: { year: null, yearFlag: true, allProjects },
  }).then(r => (Array.isArray(r.getPhases) ? (r.getPhases as RailRow[]) : []))
  // A failed fetch shouldn't poison the cache window.
  promise.catch(() => railRowsCache.delete(key))
  railRowsCache.set(key, { at: Date.now(), promise })
  return promise
}

function buildRailSibs(rows: RailRow[], slug: string): RailSib[] {
  const members = rows
    .filter(r => propertySlug(r.parent?.trim() || r.name || "") === slug)
    .map(r => {
      const rec = String(r.recnum).trim()
      const oneoff = r.oneoff != null ? r.oneoff === 1 : oneoffFromRecnum(rec)
      return {
        recnum: rec,
        oneoff,
        // One-offs go by their given name (oofnme) when Sage has one —
        // same display rule as the property page.
        name: (oneoff ? r.oofnme?.trim() : null) || r.name,
      }
    })
  const phases = members.filter(m => !m.oneoff).sort((a, b) => Number(a.recnum) - Number(b.recnum))
  const oneoffs = members.filter(m => m.oneoff).sort((a, b) => Number(a.recnum) - Number(b.recnum))
  // "P3" alone is ambiguous once the property spans years — add 'YY then.
  const multiYear = new Set(phases.map(p => (/^\d{8,9}$/.test(p.recnum) ? p.recnum.slice(0, 2) : ""))).size > 1
  const phaseLabel = (rec: string) => {
    if (/^\d{8,9}$/.test(rec)) {
      const mm = Number(rec.slice(-2))
      if (mm >= 1 && mm <= 12) return `P${mm}${multiYear ? ` '${rec.slice(0, 2)}` : ""}`
    }
    return `#${rec}`
  }
  return [
    ...phases.map(p => ({ ...p, label: phaseLabel(p.recnum) })),
    ...oneoffs.map(o => ({ ...o, label: o.name })),
  ]
}

// Change-order list in the app's reports-modal shape, opened from the
// Contract Summary's Change Orders drill row. Rows drill through to the
// existing ChangeOrderModal detail view (stacked above via useModalLayer).
function ChangeOrderListModal({ open, onClose, changeOrders, originalContract, onSelect }: {
  open: boolean
  onClose: () => void
  changeOrders: ChangeOrder[]
  originalContract: number
  onSelect: (co: ChangeOrder) => void
}) {
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(open)
  const sort = useTableSort<CoSortKey>()
  const sorted = applySort(changeOrders, sort, (co, key) => {
    switch (key) {
      case "num": return Number(co.chgnum ?? co.recnum) || 0
      case "name": return co.name
      case "budget": return co.budget == null ? null : Number(co.budget)
      case "contract": return Number(co.total) || 0
    }
  })
  const totalContract = changeOrders.reduce((s, co) => s + (Number(co.total) || 0), 0)
  const totalBudget = changeOrders.reduce((s, co) => s + (Number(co.budget) || 0), 0)
  const pctOfOriginal = originalContract > 0 ? (totalContract / originalContract) * 100 : null
  const subtitle = [
    `${changeOrders.length} order${changeOrders.length === 1 ? "" : "s"}`,
    `${totalContract > 0 ? "+" : ""}${formatMoneyFull(totalContract)} to contract`,
    pctOfOriginal != null ? `${pctOfOriginal.toFixed(1)}% of original` : null,
  ].filter(Boolean).join(" · ")

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
              className="modal reports-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <div className="reports-modal-title">
                  <div>
                    <h2 className="title2 emphasized">Change Orders</h2>
                    <span className="reports-modal-subtitle">{subtitle}</span>
                  </div>
                </div>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              <div className="reports-modal-body">
                <table className="data-table billings-invoice-table">
                  <thead>
                    <tr>
                      <SortableHeader label="CO #" columnKey="num" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                      <SortableHeader label="Description" columnKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                      <SortableHeader label="Budget" columnKey="budget" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                      <SortableHeader label="Contract" columnKey="contract" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(co => {
                      const coBudget = co.budget == null ? null : Number(co.budget)
                      const contract = Number(co.total) || 0
                      return (
                        <tr
                          key={co.recnum}
                          className="clickable-row"
                          onClick={() => onSelect(co)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => e.key === "Enter" && onSelect(co)}
                        >
                          <td>#{co.chgnum ?? co.recnum}</td>
                          <td>{co.name}</td>
                          <td className="num text-secondary">{coBudget == null ? "—" : formatMoneyFull(coBudget)}</td>
                          <td className={`num ${contract >= 0 ? "jc-margin-high" : "jc-margin-critical"}`}>
                            {contract > 0 ? "+" : ""}{formatMoneyFull(contract)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total</td>
                      <td className="num">{totalBudget ? `${totalBudget > 0 ? "+" : ""}${formatMoneyFull(totalBudget)}` : "—"}</td>
                      <td className="num">{totalContract > 0 ? "+" : ""}{formatMoneyFull(totalContract)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default function JobcostDetailPage() {
  const { recnum } = useParams<{ recnum: string }>()
  const numericId = Number(recnum)
  if (!recnum || isNaN(numericId)) {
    return <Page title="Job Not Found"><p>Invalid job ID.</p></Page>
  }

  return (
    <PageDataProvider
      module="jobcostDetail"
      queries={["getPhases", "getBudgetByRecnum", "getAllCostItems", "getJobMonthlySpend", "getJobDailySpend", "getJobInvoices", "getProgressBilling"]}
      params={{ recnum: numericId }}
    >
      <JobcostDetail recnum={recnum} />
    </PageDataProvider>
  )
}

function JobcostDetail({ recnum }: { recnum: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { goToProperty } = useJobcostNav()
  const back = (location.state as JobcostBackState | null) ?? null
  const backTo = back?.backTo ?? JOBCOST_BACK_FALLBACK.to
  const backLabel = back?.backLabel ?? JOBCOST_BACK_FALLBACK.label
  const marginColorsOn = useMarginColorsEnabled()
  const hashedRelationColors = useHashedRelationColors()
  // The Client / PM meta values drill through to their directory pages, but
  // only for roles the target routes admit (mirrors Router.tsx's RequireRole
  // allow-lists) — otherwise the click would just bounce off the role guard.
  const { claims } = useAuth()
  const role = effectiveRole(claims["role"] as string | undefined)
  // Raw claim, not the effective role: `tech` collapses to executive for
  // access checks, but the Sage "Created By" audit field is tech-only.
  const isTech = isTechRole(claims["role"] as string | undefined)
  const canOpenClient = role === "executive" || role === "admin"
  const canOpenEmployee = canOpenClient || role === "manager" || role === "generalManager"
  const isManager = role === "manager"
  // "+ Change Order" mirrors the /change-orders route's create tier: managers
  // are view-only there, so they don't get the shortcut here either.
  const canCreateCO = canOpenClient || role === "generalManager"
  // Managers ride the same scope toggle as the list + property pages, so the
  // rail cycles exactly the membership those views show.
  const [showAllProjects] = useLocalStorage("jobcostShowAllProjects", false)
  // Mobile: a slim header — just the job name with status + PM beneath
  // (mirroring the Job Costing list rows). The job number, back button and
  // export are desktop-only; the bottom nav covers navigation on mobile.
  const isMobile = useIsMobile()
  const { data, isLoading } = useWidgetData<{
    getPhases: Project[] | null
    getBudgetByRecnum: BudgetBreakdown | null
    getAllCostItems: CostItem[] | null
    getJobMonthlySpend: MonthlyCost[] | null
    getJobDailySpend: DailySpend[] | null
    getJobInvoices: JobInvoice[] | null
    getProgressBilling: ProgressBilling | null
  }>(["getPhases", "getBudgetByRecnum", "getAllCostItems", "getJobMonthlySpend", "getJobDailySpend", "getJobInvoices", "getProgressBilling"])

  const project = data?.getPhases?.[0] ?? null

  // Sage "Created By" (actrec.insusr) — tech-only, and the backend only sends
  // it to that role. Phases of one job can be entered by different users, so
  // show the unique set.
  const createdBy = isTech
    ? Array.from(new Set(
        (project?.phases ?? []).map((p) => p.createdBy).filter((v): v is string => !!v)
      )).join(", ") || project?.createdBy || null
    : null

  // Record a project_view once the job's name has resolved — one event per job
  // opened (the ref guards against re-fires on unrelated re-renders / data
  // refreshes while staying on the same job).
  const trackedRecnum = useRef<string | null>(null)
  useEffect(() => {
    if (!project?.name) return
    if (trackedRecnum.current === recnum) return
    trackedRecnum.current = recnum
    trackProjectView(recnum, project.name)
  }, [recnum, project?.name])
  const budget = data?.getBudgetByRecnum ?? null
  const costItems = Array.isArray(data?.getAllCostItems) ? data.getAllCostItems : []
  const monthlyCosts = Array.isArray(data?.getJobMonthlySpend) ? data.getJobMonthlySpend : []
  const dailySpend = Array.isArray(data?.getJobDailySpend) ? data.getJobDailySpend : []
  const invoices = Array.isArray(data?.getJobInvoices) ? data.getJobInvoices : []
  const pb = data?.getProgressBilling ?? null

  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [selectedCO, setSelectedCO] = useState<ChangeOrder | null>(null)
  // Change-order list modal, opened from the Contract Summary's drill row.
  const [coListOpen, setCoListOpen] = useState(false)
  // "+ Change Order" header shortcut → the create wizard with this job
  // preselected; a successful submit bumps coVersion to refetch the list.
  const [creatingCO, setCreatingCO] = useState(false)
  const [coVersion, setCoVersion] = useState(0)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  // Invoice records live behind the Billing Position card's disclosure strip —
  // the position is the conclusion, the invoices are its evidence on demand.
  const [invoicesOpen, setInvoicesOpen] = useState(false)
  // Drill-down for the two spending pies: a category slice lists who was paid
  // within it (rows drill through to that vendor's line items); a vendor slice
  // lists what that vendor was paid for. Rendered in the app's standard
  // reports-modal table (committed/posted split, sortable, footer total).
  const [drill, setDrill] = useState<{
    title: string
    subtitle: string
    labelHeader: string
    rows: DrillRow[]
    canDrillVendors?: boolean
  } | null>(null)

  // Three-state sorts (desc → asc → natural) on every money/date column, same
  // as the app's other in-widget tables. Natural order is the backend's:
  // invoices newest-first, phases by number. (Change orders sort inside
  // their own list modal.)
  const invSort = useTableSort<InvSortKey>()
  const phaseSort = useTableSort<PhaseSortKey>()

  useEffect(() => {
    // Reset immediately: the phase rail / arrow keys make rapid job swaps easy,
    // and a stale list must not show (or export) under the new job. The flag
    // also drops an out-of-order resolve from a previous recnum.
    setChangeOrders([])
    let stale = false
    fetchPageData({ module: "changeOrders", queries: [], params: { jobnum: recnum } })
      .then(result => { if (!stale && Array.isArray(result)) setChangeOrders(result as ChangeOrder[]) })
      .catch(() => { if (!stale) setChangeOrders([]) })
    return () => { stale = true }
  }, [recnum, coVersion])

  // ── Phase rail data ──
  // The property's full membership, from the same all-time getPhases fetch
  // the property page runs (cached module-level, fired at mount in PARALLEL
  // with the page provider — see fetchRailRows), filtered client-side by
  // parent slug the moment both land. Kept outside the page provider so the
  // rail SURVIVES a phase swap: the provider holds the previous phase's
  // data while loading, so `parent` — and with it the rail — persists.
  const [railRows, setRailRows] = useState<RailRow[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchRailRows(isManager ? showAllProjects : null)
      .then(rows => { if (alive) setRailRows(rows) })
      .catch(() => {})
    return () => { alive = false }
  }, [isManager, showAllProjects])
  const parent = project?.parent?.trim() || null
  const activeRail = useMemo(() => {
    if (!railRows || !parent) return null
    const slug = propertySlug(parent)
    return { slug, parent, sibs: buildRailSibs(railRows, slug) }
  }, [railRows, parent])

  // Rail swaps preserve the ORIGINAL back state instead of going through
  // goToJobcost — deriving it here would point the back button at the phase
  // just left, chaining it through every phase visited.
  const railIdx = activeRail ? activeRail.sibs.findIndex(s => s.recnum === recnum) : -1
  const railPrev = railIdx > 0 ? activeRail!.sibs[railIdx - 1] : null
  const railNext = railIdx >= 0 && railIdx < activeRail!.sibs.length - 1 ? activeRail!.sibs[railIdx + 1] : null
  function swapPhase(rec: string) {
    navigate(`/jobcost/${rec}`, { state: back ?? undefined })
  }

  // ←/→ cycle the rail — skipped while typing or while any modal is up, so
  // the arrows can't yank the page out from under an open detail view.
  const modalOpen = coListOpen || selectedCO != null || drill != null || selectedInvoiceId != null
  useEffect(() => {
    if (!railPrev && !railNext) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (modalOpen) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return
      if (e.key === "ArrowLeft" && railPrev) swapPhase(railPrev.recnum)
      else if (e.key === "ArrowRight" && railNext) swapPhase(railNext.recnum)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // Cost-type groups + totals (shared with the Cost Breakdown table and the
  // Job Costing list's inline view).
  const { groups, totalBudget, totalActual } = computeCostGroups(budget, costItems)

  // Spending by budget category (pie) — click a category to drill into who
  // was paid within it.
  const typeSpend: SpendItem[] = groups
    .filter(g => g.actual > 0)
    .map(g => ({ id: g.key, label: g.key, value: g.actual }))

  // Top vendors / sources by total cost (pie)
  const vendorSpend: SpendItem[] = (() => {
    const totals = new Map<string, number>()
    for (const c of costItems) {
      const amt = (c.committedAmount || 0) + (c.postedAmount || 0)
      if (amt > 0) totals.set(c.id, (totals.get(c.id) ?? 0) + amt)
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ id: label, label, value }))
  })()

  // Weekly buckets — jobs span ~a month, so weeks are the readable resolution.
  // Phones fit fewer x labels; thin from the end so the most recent week always
  // keeps its label. Desktop count sized for the full-width trajectory chart.
  const weeks = computeWeeklySpend(dailySpend)
  const maxXLabels = isMobile ? 5 : 12
  const spentToDate = weeks.length ? weeks[weeks.length - 1].cumulative : 0
  const budgetLeft = totalBudget - spentToDate

  // Invoice totals (exclude void)
  const activeInvoices = invoices.filter(i => i.status !== 5)
  const totalInvoiced = activeInvoices.reduce((s, i) => s + (i.total || 0), 0)
  const totalPaid = activeInvoices.reduce((s, i) => s + (i.amountPaid || 0), 0)
  const totalOutstanding = activeInvoices.reduce((s, i) => s + (i.amountRemaining || 0), 0)
  const openInvoiceCount = activeInvoices.filter(i => (i.amountRemaining || 0) > 0).length

  // ── Overview facts ──
  // Identity + pace figures for the hero card. Timeline is strictly factual —
  // actrec.sttdte / actrec.cmpdte only. No projected finish: an expected-end
  // field is coming to Sage via project scheduling; extrapolating one from burn
  // would read as a commitment.
  const jobStartDate = parseValidDate(project?.startDate)
  const jobCompletedDate = parseValidDate(project?.completedDate)
  const timelineEnd = jobCompletedDate ?? new Date()
  const daysElapsed = jobStartDate
    ? Math.max(0, Math.round((timelineEnd.getTime() - jobStartDate.getTime()) / 86_400_000))
    : null
  // Units only matter plural — at 1 unit, cost/unit merely restates total cost.
  const unitCount = project?.totalUnitCount && project.totalUnitCount > 1 ? project.totalUnitCount : null
  const costPerUnit = unitCount && project ? project.totalCost / unitCount : null
  // Most recent cost entry or invoice — a stalled job shows its age here.
  // YYYY-MM-DD prefixes compare lexicographically.
  const lastActivity = (() => {
    const days = [
      ...dailySpend.map(d => d.day?.slice(0, 10)),
      ...activeInvoices.map(i => i.invoiceDate?.slice(0, 10)),
    ].filter((s): s is string => !!s)
    return days.length ? days.reduce((a, b) => (a > b ? a : b)) : null
  })()
  // Committed vs posted split (list-panel parity). Null until the backend
  // that rolls totalCommitted into the consolidated project is deployed.
  const committed = project?.totalCommitted ?? null
  const spentPosted = committed != null && project ? project.totalCost - committed : null

  // ── Cost & Billing Trajectory ──
  // One chart that answers all three "how is this job tracking" questions at
  // once: cumulative cost (are we burning fast?), the budget ceiling (will we
  // blow the budget?), and cumulative billed (are we collecting cash as fast as
  // we spend it?). Cost + billed share ONE weekly axis spanning the union of
  // both streams (computeCostVsBilled), so a job that bills before/after its
  // costs still lines up. `Cost` is series[0] → brand-orange; `Billed` next.
  const costVsBilled = computeCostVsBilled(
    dailySpend,
    activeInvoices.map(i => ({ day: i.invoiceDate, spending: i.total })),
  )
  // Explicit colors (matching CHART_COLORS[0]/[1]) so the slice tooltip tints
  // each value to its line — Cost orange, Billed green.
  const trajSeries = [
    { id: "Cost", color: "#c27c3e", data: costVsBilled.map(p => ({ x: p.label, y: p.cost })) },
    { id: "Billed", color: "#22c55e", data: costVsBilled.map(p => ({ x: p.label, y: p.billed })) },
  ]
  const trajTickValues = thinLabels(costVsBilled.map(p => p.label), maxXLabels)
  const cvbLast = costVsBilled[costVsBilled.length - 1] ?? null
  const maxBilled = cvbLast?.billed ?? 0
  // The budget ceiling ALWAYS renders, so the axis always extends to it (plus a
  // little headroom). Early in a job the budget can sit well above the plotted
  // cost + billed lines — that empty space above the data is itself the signal
  // ("lots of budget left"). The caption carries the exact figure.
  const trajDataMax = Math.max(spentToDate, maxBilled)
  const trajMaxValue = totalBudget > 0
    ? Math.max(trajDataMax, totalBudget) * 1.04
    : trajDataMax > 0 ? trajDataMax * 1.1 : "auto"
  // Horizontal dashed budget ceiling — the cost line crossing it = over budget.
  const trajMarkers: LineMarker[] = totalBudget > 0
    ? [{
        axis: "y",
        value: totalBudget,
        legend: "Budget",
        legendPosition: "top-right",
        lineStyle: { stroke: "var(--secondary-text)", strokeWidth: 1, strokeDasharray: "4 4", strokeOpacity: 0.7 },
        textStyle: { fill: "var(--secondary-text)", fontSize: 11, fontWeight: 600 },
        // Render the label as a pill sitting atop the line with the card's
        // surface color behind it, so it stays legible over the dashed line.
        labelBackground: "var(--card-color)",
      }]
    : []
  // Caption: budget burn % (+ $ left/over).
  const trajDesc = totalBudget > 0
    ? `${Math.round((spentToDate / totalBudget) * 100)}% of budget · ${
        budgetLeft >= 0 ? `${formatMoneyFull(budgetLeft)} left` : `${formatMoneyFull(-budgetLeft)} over`
      }`
    : undefined

  const pmPhase = project?.phases?.find(p => p.pmName?.trim())
  const pm = pmPhase?.pmName?.trim()
  const pmId = pmPhase?.pmId ?? null
  const margin = project && project.totalContract > 0
    ? ((project.totalContract - project.totalCost) / project.totalContract) * 100
    : project?.totalMargin ?? null
  const marginColor = !marginColorsOn || margin == null ? undefined : marginTextColor(margin)
  // Ledger figures mirror the Job Costing list's expanded panel EXACTLY — same
  // source (the consolidated project's totalBudget, not the cost-groups
  // rollup), same rows, same labels — so the two views always reconcile.
  // Budget Remaining/Exceeded: POSITIVE = under budget (good); NEGATIVE = over
  // (bad) — the row shows the absolute value with the label carrying the sign.
  const ledgerBudget = project?.totalBudget ?? 0
  const projectedVariance = project ? ledgerBudget - project.totalCost : null
  const varianceClass = projectedVariance == null || projectedVariance === 0
    ? undefined
    : projectedVariance > 0 ? "jc-variance-under" : "jc-variance-over"
  const originalContract = project?.originalContract ?? 0
  const revisedContract = project?.totalContract ?? 0
  const invoicePct = revisedContract > 0 ? (totalInvoiced / revisedContract) * 100 : 0
  const phases = project?.phases ?? []
  const showPhases = !isLoading && phases.length > 1

  const sortedInvoices = applySort(invoices, invSort, (inv, key) => {
    switch (key) {
      case "num": { const n = Number(inv.invoiceNum); return isNaN(n) ? inv.invoiceNum : n }
      case "date": return inv.invoiceDate
      case "status": return inv.status
      case "total": return inv.total
      case "paid": return inv.amountPaid
      case "remaining": return inv.amountRemaining
    }
  })
  const sortedPhases = applySort(phases, phaseSort, (ph, key) => {
    switch (key) {
      case "num": return Number(ph.recnum) || 0
      case "name": return ph.name
      case "status": return ph.status
      case "pm": return ph.pmName?.trim() || null
      case "units": return Number(ph.unitCount) || 0
      case "contract": return ph.totalContract ?? 0
      case "cost": return ph.totalCost ?? 0
      case "margin": return ph.margin == null ? null : Number(ph.margin)
    }
  })

  // Closed jobs (status > 4, matching the backend's closed rollup) report
  // final figures — "Projected" would read as if the job were still moving.
  const isClosed = (project?.status ?? 0) > 4
  const grossProfit = project ? project.totalContract - project.totalCost : null
  const hasIdentity = Boolean(project?.clientName || pm || lastActivity)
  const hasTimeline = Boolean(jobStartDate || jobCompletedDate)

  // Category slice → who was paid within that cost type, with the
  // committed/posted split preserved. Rows drill through to the vendor view.
  function drillCategory(key: string) {
    const group = groups.find(g => g.key === key)
    if (!group) return
    const byVendor = new Map<string, { committed: number; posted: number }>()
    for (const c of group.items) {
      const committed = c.committedAmount || 0
      const posted = c.postedAmount || 0
      if (committed <= 0 && posted <= 0) continue
      const cur = byVendor.get(c.id) ?? { committed: 0, posted: 0 }
      cur.committed += committed
      cur.posted += posted
      byVendor.set(c.id, cur)
    }
    const rows: DrillRow[] = Array.from(byVendor.entries()).map(([id, v]) => ({
      id,
      label: id,
      committed: v.committed,
      posted: v.posted,
    }))
    if (!rows.length) return
    const total = rows.reduce((s, r) => s + r.committed + r.posted, 0)
    setDrill({
      title: `${key} Spending`,
      subtitle: `${rows.length} vendor${rows.length === 1 ? "" : "s"} · ${formatMoneyFull(total)} total`,
      labelHeader: "Vendor / Source",
      rows,
      canDrillVendors: true,
    })
  }

  // Vendor slice → what that vendor was paid for (their line items, tagged
  // with the cost category each belongs to).
  function drillVendor(vendorId: string) {
    const rows: DrillRow[] = costItems
      .filter(c => c.id === vendorId)
      .map((c, i) => ({
        id: `${vendorId}-${i}`,
        label: c.dscrpt?.trim() || c.costType,
        sub: c.dscrpt?.trim() ? c.costType : undefined,
        committed: c.committedAmount || 0,
        posted: c.postedAmount || 0,
      }))
      .filter(r => r.committed > 0 || r.posted > 0)
    if (!rows.length) return
    const total = rows.reduce((s, r) => s + r.committed + r.posted, 0)
    setDrill({
      title: vendorId,
      subtitle: `${rows.length} line item${rows.length === 1 ? "" : "s"} · ${formatMoneyFull(total)} total`,
      labelHeader: "Description",
      rows,
    })
  }

  // PM lives in the overview facts card, not the page header.
  // While loading, a badge-shaped shimmer holds the status pill's slot so the
  // header row doesn't grow when the badge lands.
  const subtitleText = isMobile ? undefined : `#${recnum}`
  const subtitle = project ? (
    <span className="jcd-subtitle">
      {project.status != null && (
        <span className={`status-badge status-${project.status}`}>
          {JOB_STATUS_LABELS[project.status] ?? project.status}
        </span>
      )}
      {subtitleText && <span>{subtitleText}</span>}
    </span>
  ) : isLoading ? (
    <span className="jcd-subtitle">
      {/* Muted empty pill holds the status badge's slot — no shimmer, no
          guessed text; the badge's own base gray reads as "pending". */}
      <span className="status-badge jcd-badge-empty" aria-hidden="true">&nbsp;</span>
      {subtitleText && <span>{subtitleText}</span>}
    </span>
  ) : undefined

  function handleExport() {
    if (!project) return
    const invoiceSummary = activeInvoices.length > 0
      ? { totalInvoiced, totalPaid, totalOutstanding, invoicedPct: invoicePct }
      : null
    const { rows: xlsxRows, transactionHeaderRow, transactionCols } = buildJobCostXlsx(
      {
        name: project.name,
        recnum: recnum,
        status: project.status,
        pmName: pm ?? null,
        originalContract: project.originalContract,
        changeOrderAmount: project.changeOrderAmount,
        totalContract: project.totalContract,
        totalBudget,
        totalCost: project.totalCost,
        totalIncome: project.totalIncome,
      },
      groups.map(g => ({ key: g.key, budget: g.budget, actual: g.actual, variance: g.variance, variancePct: g.variancePct })),
      costItems.map(c => ({ costType: c.costType, id: c.id, dscrpt: c.dscrpt, committedAmount: c.committedAmount, postedAmount: c.postedAmount })),
      changeOrders,
      invoiceSummary,
      monthlyCosts,
    )
    const date = new Date().toISOString().slice(0, 10)
    const safeName = (project.name || `Job_${recnum}`).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")
    downloadXlsx(xlsxRows, `${safeName}_Cost_Report_${date}.xlsx`, project.name || "Report", {
      autoFilterRow: transactionHeaderRow,
      autoFilterCols: transactionCols,
    })
  }

  return (
    <Page
      // While loading the header reads as the section name — real text, not a
      // shimmer bar — then resolves to the project's name.
      title={isLoading ? "Jobcosting" : project?.name ?? `Job #${recnum}`}
      subtitle={subtitle}
      actions={
        isMobile ? undefined : (
          <>
            <button className="jc-export-btn" onClick={() => navigate(backTo)} title={`Back to ${backLabel}`}>
              <ArrowLeft size={14} /> {backLabel}
            </button>
            <button className="jc-export-btn" onClick={handleExport} disabled={isLoading || !project}>
              <Download size={14} />
              Export Report
            </button>
            {canCreateCO && (
              <button className="jc-export-btn" onClick={() => setCreatingCO(true)} disabled={isLoading || !project}>
                <Plus size={14} />
                Change Order
              </button>
            )}
          </>
        )
      }
    >
      <MotionList className="jcd-sections">

        {/* ── Overview ─────────────────────────────────────────────── */}
        <MotionItem>
          <section className="jcd-section jcd-overview-section">
            {/* Hero: ONE instrument on the page's signature deck surface,
                reading top to bottom as verdict (margin and gross profit, plus
                pace facts) → identity (one quiet inline meta line) → timeline
                (the factual date strip). Only the verdicts render as figures
                (.subheadline over .title1); identity collapses to inline
                label·value pairs so a single big register carries the card.

                Loading state: this SAME tree renders quiet shimmer bars in
                every slot — labels included, so the resting hero reads as a
                calm placeholder rather than a wrongly-guessed card — while
                the registers and type classes stay identical, so heights
                match and restyling the hero restyles its skeleton. */}
            {(isLoading || project) && (
            <div className="jc-group-overview jcd-hero pd-hero">
              {/* Backdrop art — the project lens's signature mark, pairing
                  with the property page's building silhouette: the job's
                  phase number huge and recessed, or a stacked ONE/OFF for
                  non-phase jobs. Sage's actr_u.oneoff flag decides when
                  present; the recnum suffix (01–12 = phase month) is the
                  fallback, so it still renders before data lands. */}
              {!isMobile && (() => {
                const suffix = /^\d{8,9}$/.test(recnum) ? Number(recnum.slice(-2)) : null
                const isOneOff = project?.oneoff != null ? project.oneoff === 1 : oneoffFromRecnum(recnum)
                const isPhaseJob = !isOneOff && suffix != null && suffix >= 1 && suffix <= 12
                // layout="position": when the hero grows on data arrival the
                // centered type GLIDES to its new center instead of jumping.
                // The oversize scale rides the style prop — framer's layout
                // projection owns the inline transform.
                const artGlide = { layout: { type: "spring", bounce: 0, visualDuration: 0.4 } } as const
                return (
                  <div className="pd-hero-art pd-hero-art-text" aria-hidden="true">
                    {isPhaseJob ? (
                      <motion.span layout="position" transition={artGlide} style={{ scale: 1.12 }} className="pd-art-big">
                        P{suffix}
                      </motion.span>
                    ) : (
                      <motion.span layout="position" transition={artGlide} style={{ scale: 1.08 }} className="pd-art-stack">
                        <span>One</span><span>Off</span>
                      </motion.span>
                    )}
                  </div>
                )
              })()}
              <div className="jcd-facts">
                <Fact
                  label={isLoading ? <SkelText ch={11} /> : isClosed ? "Final Margin" : "Current Margin"}
                  value={isLoading ? <SkelText ch={5} /> : margin == null ? "—" : `${margin.toFixed(1)}%`}
                  valueColor={marginColor}
                />
                {isManager ? (
                  <Fact
                    label={isLoading ? <SkelText ch={9} /> : projectedVariance != null && projectedVariance < 0 ? "Budget Exceeded" : "Budget Remaining"}
                    value={isLoading ? <SkelText ch={8} /> : projectedVariance == null ? "—" : formatMoneyFull(Math.abs(projectedVariance))}
                    valueColor={projectedVariance == null ? undefined : projectedVariance < 0 ? "#ef4444" : "#22c55e"}
                  />
                ) : (
                  <Fact
                    label={isLoading ? <SkelText ch={9} /> : "Gross Profit"}
                    value={isLoading ? <SkelText ch={8} /> : grossProfit == null ? "—" : formatMoneyFull(grossProfit)}
                    valueColor={marginColor ?? (grossProfit != null && grossProfit < 0 ? "#ef4444" : undefined)}
                  />
                )}
                {!isLoading && unitCount != null && <Fact label="Units" value={String(unitCount)} />}
                {!isLoading && unitCount != null && costPerUnit != null && (
                  <Fact label="Cost / Unit" value={formatMoneyFull(costPerUnit)} />
                )}
              </div>

              {(isLoading || hasIdentity) && (
                <div className="jcd-meta-row">
                  {(isLoading || project?.clientName) && (
                    <Meta
                      label={isLoading ? <SkelText ch={6} /> : "Client"}
                      value={isLoading ? <SkelText ch={16} /> : project?.clientName}
                      onClick={!isLoading && canOpenClient && project?.clientId != null
                        ? () => navigate(`/clients/${project.clientId}`)
                        : undefined}
                    />
                  )}
                  {(isLoading || pm) && (
                    <Meta
                      label={isLoading ? <SkelText ch={8} /> : "Project Manager"}
                      value={isLoading ? <SkelText ch={12} /> : pm}
                      onClick={!isLoading && canOpenEmployee && pmId != null
                        ? () => navigate(`/employees/${pmId}`)
                        : undefined}
                    />
                  )}
                  {(isLoading || lastActivity) && (
                    <Meta
                      label={isLoading ? <SkelText ch={7} /> : "Last Activity"}
                      value={isLoading ? <SkelText ch={9} /> : formatDate(lastActivity!)}
                    />
                  )}
                  {/* Tech-only Sage audit fact — never skeletoned: other
                      roles (and installs without actrec.insusr) never get
                      the field, so a placeholder would promise a fourth
                      meta that may never arrive. */}
                  {!isLoading && createdBy && (
                    <Meta label="Created By" value={createdBy} />
                  )}
                </div>
              )}

              {/* ── Property strip + phase rail ──
                  Where this job sits in its property: prev/next neighbors
                  as quiet chevron+label ends at the register's edges, the
                  property centered as the anchor — one line in the deck's
                  meta voice, no stacked labels, no contained buttons, no
                  copper (the timeline's open dot stays the hero's one
                  accent). Loaded-only like the timeline (parent may never
                  arrive), but once the membership fetch lands the strip
                  PERSISTS through phase swaps — `parent ?? activeRail` —
                  so cycling never blanks the control being used. */}
              {(parent || activeRail) && (() => {
                const hasRail = railIdx >= 0 && activeRail!.sibs.length > 1
                const end = (sib: RailSib | null, side: "prev" | "next") => (
                  <button
                    type="button"
                    className={`jcd-rail-end jcd-rail-end-${side}`}
                    disabled={!sib}
                    title={sib?.name}
                    onClick={() => sib && swapPhase(sib.recnum)}
                  >
                    {side === "prev" && <ChevronLeft size={15} className="jcd-rail-chevron" />}
                    {sib && (
                      <span className="jcd-rail-end-label body-text emphasized">
                        {sib.oneoff && <Hammer size={11} />}
                        <span className="jcd-rail-end-text">{sib.label}</span>
                      </span>
                    )}
                    {side === "next" && <ChevronRight size={15} className="jcd-rail-chevron" />}
                  </button>
                )
                return (
                  <div className="jcd-prop-strip">
                    {hasRail && end(railPrev, "prev")}
                    <button
                      type="button"
                      className="jcd-prop-link"
                      title="Open the property report"
                      // Derived label would read "Job Costing" (the prefix map
                      // can't tell /jobcost/:recnum from the list) — name the
                      // real origin instead.
                      onClick={() => goToProperty((parent ?? activeRail!.parent), { backLabel: "Project Report" })}
                    >
                      <Building2 size={13} className="jcd-prop-icon" />
                      <span className="jcd-prop-name body-text emphasized">{parent ?? activeRail!.parent}</span>
                      {hasRail && (
                        <span className="jcd-prop-count footnote">· {railIdx + 1} of {activeRail!.sibs.length}</span>
                      )}
                    </button>
                    {hasRail && end(railNext, "next")}
                  </div>
                )
              })()}

              {/* Loaded-only: the skeleton hero rests at TWO registers (facts
                  + meta line) — the timeline only exists once data confirms
                  the job has dates, so guessing it in the skeleton reads as a
                  third section that may never arrive. */}
              {!isLoading && hasTimeline && (
                <div className="jcd-timeline">
                  <div className="jcd-tl-cap">
                    <span className="jcd-tl-cap-label subheadline">Started</span>
                    <span className="jcd-tl-cap-date body-text emphasized">{jobStartDate ? fmtLongDate(jobStartDate) : "—"}</span>
                  </div>
                  <div className="jcd-tl-line">
                    <span className="jcd-tl-dot" />
                    <span className="jcd-tl-rule" />
                    {daysElapsed != null && <span className="jcd-tl-days footnote">{daysElapsed} days</span>}
                    <span className="jcd-tl-rule" />
                    <span className={`jcd-tl-dot ${jobCompletedDate ? "jcd-tl-dot-done" : "jcd-tl-dot-open"}`} />
                  </div>
                  <div className="jcd-tl-cap jcd-tl-cap-end">
                    <span className="jcd-tl-cap-label subheadline">{jobCompletedDate ? "Completed" : "In Progress"}</span>
                    <span className="jcd-tl-cap-date body-text emphasized">{jobCompletedDate ? fmtLongDate(jobCompletedDate) : "Today"}</span>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Contract + Cost summary cards — same pair the list's expanded
                row shows, so the two views reconcile at a glance. While
                loading, this SAME tree renders with real row labels and
                SkelText value bars, so the card is at its final height (row
                heights come from the labels) before any data lands. */}
            {(isLoading || project) && (
              <div className="card jcd-ledger">
                {/* One ledger card itemizing the hero's conclusions — contract
                    build-up on the left, cost build-up on the right, split by a
                    center hairline. Shares the hero's radius and side gutters
                    so the two read as one composed instrument. */}
                <div className="jcd-ledger-col">
                  <div className="jc-summary-title subheadline text-secondary">Contract Summary</div>
                  <SummaryRow
                    label="Original Contract"
                    value={isLoading ? <SkelText ch={9} /> : formatMoneyFull(project?.originalContract ?? 0)}
                  />
                  {/* Change orders drill through to the full list (modal). */}
                  <SummaryRow
                    label="Change Orders"
                    value={isLoading ? <SkelText ch={8} /> : project?.changeOrderAmount ? formatMoneyFull(project.changeOrderAmount) : "—"}
                    note={!isLoading && changeOrders.length > 0 ? `${changeOrders.length} CO${changeOrders.length === 1 ? "" : "s"}` : undefined}
                    onClick={!isLoading && changeOrders.length > 0 ? () => setCoListOpen(true) : undefined}
                  />
                  <SummaryRow
                    label="Revised Contract"
                    value={isLoading ? <SkelText ch={9} /> : formatMoneyFull(project?.totalContract ?? 0)}
                    total
                  />
                </div>
                {/* Full cost build-up: budget, then the two halves of spend
                    (posted invoices + open commitments), their sum, and the
                    variance that sum leaves against budget — in $ and as a
                    share of budget. */}
                <div className="jcd-ledger-col">
                  <div className="jc-summary-title subheadline text-secondary">Cost Summary</div>
                  <SummaryRow
                    label="Revised Budget"
                    value={isLoading ? <SkelText ch={9} /> : formatMoneyFull(ledgerBudget)}
                  />
                  {(isLoading || (spentPosted != null && committed != null)) && (
                    <>
                      <SummaryRow
                        label="Spent to Date"
                        value={isLoading ? <SkelText ch={9} /> : formatMoneyFull(spentPosted!)}
                      />
                      <SummaryRow
                        label="Committed (Open POs + Subs)"
                        value={isLoading ? <SkelText ch={8} /> : formatMoneyFull(committed!)}
                      />
                    </>
                  )}
                  <SummaryRow
                    label="Total Committed + Spent"
                    value={isLoading ? <SkelText ch={9} /> : formatMoneyFull(project?.totalCost ?? 0)}
                  />
                  <SummaryRow
                    label={projectedVariance != null && projectedVariance < 0 ? "Budget Exceeded" : "Budget Remaining"}
                    value={isLoading ? <SkelText ch={8} /> : projectedVariance == null ? "—" : formatMoneyFull(Math.abs(projectedVariance))}
                    valueClass={varianceClass}
                    total
                    noDivider
                  />
                  <SummaryRow
                    label={project && project.status >= 5 ? "Final Margin" : "Current Margin"}
                    value={isLoading ? <SkelText ch={5} /> : margin == null ? "—" : `${margin.toFixed(1)}%`}
                    total
                    valueColor={marginColor}
                  />
                </div>
              </div>
            )}
          </section>
        </MotionItem>

        {/* ── Spending ─────────────────────────────────────────────── */}
        <MotionItem>
          <section className="jcd-section">
            <h2 className="jcd-section-title title2 emphasized">Spending</h2>
            <div className="widget-grid widget-grid-2">
              {/* The full breakdown table leads — it sits directly under the
                  overview's ledger, which it itemizes; the pies below answer
                  "where did it go" at a glance. */}
              <div className="col-span-full">
                <Widget
                  title="Spending Breakdown"
                  loading={isLoading}
                  noData={!isLoading && !budget}
                  className="jcd-cost-widget"
                  // Real header + category labels with shimmer numbers — the
                  // table's final geometry before the fetch returns.
                  skeleton={<CostBreakdownSkeleton />}
                >
                  <CostBreakdownTable budget={budget} costItems={costItems} />
                </Widget>
              </div>

              <Widget
                title="Spending by Category"
                loading={isLoading}
                noData={!isLoading && typeSpend.length === 0}
                // chartSize/showPercent mirror the loaded config below.
                skeleton={<PieWithListSkeleton chartSize="md" showPercent />}
              >
                <Chart config={{
                  type: "pie-with-list",
                  items: typeSpend,
                  centerLabel: "TOTAL SPEND",
                  centerTotal: totalActual,
                  showPercent: true,
                  chartSize: "md",
                  onItemClick: drillCategory,
                }} />
              </Widget>

              <Widget
                title="Spending by Vendor"
                loading={isLoading}
                noData={!isLoading && vendorSpend.length === 0}
                skeleton={<PieWithListSkeleton chartSize="md" showPercent />}
              >
                <Chart config={{
                  type: "pie-with-list",
                  items: vendorSpend,
                  centerLabel: "VENDOR SPEND",
                  showPercent: true,
                  chartSize: "md",
                  onItemClick: drillVendor,
                  // Hashed mode keeps each vendor's color consistent with the
                  // dashboard's Top Suppliers widget.
                  colors: hashedRelationColors
                    ? vendorSpend.map(v => hashColor(v.label))
                    : colorRamp(RAMP_SCHEMES.orange.hue, RAMP_SCHEMES.orange.drift, 5),
                }} />
              </Widget>
            </div>
          </section>
        </MotionItem>

        {/* ── Billing ──────────────────────────────────────────────── */}
        <MotionItem>
          <section className="jcd-section">
            <h2 className="jcd-section-title title2 emphasized">Billing</h2>
            {/* ONE billing instrument: the position verdict leads, the meter
                carries both stories at once (billed vs earned via the ink
                tick, billed vs collected via the paid/outstanding split of
                the fill), and the invoice records sit behind a disclosure
                strip beneath — conclusion first, evidence on demand. */}
            <div className="det-section card jcd-billing-card">
              <div className="det-section-header">
                <span className="widget-title headline">Billing Position</span>
              </div>

              {isLoading ? (
                // Structural twin of the loaded band below: same classes,
                // real row labels and swatches (both are static), SkelText
                // bars where the figures land, an empty meter track, and the
                // invoice strip's geometry — so the card renders at its final
                // height and nothing jumps on arrival. Keep the class
                // structure in step with the loaded markup beneath.
                <div aria-hidden="true">
                  <div className="jcd-billing-pos">
                    <div className="jcd-bp-verdict">
                      <span className="pb-dir-pill"><SkelText ch={11} /></span>
                      <span className="jcd-bp-verdict-amt"><SkelText ch={8} /></span>
                      <span className="jcd-bp-verdict-sub"><SkelText ch={22} /></span>
                    </div>
                    <div className="jcd-bp-main">
                      <div className="jcd-bp-ledger">
                        {([
                          ["billed", "Billed"],
                          ["earned", "Earned"],
                          ["contract", "Contract"],
                        ] as const).map(([key, label]) => (
                          <div key={key} className="jcd-bp-row">
                            <span className={`jcd-bp-swatch jcd-bp-swatch--${key}`} />
                            <span className="jcd-bp-row-label">{label}</span>
                            <span className="jcd-bp-row-value"><SkelText ch={8} /></span>
                            {(key === "billed" || key === "earned") && (
                              <span className="jcd-bp-row-pct"><SkelText ch={12} /></span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="jcd-bp-meter-wrap">
                        {/* Empty track only — a shimmer fill would read as a
                            real billed extent. */}
                        <div className="jcd-bp-meter" />
                      </div>
                    </div>
                  </div>
                  <div className="jcd-inv-strip jcd-inv-strip-skel">
                    <span className="jcd-inv-strip-label">
                      <span className="jcd-inv-strip-title">Invoices</span>
                      <span className="jcd-inv-strip-count"><SkelText ch={14} /></span>
                    </span>
                    <ChevronDown size={16} className="jcd-inv-strip-chevron" />
                  </div>
                </div>
              ) : (
                <>
                  {pb && pb.contract > 0 ? (
                    (() => {
                      const dir = pb.variance > 0 ? "under" : pb.variance < 0 ? "over" : "even"
                      const label = dir === "under" ? "Under-billed" : dir === "over" ? "Over-billed" : "On track"
                      const billedW = Math.min(pb.billedPct * 100, 100)
                      const earnedW = Math.min(pb.expectedPct * 100, 100)
                      // Split the billed fill by cash actually collected —
                      // solid copper is paid, the tinted remainder is still
                      // outstanding. Split by invoice share so the segments
                      // always sum to the billed extent.
                      const paidShare = totalInvoiced > 0 ? Math.min(totalPaid / totalInvoiced, 1) : 0
                      return (
                        // Verdict | hairline | figures-over-meter. Three
                        // figures only — Billed, Earned, Contract — each with
                        // a swatch keying it to its meter element (copper fill
                        // = billed, ink tick = earned, hollow = contract
                        // track). The billed swatch mirrors the fill's
                        // paid/outstanding state, and any outstanding amount
                        // rides the Billed row as a note instead of its own
                        // legend entry.
                        <div className="jcd-billing-pos">
                          <div className={`jcd-bp-verdict jcd-bp-verdict--${dir}`}>
                            <span className={`pb-dir-pill pb-dir-pill--${dir}`}>{label}</span>
                            <span className="jcd-bp-verdict-amt">{formatMoneyFull(Math.abs(pb.variance))}</span>
                            <span className="jcd-bp-verdict-sub">
                              {dir === "under"
                                ? "earned but not yet billed"
                                : dir === "over"
                                ? "billed ahead of work earned"
                                : "billing matches work earned"}
                            </span>
                          </div>

                          <div className="jcd-bp-main">
                            <div className="jcd-bp-ledger">
                              <div className="jcd-bp-row">
                                <span className={`jcd-bp-swatch jcd-bp-swatch--billed${
                                  pb.billed > 0 && paidShare === 0 ? " is-unpaid"
                                  : paidShare > 0 && paidShare < 1 ? " is-split"
                                  : ""
                                }`} />
                                <span className="jcd-bp-row-label">Billed</span>
                                <span className="jcd-bp-row-value">{formatMoneyFull(pb.billed)}</span>
                                <span className="jcd-bp-row-pct">
                                  {Math.round(pb.billedPct * 100)}% of contract
                                  {totalOutstanding > 0 && ` · ${formatMoneyFull(totalOutstanding)} outstanding`}
                                </span>
                              </div>
                              <div className="jcd-bp-row">
                                <span className="jcd-bp-swatch jcd-bp-swatch--earned" />
                                <span className="jcd-bp-row-label">Earned</span>
                                <span className="jcd-bp-row-value">{formatMoneyFull(pb.expected)}</span>
                                <span className="jcd-bp-row-pct">
                                  {pb.hasBudget ? `${Math.round(pb.expectedPct * 100)}% complete` : "no budget, estimated"}
                                </span>
                              </div>
                              <div className="jcd-bp-row">
                                <span className="jcd-bp-swatch jcd-bp-swatch--contract" />
                                <span className="jcd-bp-row-label">Contract</span>
                                <span className="jcd-bp-row-value">{formatMoneyFull(pb.contract)}</span>
                              </div>
                            </div>

                            {/* One combined meter: the billed fill (paid solid
                                + outstanding tint) against the contract track,
                                with a marker at the earned position. */}
                            {/* Marker and caption both ride --earned-x; the CSS
                                clamps them so neither overhangs the track ends. */}
                            <div className="jcd-bp-meter-wrap" style={{ "--earned-x": `${earnedW}%` } as CSSProperties}>
                              <div className="jcd-bp-meter">
                                <div className="jcd-bp-meter-fill" style={{ width: `${billedW}%` }}>
                                  <div className="jcd-bp-meter-fill-paid" style={{ width: `${paidShare * 100}%` }} />
                                </div>
                                <div className="jcd-bp-meter-marker" />
                              </div>
                              <div className="jcd-bp-earned-label">Earned</div>
                            </div>
                          </div>
                        </div>
                      )
                    })()
                  ) : activeInvoices.length > 0 ? (
                    <div className="jcd-inv-hero">
                      <div className="jcd-inv-hero-left">
                        <span className="jcd-inv-pct">{invoicePct.toFixed(1)}%</span>
                        <span className="jcd-inv-pct-label">of contract invoiced</span>
                      </div>
                      <div className="jcd-inv-hero-right">
                        <span className="jcd-inv-amounts subheadline">
                          {formatMoneyFull(totalInvoiced)} <span className="text-secondary">of</span> {formatMoneyFull(revisedContract)}
                          {totalOutstanding > 0 && (
                            <span className="text-secondary"> · {formatMoneyFull(totalOutstanding)} outstanding</span>
                          )}
                        </span>
                        <div className="jc-invoice-progress-bar">
                          <div className="jc-invoice-progress-fill" style={{ width: `${Math.min(invoicePct, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="jcd-inv-empty">No invoices posted for this job yet.</div>
                  )}

                  {/* Disclosure strip: the records behind the position. The
                      whole strip toggles the drawer; rows inside still open
                      the invoice detail modal. */}
                  {invoices.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="jcd-inv-strip"
                        onClick={() => setInvoicesOpen(o => !o)}
                        aria-expanded={invoicesOpen}
                      >
                        <span className="jcd-inv-strip-label">
                          <span className="jcd-inv-strip-title">Invoices</span>
                          <span className="jcd-inv-strip-count">
                            {invoices.length} total{openInvoiceCount > 0 ? ` · ${openInvoiceCount} open` : ""}
                          </span>
                        </span>
                        <ChevronDown size={16} className="jcd-inv-strip-chevron" />
                      </button>
                      <motion.div
                        className="jcd-inv-drawer"
                        initial={false}
                        animate={{ height: invoicesOpen ? "auto" : 0 }}
                        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                      >
                        <div className="jcd-inv-drawer-scroll">
                          <table className="spend-rank-table inv-table">
                            <thead>
                              <tr>
                                <SortableHeader label="Invoice #" columnKey="num" activeKey={invSort.key} dir={invSort.dir} onSort={invSort.toggle} className="inv-th-num" />
                                <SortableHeader label="Date" columnKey="date" activeKey={invSort.key} dir={invSort.dir} onSort={invSort.toggle} className="inv-th-date" />
                                <SortableHeader label="Status" columnKey="status" activeKey={invSort.key} dir={invSort.dir} onSort={invSort.toggle} className="inv-th-status" />
                                <SortableHeader label="Total" columnKey="total" activeKey={invSort.key} dir={invSort.dir} onSort={invSort.toggle} align="right" />
                                <SortableHeader label="Paid" columnKey="paid" activeKey={invSort.key} dir={invSort.dir} onSort={invSort.toggle} align="right" />
                                <SortableHeader label="Remaining" columnKey="remaining" activeKey={invSort.key} dir={invSort.dir} onSort={invSort.toggle} align="right" />
                              </tr>
                            </thead>
                            <tbody>
                              {sortedInvoices.map(inv => (
                                <tr
                                  key={inv.id}
                                  className="spend-rank-table-row"
                                  onClick={() => setSelectedInvoiceId(inv.id)}
                                  role="button"
                                  tabIndex={invoicesOpen ? 0 : -1}
                                  onKeyDown={e => e.key === "Enter" && setSelectedInvoiceId(inv.id)}
                                >
                                  <td className="spend-rank-table-name body-text emphasized inv-th-num">{inv.invoiceNum}</td>
                                  <td className="spend-rank-table-name body-text text-secondary inv-th-date">{formatDate(inv.invoiceDate)}</td>
                                  <td className="spend-rank-table-name inv-th-status">
                                    <Badge tone={invoiceStatusTone(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
                                  </td>
                                  <td className="spend-rank-table-value body-text">{formatMoneyFull(inv.total)}</td>
                                  <td className="spend-rank-table-value body-text">{formatMoneyFull(inv.amountPaid)}</td>
                                  <td className="spend-rank-table-value body-text invoice-amount-value--remaining">{formatMoneyFull(inv.amountRemaining)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    </>
                  )}
                </>
              )}
            </div>

            <Widget
              title="Cost & Billing Trajectory"
              // Caption shimmer holds the description line's slot while
              // loading, so the header doesn't grow when the burn % lands.
              description={isLoading ? <SkelText ch={28} /> : trajDesc}
              loading={isLoading}
              noData={!isLoading && costVsBilled.length === 0}
              className="jcd-chart-widget"
              // Fills the same .chart-container the loaded plot uses, so the
              // widget's 320px plot height applies to both states.
              skeleton={<ChartAreaSkeleton />}
              // Custom HTML legend in the header's top-right corner (colors
              // match the series: Cost = CHART_COLORS[0], Billed = [1]).
              actions={
                <ChartLegend items={[
                  { label: "Cost", color: "#c27c3e" },
                  { label: "Billed", color: "#22c55e" },
                ]} />
              }
            >
              <Chart config={{
                type: "line",
                // `Cost` omits `color` so it falls through to CHART_COLORS[0]
                // (brand orange) — same line the home page revenue + directory
                // history charts use; `Billed` takes the next palette color.
                series: trajSeries,
                // Two cumulative lines plus a budget marker — no area fill (it
                // would muddy the overlap). Legend is rendered in the header
                // (actions) instead of nivo's in-plot legend.
                enableArea: false,
                legend: false,
                compactTop: true,
                disableGrowthTooltip: true,
                yFormat: formatMoneyFull,
                // Scaled to the plotted data, extended to the budget ceiling
                // only when that ceiling is actually in view (trajMaxValue).
                maxValue: trajMaxValue,
                axisBottomTickValues: trajTickValues,
                markers: trajMarkers,
              }} />
            </Widget>
          </section>
        </MotionItem>

        {/* ── Phases ───────────────────────────────────────────────── */}
        {showPhases && (
          <MotionItem>
            <section className="jcd-section">
              <h2 className="jcd-section-title title2 emphasized">Phases</h2>

              {/* Per-phase rollup — the consolidated project's members, which
                  were previously fetched but never shown. */}
              {showPhases && (
                <div className="card jcd-phases-card">
                  <div className="jcd-phases-head">
                    <span className="widget-title headline">Phases</span>
                    <span className="jcd-phases-count">{phases.length} phases</span>
                  </div>
                  <table className="spend-rank-table inv-table">
                    <thead>
                      <tr>
                        <SortableHeader label="Phase #" columnKey="num" activeKey={phaseSort.key} dir={phaseSort.dir} onSort={phaseSort.toggle} className="jcd-co-th-num" />
                        <SortableHeader label="Name" columnKey="name" activeKey={phaseSort.key} dir={phaseSort.dir} onSort={phaseSort.toggle} />
                        <SortableHeader label="Status" columnKey="status" activeKey={phaseSort.key} dir={phaseSort.dir} onSort={phaseSort.toggle} className="inv-th-status" />
                        <SortableHeader label="PM" columnKey="pm" activeKey={phaseSort.key} dir={phaseSort.dir} onSort={phaseSort.toggle} className="inv-th-date" />
                        <SortableHeader label="Units" columnKey="units" activeKey={phaseSort.key} dir={phaseSort.dir} onSort={phaseSort.toggle} align="right" />
                        <SortableHeader label="Contract" columnKey="contract" activeKey={phaseSort.key} dir={phaseSort.dir} onSort={phaseSort.toggle} align="right" />
                        <SortableHeader label="Committed + Spent" columnKey="cost" activeKey={phaseSort.key} dir={phaseSort.dir} onSort={phaseSort.toggle} align="right" />
                        <SortableHeader label="Margin" columnKey="margin" activeKey={phaseSort.key} dir={phaseSort.dir} onSort={phaseSort.toggle} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPhases.map(ph => {
                        const phMargin = ph.margin == null ? null : Number(ph.margin)
                        const phUnits = Number(ph.unitCount) || 0
                        return (
                          // -plain: phase rows are informational, not links —
                          // no pointer cursor promising a click that goes nowhere.
                          <tr key={ph.recnum} className="spend-rank-table-row-plain">
                            <td className="spend-rank-table-name body-text emphasized jcd-co-th-num">#{ph.recnum}</td>
                            <td className="spend-rank-table-name body-text">{ph.name}</td>
                            <td className="spend-rank-table-name inv-th-status">
                              <span className={`status-badge status-${ph.status}`}>
                                {JOB_STATUS_LABELS[ph.status] ?? ph.status}
                              </span>
                            </td>
                            <td className="spend-rank-table-name body-text text-secondary inv-th-date">{ph.pmName?.trim() || "—"}</td>
                            <td className="spend-rank-table-value body-text">{phUnits > 0 ? phUnits : "—"}</td>
                            <td className="spend-rank-table-value body-text">{formatMoneyFull(ph.totalContract ?? 0)}</td>
                            <td className="spend-rank-table-value body-text">{formatMoneyFull(ph.totalCost ?? 0)}</td>
                            <td
                              className="spend-rank-table-value body-text emphasized"
                              style={!marginColorsOn || phMargin == null ? undefined : { color: marginTextColor(phMargin) }}
                            >
                              {phMargin == null ? "—" : `${phMargin.toFixed(1)}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </MotionItem>
        )}
      </MotionList>

      <ChangeOrderListModal
        open={coListOpen}
        onClose={() => setCoListOpen(false)}
        changeOrders={changeOrders}
        originalContract={originalContract}
        onSelect={setSelectedCO}
      />
      <ChangeOrderModal
        order={selectedCO}
        create={
          creatingCO && project
            ? { presetJob: { recnum, jobName: project.name, label: `${project.name} — ${recnum}` } }
            : null
        }
        onClose={() => {
          setSelectedCO(null)
          setCreatingCO(false)
        }}
        onCreated={() => setCoVersion((v) => v + 1)}
      />
      <DrillDownModal
        open={drill != null}
        onClose={() => setDrill(null)}
        title={drill?.title ?? ""}
        subtitle={drill?.subtitle}
        labelHeader={drill?.labelHeader ?? ""}
        rows={drill?.rows ?? []}
        // Category view: clicking a vendor row swaps the modal to that
        // vendor's line items (same drill-through as clicking their slice).
        onRowClick={drill?.canDrillVendors ? drillVendor : undefined}
      />
      <InvoiceDetailModal
        invoiceId={selectedInvoiceId}
        module="clients"
        onClose={() => setSelectedInvoiceId(null)}
      />
    </Page>
  )
}
