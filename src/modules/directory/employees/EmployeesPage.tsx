import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence, type Transition } from "framer-motion"
import {
  ArrowDown,
  ArrowUp,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react"
import Page from "../../../shared/components/Page"
import { SearchField } from "../../../shared/components/SearchField"
import { PageDataProvider, useWidgetData } from "../../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../../shared/config/pageQueries"
import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { Widget } from "../../../shared/components/Widget/Widget"
import { YearSelector, MIN_YEAR } from "../../../shared/components/YearSelector/YearSelector"
import { formatMoney, formatMoneyFull, marginTextColor } from "../../../shared/utils/format"
import useLocalStorage from "../../../shared/hooks/useLocalStorage"
import useMarginColorsEnabled from "../../../shared/hooks/useMarginColorsEnabled"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { EmployeeAvatar } from "../../../shared/components/EmployeeAvatar/EmployeeAvatar"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import { JOB_STATUS_LABELS } from "../directoryShared"
import { SortTh } from "../../../shared/components/SortTh"
import { SEG_SPRING } from "../../../shared/animation/springs"
import { CompositionBar, RiskBadges, OpenJobsPanel, ClientMixStrip, clientShares } from "./WorkloadView"
import { deriveWorkload, oneoffDisplayName, type EmployeeWorkloadPayload, type PmWorkload } from "./workload"

// Directory peer of ClientsPage / VendorsPage / SubcontractorsPage for the
// company's employees, rebuilt in the Job Costing property-card language:
// each employee is a floating card whose head carries the at-a-glance stats
// and whose body expands (framer height tween, same clock as the property
// cards) into the detail table beneath. Two lenses on the same cards:
//  - Workload (default): current-state "who can take the next job" — open
//    phases, remaining backlog, progress mix, risk badges.
//  - Performance: the year-scoped financial figures (work completed /
//    budget / cost / variance / margin).
// The lenses share search and the expanded card (toggling views keeps the
// same employee open); the year select only applies to Performance.

interface EmployeeRow {
  firstName: string
  lastName: string
  employeeNum: number
  totalIncome: number // "Work Completed"
  totalCost: number
  totalBudget: number // year-allocated budget across their jobs
  margin: number // already a whole percentage (0–100)
}

// A row of the shared project grid (getProjectGridData) — the phases behind
// each PM's performance numbers.
interface PerfPhase {
  recnum: string
  name: string | null
  jobnme: string | null
  status: number
  pmId: number | null
  clientName: string | null
  // Sage actr_u custom fields (see WorkloadPhase) — parent powers the
  // Properties strip, oneoff/oofnme the "Property - Given name" display.
  parent?: string | null
  oneoff?: number | null
  oofnme?: string | null
  totalContract: number
  budget: number
  totalCost: number
  margin: number
}

// Budget − Cost across the employee's jobs. Positive = under budget, negative
// = over (mirrors EmployeeDetailPage / Jobcost's per-job variance convention).
function budgetVariance(e: EmployeeRow): number {
  return (e.totalBudget ?? 0) - e.totalCost
}

type ViewMode = "workload" | "performance"
type SortDir = "asc" | "desc"
type WlSortKey = "name" | "open" | "units" | "remaining"
type PerfSortKey = "name" | "totalIncome" | "totalBudget" | "totalCost" | "variance" | "margin"

const WL_SORT_OPTIONS: { key: WlSortKey; label: string }[] = [
  { key: "remaining", label: "Remaining" },
  { key: "open", label: "Open Jobs" },
  { key: "units", label: "Units" },
  { key: "name", label: "Name" },
]
const PERF_SORT_OPTIONS: { key: PerfSortKey; label: string }[] = [
  { key: "totalIncome", label: "Work Completed" },
  { key: "totalBudget", label: "Budget" },
  { key: "totalCost", label: "Cost" },
  { key: "variance", label: "Budget Variance" },
  { key: "margin", label: "Margin" },
  { key: "name", label: "Name" },
]

// Same springs/tweens as the Job Costing view this page borrows its card
// language from: seg thumb spring, card entrance, body expand.
const ENTRANCE_EASE = [0.25, 0.46, 0.45, 0.94] as const
const EXPAND: Transition = { duration: 0.38, ease: [0.4, 0, 0.2, 1] }

export default function EmployeesPage() {
  const [year, setYear] = useLocalStorage<number | null>("employeesYear", new Date().getFullYear())
  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.employees} params={{ year }}>
      <EmployeesView year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

function EmployeesView({ year, onYearChange }: { year: number | null; onYearChange: (y: number | null) => void }) {
  const isMobile = useIsMobile()
  const [view, setView] = useLocalStorage<ViewMode>("employeesView", "workload")
  // Search + expanded card are shared across the two lenses so switching
  // views feels like re-dressing one deck, not landing on a different page.
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const toggleCard = (id: number) => setExpandedId((cur) => (cur === id ? null : id))
  const [wlSort, setWlSort] = useState<{ key: WlSortKey; dir: SortDir }>({ key: "remaining", dir: "desc" })
  const [perfSort, setPerfSort] = useState<{ key: PerfSortKey; dir: SortDir }>({ key: "totalIncome", dir: "desc" })

  const { data, isLoading } = useWidgetData<{
    employeePerformance: EmployeeRow[] | null
    employeeWorkload: EmployeeWorkloadPayload | null
    allProjectPhases: PerfPhase[] | null
  }>(["employeePerformance", "employeeWorkload", "allProjectPhases"])

  // employeePerformance is a raw recordset — employeeNum can come back as a
  // STRING (mssql BIGINT/NUMERIC) while allProjectPhases' pmId arrives via
  // FOR JSON as a number. Normalize once here or the phases lookup and the
  // shared expandedId silently miss.
  const employees = useMemo(
    () =>
      (data?.employeePerformance ?? []).map((e) => ({
        ...e,
        employeeNum: Number(e.employeeNum),
        totalIncome: Number(e.totalIncome ?? 0),
        totalCost: Number(e.totalCost ?? 0),
        totalBudget: Number(e.totalBudget ?? 0),
        margin: Number(e.margin ?? 0),
      })),
    [data?.employeePerformance],
  )
  const pms = useMemo(
    () => (data?.employeeWorkload ? deriveWorkload(data.employeeWorkload).pms : []),
    [data?.employeeWorkload],
  )
  const phasesByPm = useMemo(() => {
    const map = new Map<number, PerfPhase[]>()
    for (const phase of data?.allProjectPhases ?? []) {
      const pmId = phase.pmId == null ? 0 : Number(phase.pmId)
      const list = map.get(pmId)
      if (list) list.push(phase)
      else map.set(pmId, [phase])
    }
    for (const list of map.values()) list.sort((a, b) => b.totalCost - a.totalCost)
    return map
  }, [data?.allProjectPhases])

  const q = search.toLowerCase()
  const sortedPms = useMemo(() => {
    const list = q ? pms.filter((pm) => pm.pmName.toLowerCase().includes(q)) : pms
    const dir = wlSort.dir === "asc" ? 1 : -1
    return [...list].sort((a, b) => {
      let cmp = 0
      if (wlSort.key === "name") cmp = a.pmName.localeCompare(b.pmName)
      else if (wlSort.key === "open") cmp = a.openCount - b.openCount
      else if (wlSort.key === "units") cmp = a.units - b.units
      else cmp = a.remaining - b.remaining
      // Name breaks ties so equal counts keep a stable, scannable order.
      return cmp * dir || a.pmName.localeCompare(b.pmName)
    })
  }, [pms, q, wlSort])
  const sortedEmployees = useMemo(() => {
    const fullName = (e: EmployeeRow) => `${e.firstName} ${e.lastName}`.trim()
    const list = q ? employees.filter((e) => fullName(e).toLowerCase().includes(q)) : employees
    const dir = perfSort.dir === "asc" ? 1 : -1
    return [...list].sort((a, b) => {
      let cmp = 0
      if (perfSort.key === "name") cmp = fullName(a).localeCompare(fullName(b))
      else if (perfSort.key === "totalIncome") cmp = a.totalIncome - b.totalIncome
      else if (perfSort.key === "totalBudget") cmp = (a.totalBudget ?? 0) - (b.totalBudget ?? 0)
      else if (perfSort.key === "totalCost") cmp = a.totalCost - b.totalCost
      else if (perfSort.key === "variance") cmp = budgetVariance(a) - budgetVariance(b)
      else cmp = a.margin - b.margin
      return cmp * dir || fullName(a).localeCompare(fullName(b))
    })
  }, [employees, q, perfSort])

  // Mark the entrance as spent once the deck has shown anything — including
  // the ghost cards, which play the blur-in stagger themselves (the Jobcost
  // timing). The real cards then arrive via the ghost crossfade alone,
  // already in place, instead of re-staggering from blank on top of it.
  const entrancePlayedRef = useRef(false)
  const entrance = !entrancePlayedRef.current
  useEffect(() => {
    entrancePlayedRef.current = true
  }, [])

  const empty = view === "workload" ? pms.length === 0 : employees.length === 0
  const resultCount = view === "workload" ? sortedPms.length : sortedEmployees.length
  const sort = view === "workload" ? wlSort : perfSort
  const sortIsText = sort.key === "name"

  function handleSortKey(key: string) {
    // New key starts at its natural direction: text asc, numbers desc.
    if (view === "workload") setWlSort({ key: key as WlSortKey, dir: key === "name" ? "asc" : "desc" })
    else setPerfSort({ key: key as PerfSortKey, dir: key === "name" ? "asc" : "desc" })
  }
  function flipSortDir() {
    if (view === "workload") setWlSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))
    else setPerfSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))
  }

  const viewSeg = (bar: boolean) => (
    <div className={bar ? "jc-seg" : "ohr-seg"} role="tablist" aria-label="Employees view">
      {(
        [
          ["workload", "Workload"],
          ["performance", "Performance"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={view === key}
          className={
            bar
              ? `jc-seg-btn${view === key ? " jc-seg-btn-active" : ""}`
              : `ohr-seg-btn${view === key ? " ohr-seg-btn-active" : ""}`
          }
          onClick={() => setView(key)}
        >
          {view === key && (
            <motion.span
              layoutId="empViewThumb"
              className={bar ? "jc-seg-thumb" : "ohr-seg-thumb"}
              transition={SEG_SPRING}
            />
          )}
          <span className={bar ? "jc-seg-label" : "ohr-seg-label"}>{label}</span>
        </button>
      ))}
    </div>
  )

  const yearOptions: number[] = []
  for (let y = new Date().getFullYear(); y >= MIN_YEAR; y--) yearOptions.push(y)

  return (
    <Page
      title="Employees"
      // Desktop controls live in the command bar below; the header only
      // carries them on mobile, where the bar's seg/year slots don't render.
      actions={
        isMobile ? (
          <div className="ewl-actions">
            {view === "performance" && <YearSelector value={year} onChange={onYearChange} allowAllTime />}
            {viewSeg(false)}
          </div>
        ) : undefined
      }
    >
      <MotionList className="inv-page-stack">
        {/* Command bar: the same dark control deck as Job Costing's, a
            deliberately different surface from the white cards below it.
            Stays mounted across loading/view swaps so controls never jump. */}
        <MotionItem>
          <div className="jc-command-bar">
            {!isMobile && (
              <>
                {viewSeg(true)}
                <span className="jc-cb-divider" aria-hidden="true" />
              </>
            )}
            {/* Sort select + direction share one joined control, and the
                direction half says what it does in words, same as Jobcost. */}
            <span className="jc-cb-sort">
              <span className="jc-cb-select-wrap">
                <select
                  className="jc-cb-select jc-cb-sort-select"
                  value={sort.key}
                  onChange={(e) => handleSortKey(e.target.value)}
                  aria-label="Sort employees"
                >
                  {(view === "workload" ? WL_SORT_OPTIONS : PERF_SORT_OPTIONS).map((o) => (
                    <option key={o.key} value={o.key}>
                      Sort: {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="jc-cb-select-arrow" />
              </span>
              <button
                type="button"
                className="jc-cb-dir"
                onClick={flipSortDir}
                aria-label={sort.dir === "asc" ? "Sorted ascending, switch to descending" : "Sorted descending, switch to ascending"}
                title="Reverse sort order"
              >
                {sort.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                <span className="jc-cb-dir-label">
                  {sortIsText ? (sort.dir === "asc" ? "A-Z" : "Z-A") : sort.dir === "asc" ? "Low-High" : "High-Low"}
                </span>
              </button>
            </span>
            {!isMobile && view === "performance" && (
              <span className="jc-cb-select-wrap">
                <select
                  className="jc-cb-select"
                  value={year == null ? "all" : String(year)}
                  onChange={(e) => onYearChange(e.target.value === "all" ? null : Number(e.target.value))}
                  aria-label="Select year"
                >
                  <option value="all">All Time</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="jc-cb-select-arrow" />
              </span>
            )}
            {view === "workload" && !isMobile && (
              <span className="jc-cb-legend">
                <span className="ewl-legend-swatch ewl-mix-early" /> Early
                <span className="ewl-legend-swatch ewl-mix-mid" /> Mid
                <span className="ewl-legend-swatch ewl-mix-closing" /> Closing
              </span>
            )}
            <SearchField variant="jc" placeholder="Search employees..." value={search} onChange={setSearch} />
            <span className="jc-cb-count">
              <span className="jc-cb-count-num">{resultCount}</span> {resultCount === 1 ? "Employee" : "Employees"}
            </span>
          </div>
        </MotionItem>

        {/* Lens switches crossfade (mode="wait") so the incoming deck's mount
            lands behind the fade instead of popping mid-frame. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {/* Ghost deck and real content share one grid cell: when data
                lands the ghosts dissolve while the cards fade in on the same
                geometry — one quiet in-place swap, not out-then-in. */}
            <div className="jc-swap-stack">
              <AnimatePresence>
                {isLoading && <GhostCards key="ghosts" />}
              </AnimatePresence>
              {!isLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }}>
                  {empty ? (
                    <Widget className="co-widget">
                      <div className="widget-no-data">
                        <ChartNoAxesColumn size={24} className="widget-no-data-icon" />
                        <span className="body-text">No data available</span>
                      </div>
                    </Widget>
                  ) : resultCount === 0 && search ? (
                    <div className="jc-empty-note body-text text-secondary">No employees match "{search}"</div>
                  ) : view === "workload" ? (
                    <div className="emp-card-list">
                      {sortedPms.map((pm, i) => (
                        <WorkloadCard
                          key={pm.pmId}
                          pm={pm}
                          open={expandedId === pm.pmId}
                          entrance={entrance}
                          index={i}
                          onToggle={toggleCard}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="emp-card-list">
                      {sortedEmployees.map((emp, i) => (
                        <PerformanceCard
                          key={emp.employeeNum}
                          emp={emp}
                          allTime={year == null}
                          phases={phasesByPm.get(emp.employeeNum) ?? []}
                          open={expandedId === emp.employeeNum}
                          entrance={entrance}
                          index={i}
                          onToggle={toggleCard}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </MotionList>
    </Page>
  )
}

// ── The card shell both lenses dress ─────────────────────────────────────────

interface HeadStat {
  label: string
  value: string
  color?: string
}

// One employee card in the Job Costing property-card language: chevron tile +
// avatar + name lockup on the left, stat cluster + lens extras on the right,
// and a Profile tile to the full /employees/:id report. Clicking the head
// expands the body — a single framer height tween from under the head, so the
// card visibly grows to reveal the detail table beneath it.
function EmployeeCard({
  id,
  firstName,
  lastName,
  name,
  italic,
  subtitle,
  stats,
  extras,
  open,
  entrance,
  index,
  onToggle,
  children,
}: {
  id: number
  firstName: string
  lastName: string
  name: string
  italic?: boolean
  subtitle: string
  stats: HeadStat[]
  extras?: React.ReactNode
  open: boolean
  entrance: boolean
  index: number
  onToggle: (id: number) => void
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <motion.div
      className={`jc-project-card${open ? " jc-project-card-open" : ""}`}
      // App-standard MotionList entrance (same values as itemVariants),
      // continuing the command bar's stagger rhythm on first paint.
      initial={entrance ? { opacity: 0, y: 12, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: entrance ? 0.08 + Math.min(index, 8) * 0.08 : 0, ease: ENTRANCE_EASE }}
    >
      <div
        className="jc-project-head"
        role="button"
        tabIndex={0}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onToggle(id)
          }
        }}
        aria-expanded={open}
      >
        <span className="jc-head-toggle">
          <ChevronRight size={15} className={`jc-expand-chevron${open ? " open" : ""}`} />
        </span>
        <EmployeeAvatar firstName={firstName} lastName={lastName} />
        <span className="jc-project-title">
          <span className="jc-project-name-row">
            <span className="jc-project-name" style={italic ? { fontStyle: "italic" } : undefined}>
              {name}
            </span>
          </span>
          <span className="jc-group-client">{subtitle}</span>
        </span>
        <span className="jc-head-stats">
          {stats.map((s) => (
            <span key={s.label} className="jc-head-stat">
              <span className="jc-head-stat-label">{s.label}</span>
              <span className="jc-head-stat-value" style={s.color ? { color: s.color } : undefined}>
                {s.value}
              </span>
            </span>
          ))}
        </span>
        {extras && <span className="jc-project-counts">{extras}</span>}
        {/* stopPropagation on click AND keydown — the head is a role=button
            that would otherwise toggle open. */}
        <button
          type="button"
          className="jc-view-tile jc-view-tile-wide"
          aria-label="Open employee profile"
          title="Open employee profile"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/employees/${id}`)
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          Profile <ExternalLink size={13} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="jc-project-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EXPAND}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Workload lens ────────────────────────────────────────────────────────────

function WorkloadCard({
  pm,
  open,
  entrance,
  index,
  onToggle,
}: {
  pm: PmWorkload
  open: boolean
  entrance: boolean
  index: number
  onToggle: (id: number) => void
}) {
  const subtitleParts = [`${pm.openCount} open ${pm.openCount === 1 ? "job" : "jobs"}`]
  if (pm.upcomingCount > 0) subtitleParts.push(`${pm.upcomingCount} upcoming`)
  if (pm.dormantCount > 0) subtitleParts.push(`${pm.dormantCount} dormant`)
  const subtitle = pm.openCount === 0 ? "No open jobs" : subtitleParts.join(" · ")
  return (
    <EmployeeCard
      id={pm.pmId}
      firstName={pm.firstName}
      lastName={pm.lastName}
      name={pm.pmName}
      italic={pm.pmId === 0}
      subtitle={subtitle}
      stats={[
        { label: "Open", value: String(pm.openCount) },
        { label: "Units", value: pm.units > 0 ? String(pm.units) : "—" },
        { label: "Remaining", value: formatMoney(pm.remaining) },
      ]}
      // Fixed-width slots so the mix bar, risk badges, and (with them) the
      // stat cluster land on the same x across every card — variable badge
      // text otherwise shoves each card's right side around.
      extras={
        <>
          <span className="emp-head-mix">
            <CompositionBar pm={pm} />
          </span>
          <span className="emp-head-risk">
            <RiskBadges pm={pm} />
          </span>
        </>
      }
      open={open}
      entrance={entrance}
      index={index}
      onToggle={onToggle}
    >
      <OpenJobsPanel pm={pm} />
    </EmployeeCard>
  )
}

// ── Performance lens ─────────────────────────────────────────────────────────

function PerformanceCard({
  emp,
  allTime,
  phases,
  open,
  entrance,
  index,
  onToggle,
}: {
  emp: EmployeeRow
  allTime: boolean
  phases: PerfPhase[]
  open: boolean
  entrance: boolean
  index: number
  onToggle: (id: number) => void
}) {
  const marginColorsOn = useMarginColorsEnabled()
  const variance = budgetVariance(emp)
  const varianceColor = variance < 0 ? "#ef4444" : variance > 0 ? "#22c55e" : undefined
  return (
    <EmployeeCard
      id={emp.employeeNum}
      firstName={emp.firstName}
      lastName={emp.lastName}
      name={`${emp.firstName} ${emp.lastName}`.trim()}
      italic={emp.firstName?.toLowerCase() === "unassigned"}
      subtitle={
        phases.length === 0
          ? `No phases${allTime ? "" : " this year"}`
          : `${phases.length} ${phases.length === 1 ? "phase" : "phases"}${allTime ? "" : " this year"}`
      }
      // Head stats stay compact ($1.5M / $991K, the jobcost-head convention);
      // the expanded table below carries the full figures.
      stats={[
        { label: "Completed", value: formatMoney(emp.totalIncome) },
        { label: "Budget", value: formatMoney(emp.totalBudget ?? 0) },
        { label: "Cost", value: formatMoney(emp.totalCost) },
        {
          label: "Variance",
          value: `${variance > 0 ? "+" : variance < 0 ? "-" : ""}${formatMoney(Math.abs(variance))}`,
          color: varianceColor,
        },
        {
          label: "Margin",
          value: `${emp.margin.toFixed(1)}%`,
          color: marginColorsOn ? marginTextColor(emp.margin) : undefined,
        },
      ]}
      open={open}
      entrance={entrance}
      index={index}
      onToggle={onToggle}
    >
      <PerfPhasesPanel phases={phases} />
    </EmployeeCard>
  )
}

// The phases behind one PM's performance numbers, in the app's standard
// project-table columns (Project / Status / Contract / Budget / Cost /
// Variance / Margin — the EmployeeDetail / Jobcost convention).
type PhaseSortKey = "name" | "status" | "contract" | "budget" | "cost" | "variance" | "margin"

function PerfPhasesPanel({ phases }: { phases: PerfPhase[] }) {
  const { goToJobcost } = useJobcostNav()
  const marginColorsOn = useMarginColorsEnabled()
  // Same sortable headers as the app's project tables, with the Jobcost
  // three-click cycle: natural direction → reversed → cleared (back to the
  // phases lookup's cost-desc order, no active column).
  const [sort, setSort] = useState<{ key: PhaseSortKey | null; dir: SortDir }>({ key: null, dir: "desc" })
  function handleSort(key: PhaseSortKey) {
    // Text columns default asc, numeric columns default desc.
    const defaultDir: SortDir = key === "name" ? "asc" : "desc"
    setSort((s) => {
      if (s.key !== key) return { key, dir: defaultDir }
      if (s.dir === defaultDir) return { key, dir: defaultDir === "asc" ? "desc" : "asc" }
      return { key: null, dir: "desc" }
    })
  }

  const sorted = useMemo(() => {
    // Cleared sort = the lookup's order (cost desc).
    if (sort.key == null) return phases
    const nameOf = oneoffDisplayName
    const dir = sort.dir === "asc" ? 1 : -1
    return [...phases].sort((a, b) => {
      if (sort.key === "name") return nameOf(a).localeCompare(nameOf(b)) * dir
      if (sort.key === "status") return (a.status - b.status) * dir
      if (sort.key === "contract") return ((a.totalContract ?? 0) - (b.totalContract ?? 0)) * dir
      if (sort.key === "budget") return ((a.budget ?? 0) - (b.budget ?? 0)) * dir
      if (sort.key === "variance")
        return ((a.budget ?? 0) - (a.totalCost ?? 0) - ((b.budget ?? 0) - (b.totalCost ?? 0))) * dir
      if (sort.key === "margin") {
        // Null margins sink to the end regardless of direction.
        if ((a.margin == null) !== (b.margin == null)) return a.margin == null ? 1 : -1
        return ((a.margin ?? 0) - (b.margin ?? 0)) * dir
      }
      return ((a.totalCost ?? 0) - (b.totalCost ?? 0)) * dir
    })
  }, [phases, sort])

  return (
    <div className="ewl-expand-region">
      {phases.length === 0 ? (
        <p className="ewl-sub-empty body-text text-secondary">No phases with activity this year.</p>
      ) : (
        <>
        <div className="emp-overview">
          <ClientMixStrip
            shares={clientShares(phases.map((p) => ({ client: p.clientName, weight: p.totalCost ?? 0 })))}
          />
          <ClientMixStrip
            title="Properties"
            shares={clientShares(
              phases.map((p) => ({ client: p.parent?.trim() || null, weight: p.totalCost ?? 0 })),
              "No property",
            )}
          />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <SortTh col="name" label="Project" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="status" label="Status" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="contract" label="Contract" align="right" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="budget" label="Budget" align="right" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="cost" label="Cost" align="right" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="variance" label="Variance" align="right" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
              <SortTh col="margin" label="Margin" align="right" sortKey={sort.key} sortDir={sort.dir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((phase) => {
              const variance = (phase.budget ?? 0) - (phase.totalCost ?? 0)
              return (
                <tr
                  key={phase.recnum}
                  className="clickable-row"
                  onClick={() => goToJobcost(phase.recnum)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => e.key === "Enter" && goToJobcost(phase.recnum)}
                >
                  <td>
                    <div className="cell-primary">{oneoffDisplayName(phase)}</div>
                    <div className="cell-secondary">#{phase.recnum}</div>
                  </td>
                  <td>
                    <span className={`status-badge status-${phase.status}`}>
                      {JOB_STATUS_LABELS[phase.status] ?? phase.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>{formatMoneyFull(phase.totalContract ?? 0)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoneyFull(phase.budget ?? 0)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoneyFull(phase.totalCost ?? 0)}</td>
                  <td
                    style={{ textAlign: "right" }}
                    className={variance < 0 ? "jc-variance-over" : variance > 0 ? "jc-variance-under" : ""}
                  >
                    {variance > 0 ? "+" : ""}{formatMoneyFull(variance)}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      color: marginColorsOn ? marginTextColor(phase.margin) : undefined,
                    }}
                  >
                    {phase.margin == null ? "—" : `${phase.margin.toFixed(1)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </>
      )}
    </div>
  )
}

// ── Loading ghosts ───────────────────────────────────────────────────────────

// Ghost employee cards: same surface, same head geometry, same blur-in
// stagger as the real deck, so the load resolves as a quiet crossfade into
// content that's already where it belongs.
function GhostCards() {
  return (
    <motion.div
      className="jc-skeleton-list"
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {Array.from({ length: 6 }, (_, i) => (
        <motion.div
          key={i}
          className="jc-project-card"
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.08 + i * 0.08, ease: ENTRANCE_EASE }}
        >
          <div className="jc-project-head jc-skeleton-head">
            <span className="jc-head-toggle">
              <span className="skel-line" style={{ width: "0.875rem", height: "0.875rem", borderRadius: 4 }} />
            </span>
            <span className="skel-line" style={{ width: "2rem", height: "2rem", borderRadius: 999 }} />
            <span className="jc-project-title">
              <span className="jc-project-name-row">
                <span className="skel-line" style={{ width: i % 2 ? "9rem" : "7rem", height: "1.3125rem" }} />
              </span>
              <span className="skel-line" style={{ width: i % 2 ? "6rem" : "7.5rem", height: "1.0625rem" }} />
            </span>
            <span className="jc-head-stats">
              {[0, 1, 2].map((s) => (
                <span key={s} className="jc-head-stat">
                  <span className="skel-line" style={{ width: "3rem", height: "0.6875rem" }} />
                  <span className="skel-line" style={{ width: "3.5rem", height: "1.05rem" }} />
                </span>
              ))}
            </span>
            <span className="jc-project-counts">
              <span className="skel-line" style={{ width: "7.5rem", height: "1.375rem", borderRadius: 999 }} />
            </span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}
