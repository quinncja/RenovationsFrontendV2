import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData, usePageYear } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import type { PageParams } from "../../shared/api/pageApi"
import { Widget } from "../../shared/components/Widget/Widget"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import { Chart } from "../../shared/components/Chart/Chart"
import { SkelText } from "../../shared/components/SkelText"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { SegmentedControl } from "../../shared/components/SegmentedControl"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import { formatMoneyFull, formatPercent, fullMonth, marginTextColor } from "../../shared/utils/format"
import { useAuth } from "../../core/auth/AuthProvider"
import { effectiveRole } from "../../core/auth/roles"
import { useJobcostNav } from "../jobcost/useJobcostNav"
import { usePartnerNav } from "../directory/usePartnerNav"
import { MarginWidget } from "./widgets/MarginWidget"
import { MarginJobsModal, MarginJobsTable } from "./MarginJobsModal"
import { MarginGroupsModal } from "./MarginGroupsModal"
import { homeYearRevenue } from "./utils/homeYearRevenue"
import useIncludeOverUnder from "../../shared/hooks/useIncludeOverUnder"
import { OverUnderToggle } from "./components/OverUnderToggle"
import {
  normalizeJob,
  normalizeProjectJob,
  inScope,
  totalsOf,
  withMargin,
  groupByClient,
  groupByProperty,
  buildMonthRows,
  bandOf,
  scopeLabel,
  MARGIN_BANDS,
  SCOPE_OPTIONS,
  type MarginReportPayload,
  type MarginJob,
  type MarginGroup,
  type MarginTotals,
  type MarginMonthRow,
  type Scope,
} from "./marginReport"

// Annual/monthly book margin remains tied to the dashboard. Client/property
// groups use full-job contract and committed + spent from project detail;
// their selected year controls membership, and WIP does not alter them.

const BRAND_ORANGE = "#c27c3e"

type JobScope = "mine" | "all"
const JOB_SCOPE_OPTIONS = [
  { key: "mine", label: "My jobs" },
  { key: "all", label: "All jobs" },
] as const

interface MarginPerfRow {
  month: number
  revenue?: number
  total_expenses?: number
}

interface PageData extends Record<string, unknown> {
  annualRevenueTrend: { year: number; revenue: number }[] | null
  marginReportJobs: MarginReportPayload | null
  marginPerformance: MarginPerfRow[] | null
  openMonthFinances: { openMonthYear?: number; openMonthIncome?: number; openMonthPeriod?: number; openMonthOverUnder?: number } | null
}

interface ModalState {
  title: string
  subtitle?: string
  jobs: MarginJob[]
  hideKind?: boolean
  projectBasis?: boolean
  selectedYearJobs?: MarginJob[]
  fullJobJobs?: MarginJob[]
  link?: { label: string; onClick: () => void }
}

// ── Small presentational pieces ───────────────────────────────────────────

function MarginFigure({ value, on }: { value: number | null; on: boolean }) {
  return (
    <span style={value != null && on ? { color: marginTextColor(value) } : undefined}>
      {value != null ? formatPercent(value) : "—"}
    </span>
  )
}

/** One of the Phase | One-off cards: the page's headline instruments, on
 *  the jobcost deck surface. The
 *  margin is the headline, gross profit sits beside it, and a quiet strip
 *  carries count, revenue and share. The whole card opens the jobs modal. */
function KindCard({
  title,
  totals,
  shareOfWork,
  loading,
  marginColorsOn,
  onOpen,
}: {
  title: string
  totals: MarginTotals
  /** This kind's revenue as a share of the scoped total (0–100). */
  shareOfWork: number
  loading: boolean
  marginColorsOn: boolean
  onOpen: () => void
}) {
  return (
    <Widget
      title={title}
      description="Selected-year revenue + work completed. Open for yearly contributions and full-job financials."
      loading={loading}
      noData={!loading && totals.jobs === 0}
      expandable
      onExpand={onOpen}
      className="mgr-kind-widget"
    >
      <div className="mgr-kind-hero">
        <div className="mgr-kind-main">
          <span
            className="mgr-kind-margin"
            style={totals.margin != null && marginColorsOn ? { color: marginTextColor(totals.margin) } : undefined}
          >
            {totals.margin != null ? formatPercent(totals.margin) : "—"}
          </span>
          <span className="mgr-kind-margin-label">margin</span>
        </div>
        <div className="mgr-kind-gp">
          <span className="mgr-kind-label">Gross Profit</span>
          <span className="mgr-kind-gp-value">{formatMoneyFull(totals.grossProfit)}</span>
        </div>
      </div>
      <div className="mgr-kind-strip">
        <span className="jc-head-stat">
          <span className="jc-head-stat-label">Jobs</span>
          <span className="jc-head-stat-value">{totals.jobs}</span>
        </span>
        {totals.units > 0 && (
          <span className="jc-head-stat">
            <span className="jc-head-stat-label">Units</span>
            <span className="jc-head-stat-value">{Math.round(totals.units)}</span>
          </span>
        )}
        <span className="jc-head-stat">
          <span className="jc-head-stat-label">Revenue + Work Completed</span>
          <span className="jc-head-stat-value">{formatMoneyFull(totals.revenue)}</span>
        </span>
        <span className="jc-head-stat mgr-kind-share">
          <span className="jc-head-stat-label">Share of work</span>
          <span className="jc-head-stat-value">{shareOfWork.toFixed(0)}%</span>
        </span>
      </div>
    </Widget>
  )
}

const LEADERBOARD_SIZE = 5

/** The top clients / properties by margin: a five-row leaderboard
 *  the eye can scan in one pass. Rank, name and a quiet meta line on the
 *  left; the margin as the figure on the right with gross profit beneath
 *  it, the same two-register pairing the kind cards use. A row opens that
 *  group's jobs; the card itself opens the full ranked list. */
function Leaderboard({
  groups,
  total,
  plural,
  marginColorsOn,
  onOpen,
}: {
  groups: MarginGroup[]
  total: number
  plural: string
  marginColorsOn: boolean
  onOpen: (g: MarginGroup) => void
}) {
  const rest = total - groups.length
  return (
    <div className="mgr-lead">
      <ol className="mgr-lead-list">
        {groups.map((g, i) => (
          <li
            key={g.key}
            className="mgr-lead-row"
            role="button"
            tabIndex={0}
            title="View the jobs behind this row"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(g)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation()
                onOpen(g)
              }
            }}
          >
            <span className="mgr-lead-rank">{i + 1}</span>
            <span className="mgr-lead-main">
              <span className="mgr-lead-name">{g.name}</span>
              <span className="mgr-lead-meta">
                {g.jobs} job{g.jobs === 1 ? "" : "s"} · {formatMoneyFull(g.contract)} contract
              </span>
            </span>
            <span className="mgr-lead-figures">
              <span className="mgr-lead-margin">
                <MarginFigure value={g.margin} on={marginColorsOn} />
              </span>
              <span className="mgr-lead-gp">{formatMoneyFull(g.grossProfit)} gross profit</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mgr-lead-foot">
        <span>Ranked by margin</span>
        <span>{rest > 0 ? `${rest} more ${rest === 1 ? plural.replace(/ies$/, "y").replace(/s$/, "") : plural}` : `All ${total} ${plural}`}</span>
      </div>
    </div>
  )
}

/** Loading twin of the leaderboard: five rows, the same type classes, so the
 *  card keeps its height when the data lands. */
function LeaderboardSkeleton() {
  const widths = [22, 18, 24, 20, 16]
  return (
    <div className="mgr-lead">
      <ol className="mgr-lead-list">
        {widths.map((w, i) => (
          <li key={i} className="mgr-lead-row mgr-lead-row-skel">
            <span className="mgr-lead-rank">{i + 1}</span>
            <span className="mgr-lead-main">
              <span className="mgr-lead-name"><SkelText ch={w} /></span>
              <span className="mgr-lead-meta"><SkelText ch={20} /></span>
            </span>
            <span className="mgr-lead-figures">
              <span className="mgr-lead-margin"><SkelText ch={5} /></span>
              <span className="mgr-lead-gp"><SkelText ch={10} /></span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mgr-lead-foot">
        <span>Ranked by margin</span>
        <span><SkelText ch={12} /></span>
      </div>
    </div>
  )
}

/** Monthly Margin: one collapsible card per completion month (plus "In progress"). */
function MonthRows({
  rows,
  openKey,
  onToggle,
  showPm,
  marginColorsOn,
}: {
  rows: MarginMonthRow[]
  openKey: number | null
  onToggle: (key: number) => void
  showPm: boolean
  marginColorsOn: boolean
}) {
  if (rows.length === 0) {
    return <p className="reports-modal-empty body-text text-secondary">No jobs for this year and scope.</p>
  }
  return (
    <div className="ohr-detail-list scrollbar-secondary">
      {rows.map((row) => {
        const isOpen = openKey === row.key
        return (
          <div key={row.key} className={`ohr-cost-card${isOpen ? " ohr-cost-card-open" : ""}`}>
            <div
              className="ohr-cost-head"
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => onToggle(row.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onToggle(row.key)
                }
              }}
            >
              <span className="jc-head-toggle">
                <ChevronRight size={15} className={`jc-expand-chevron${isOpen ? " open" : ""}`} />
              </span>
              <span className="ohr-cost-label">{row.label}</span>
              <span className="ohr-cost-stats mgr-month-stats">
                <span className="jc-head-stat">
                  <span className="jc-head-stat-label">Jobs</span>
                  <span className="jc-head-stat-value">{row.jobs}</span>
                </span>
                <span className="jc-head-stat">
                  <span className="jc-head-stat-label">Revenue</span>
                  <span className="jc-head-stat-value">{formatMoneyFull(row.revenue)}</span>
                </span>
                <span className="jc-head-stat">
                  <span className="jc-head-stat-label">Gross Profit</span>
                  <span className="jc-head-stat-value">{formatMoneyFull(row.grossProfit)}</span>
                </span>
                <span className="jc-head-stat">
                  <span className="jc-head-stat-label">Margin</span>
                  <span className="jc-head-stat-value">
                    <MarginFigure value={row.margin} on={marginColorsOn} />
                  </span>
                </span>
              </span>
            </div>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="body"
                  className="ohr-cost-body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.14 } }}
                >
                  <div className="ohr-cost-items mgr-month-items">
                    <MarginJobsTable jobs={row.members} showPm={showPm} residual={row.residual} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

function MarginReportContent({
  year,
  setYear,
  scope,
  setScope,
  jobScope,
  setJobScope,
  isManager,
}: {
  year: number
  setYear: (y: number) => void
  scope: Scope
  setScope: (s: Scope) => void
  jobScope: JobScope
  setJobScope: (s: JobScope) => void
  isManager: boolean
}) {
  const navigate = useNavigate()
  const pageYear = usePageYear()
  const marginColorsOn = useMarginColorsEnabled()
  const { goToProperty } = useJobcostNav()
  const { canViewPartners, goToPartner } = usePartnerNav()
  const [modal, setModal] = useState<ModalState | null>(null)
  const [groupsModal, setGroupsModal] = useState<"client" | "property" | null>(null)
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null)

  const { data, isLoading } = useWidgetData<PageData>(["annualRevenueTrend", "marginReportJobs", "marginPerformance", "openMonthFinances"])
  const payload = data?.marginReportJobs ?? null

  // Same rule as the home Year Summary: WIP folds in only when the pill is on
  // AND the displayed year is the actually-open year.
  const [includeOverUnder] = useIncludeOverUnder()
  const openYear = data?.openMonthFinances?.openMonthYear ?? null
  const openMonth = data?.openMonthFinances?.openMonthPeriod ?? null
  const wipActive = includeOverUnder && openYear === pageYear

  const allJobs = useMemo<MarginJob[]>(
    () => (Array.isArray(payload?.jobs) ? payload.jobs.map((r) => normalizeJob(r, wipActive)) : []),
    [payload, wipActive]
  )

  // KPI strip is deliberately un-scoped: closed vs current vs combined is
  // the first question the page answers, whatever the slice below shows.
  const closedTotals = useMemo(() => totalsOf(allJobs.filter((j) => j.closed)), [allJobs])
  const currentTotals = useMemo(() => totalsOf(allJobs.filter((j) => !j.closed)), [allJobs])
  const attributedTotals = useMemo(() => totalsOf(allJobs), [allJobs])
  const homepageRevenue = homeYearRevenue(pageYear, data?.annualRevenueTrend, data?.openMonthFinances, includeOverUnder)
  const combinedTotals = withMargin({ ...attributedTotals,
    revenue: homepageRevenue ?? 0,
    cost: payload?.totals.cost ?? 0,
  })

  const fullJobs = useMemo(() => (payload?.projectJobs ?? []).map(normalizeProjectJob), [payload])
  const projectJobs = useMemo(() => fullJobs.filter(j => inScope(j, scope)), [fullJobs, scope])
  const yearlyJobs = useMemo(() => allJobs.filter(j => inScope(j, scope)), [allJobs, scope])
  const phaseJobs = useMemo(() => yearlyJobs.filter(j => j.kind === "phase"), [yearlyJobs])
  const oneoffJobs = useMemo(() => yearlyJobs.filter(j => j.kind === "oneoff"), [yearlyJobs])
  const phaseTotals = useMemo(() => totalsOf(phaseJobs), [phaseJobs])
  const oneoffTotals = useMemo(() => totalsOf(oneoffJobs), [oneoffJobs])
  const scopedTotals = useMemo(() => totalsOf(yearlyJobs), [yearlyJobs])
  const fullJobsFor = (selected: MarginJob[]) => {
    const ids = new Set(selected.map(j => j.recnum))
    return fullJobs.filter(j => (j.memberRecnums ?? [j.recnum]).some(id => ids.has(id)))
  }
  const annualJobsFor = (selected: MarginJob[]) => {
    const ids = new Set(selected.flatMap(j => j.memberRecnums ?? [j.recnum]))
    return allJobs.filter(j => ids.has(j.recnum))
  }

  const jobsWithoutMargin = projectJobs.filter(j => j.margin == null).length

  const bands = useMemo(
    () =>
      MARGIN_BANDS.map((b) => ({
        band: b,
        jobs: projectJobs.filter((j) => bandOf(j.margin)?.key === b.key),
      })),
    [projectJobs]
  )
  const bandBars = useMemo(() => bands.map((b) => ({ label: b.band.label, value: b.jobs.length })), [bands])

  const clientGroups = useMemo(() => groupByClient(projectJobs), [projectJobs])
  const propertyGroups = useMemo(() => groupByProperty(projectJobs), [projectJobs])
  // Highest margin first; a group with no margin (zero revenue) sinks.
  const byMargin = (a: MarginGroup, b: MarginGroup) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity)
  const topClients = useMemo(() => [...clientGroups].sort(byMargin).slice(0, LEADERBOARD_SIZE), [clientGroups])
  const topProperties = useMemo(() => [...propertyGroups].sort(byMargin).slice(0, LEADERBOARD_SIZE), [propertyGroups])
  // Monthly Margin is deliberately UNSCOPED (every job, like the KPI strip):
  // its month headers are the chart's own rows, and a "Not on a job" line
  // inside each month absorbs whatever the jobs don't account for.
  const monthRows = useMemo(
    () =>
      buildMonthRows(
        allJobs,
        payload?.monthly ?? [],
        (data?.marginPerformance ?? []).map((r) => ({ month: r.month, revenue: r.revenue ?? 0, cost: r.total_expenses ?? 0 })),
        wipActive ? openMonth : null,
        data?.openMonthFinances?.openMonthOverUnder ?? 0,
        fullMonth
      ),
    [allJobs, payload, data, wipActive, openMonth]
  )

  const showPm = !isManager || jobScope === "all"
  const scopeWord = scopeLabel(scope)
  const scopeSuffix = scope === "all" ? `${pageYear}` : `${scopeWord.toLowerCase()} · ${pageYear}`
  const noData = !isLoading && allJobs.length === 0

  const openKind = (kind: "phase" | "oneoff") =>
    setModal({
      title: kind === "phase" ? "Phase Work" : "One-Off Work",
      subtitle: `${scopeSuffix} activity`,
      jobs: kind === "phase" ? phaseJobs : oneoffJobs,
      selectedYearJobs: kind === "phase" ? phaseJobs : oneoffJobs,
      fullJobJobs: fullJobsFor(kind === "phase" ? phaseJobs : oneoffJobs),
      hideKind: true,
    })
  const openBand = (label: string) => {
    const b = bands.find((x) => x.band.label === label)
    if (!b) return
    setModal({ title: `${b.band.label} margin`, subtitle: `${scopeSuffix} eligible jobs`, jobs: b.jobs, selectedYearJobs: annualJobsFor(b.jobs), fullJobJobs: b.jobs, projectBasis: true })
  }
  const openClient = (g: MarginGroup) =>
    setModal({
      title: g.name,
      subtitle: `${scopeSuffix} eligible jobs`,
      projectBasis: true,
      jobs: g.members,
      selectedYearJobs: annualJobsFor(g.members),
      fullJobJobs: g.members,
      link:
        g.routable && canViewPartners && g.id != null
          ? { label: "Open client", onClick: () => goToPartner("client", g.id!, { backLabel: "Margin Report" }) }
          : undefined,
    })
  const openProperty = (g: MarginGroup) =>
    setModal({
      title: g.name,
      subtitle: `${scopeSuffix} eligible jobs`,
      projectBasis: true,
      jobs: g.members,
      selectedYearJobs: annualJobsFor(g.members),
      fullJobJobs: g.members,
      link: g.routable ? { label: "Open property", onClick: () => goToProperty(g.name, { backLabel: "Margin Report" }) } : undefined,
    })

  const caption = (t: MarginTotals) => (
    <span className="mgr-kpi-caption text-secondary">
      {t.jobs} job{t.jobs === 1 ? "" : "s"} · {formatMoneyFull(t.revenue)} revenue
    </span>
  )
  const marginColor = (t: MarginTotals) => (t.margin != null && marginColorsOn ? marginTextColor(t.margin) : undefined)

  return (
    <Page
      title="Margin Report"
      actions={
        <>
          <button className="jc-export-btn" onClick={() => navigate("/dashboard")} title="Back to dashboard">
            <ArrowLeft size={14} /> Dashboard
          </button>
          {isManager && (
            <SegmentedControl
              variant="ohr"
              ariaLabel="Job scope"
              layoutId="mgrJobScopeThumb"
              className="mgr-hdr-seg"
              value={jobScope}
              options={JOB_SCOPE_OPTIONS}
              onChange={setJobScope}
            />
          )}
          <OverUnderToggle />
          <SegmentedControl
            variant="ohr"
            ariaLabel="Job status scope"
            layoutId="mgrScopeThumb"
            className="mgr-hdr-seg"
            value={scope}
            options={SCOPE_OPTIONS}
            onChange={setScope}
          />
          <YearSelector value={year} onChange={setYear} />
        </>
      }
    >
      <MotionList className="widget-grid widget-grid-2">
        {/* ── Summary strip ─────────────────────────────────────────────── */}
        <MotionItem className="col-span-full">
          <div className="stat-grid ohr-kpi-grid">
            <StatWidget
              title="Closed Jobs Margin"
              value={noData ? null : closedTotals.margin}
              loading={isLoading}
              format="percent"
              valueColor={marginColor(closedTotals)}
              caption={caption(closedTotals)}
            />
            <StatWidget
              title="Current Jobs Margin"
              value={noData ? null : currentTotals.margin}
              loading={isLoading}
              format="percent"
              valueColor={marginColor(currentTotals)}
              caption={caption(currentTotals)}
            />
            <StatWidget
              title={wipActive ? "Year Margin (Incl. WIP)" : "Year Margin"}
              value={!payload || homepageRevenue == null ? null : combinedTotals.margin}
              loading={isLoading}
              format="percent"
              valueColor={marginColor(combinedTotals)}
              caption={
                <span className="mgr-kpi-caption text-secondary">
                  {homepageRevenue == null ? "Revenue unavailable" : `${formatMoneyFull(homepageRevenue)} revenue + work completed`}
                </span>
              }
            />
            <StatWidget
              title="Gross Profit"
              value={!payload || homepageRevenue == null ? null : combinedTotals.grossProfit}
              loading={isLoading}
              caption={
                <span className="mgr-kpi-caption text-secondary">
                  {formatMoneyFull(combinedTotals.cost)} cost · {pageYear}
                </span>
              }
            />
          </div>
        </MotionItem>

        {/* ── Phase vs one-off ──────────────────────────────────────────── */}
        <MotionItem>
          <KindCard
            title={`Phase Work · ${scopeWord}`}
            totals={phaseTotals}
            shareOfWork={scopedTotals.revenue !== 0 ? (phaseTotals.revenue / scopedTotals.revenue) * 100 : 0}
            loading={isLoading}
            marginColorsOn={marginColorsOn}
            onOpen={() => openKind("phase")}
          />
        </MotionItem>
        <MotionItem>
          <KindCard
            title={`One-Off Work · ${scopeWord}`}
            totals={oneoffTotals}
            shareOfWork={scopedTotals.revenue !== 0 ? (oneoffTotals.revenue / scopedTotals.revenue) * 100 : 0}
            loading={isLoading}
            marginColorsOn={marginColorsOn}
            onOpen={() => openKind("oneoff")}
          />
        </MotionItem>

        {/* ── Where the margin sits ─────────────────────────────────────── */}
        <MotionItem>
          <Widget
            title="Margin by Client"
            description={payload && !Array.isArray(payload.projectJobs) ? "Full-job data unavailable. Update the backend and refresh." : `Full-job contract less committed + spent. ${pageYear} selects eligible ${scopeWord.toLowerCase()} jobs; WIP does not apply.`}
            loading={isLoading}
            noData={!isLoading && clientGroups.length === 0}
            expandable
            onExpand={() => setGroupsModal("client")}
            className="mgr-lead-widget"
            skeleton={<LeaderboardSkeleton />}
          >
            <Leaderboard groups={topClients} total={clientGroups.length} plural="clients" marginColorsOn={marginColorsOn} onOpen={openClient} />
          </Widget>
        </MotionItem>
        <MotionItem>
          <Widget
            title="Margin by Property"
            description={payload && !Array.isArray(payload.projectJobs) ? "Full-job data unavailable. Update the backend and refresh." : `Full-job contract less committed + spent. ${pageYear} selects eligible ${scopeWord.toLowerCase()} jobs; WIP does not apply.`}
            loading={isLoading}
            noData={!isLoading && propertyGroups.length === 0}
            expandable
            onExpand={() => setGroupsModal("property")}
            className="mgr-lead-widget"
            skeleton={<LeaderboardSkeleton />}
          >
            <Leaderboard groups={topProperties} total={propertyGroups.length} plural="properties" marginColorsOn={marginColorsOn} onOpen={openProperty} />
          </Widget>
        </MotionItem>

        {/* ── Book margin by month (the home widget, verbatim) ──────────── */}
        <MotionItem>
          <MarginWidget showReportLink={false} />
        </MotionItem>

        <MotionItem>
          <Widget
            title="Margin Distribution"
            description={payload && !Array.isArray(payload.projectJobs) ? "Full-job data unavailable. Update the backend and refresh." : `Full-job margin for ${pageYear} eligible ${scopeWord.toLowerCase()} jobs. WIP does not apply.${jobsWithoutMargin ? ` ${jobsWithoutMargin} jobs without a positive contract excluded.` : ""} Click a bar for its jobs.`}
            loading={isLoading}
            noData={!isLoading && projectJobs.length === jobsWithoutMargin}
            className="mgr-dist-widget"
          >
            <Chart
              config={{
                type: "bar",
                data: bandBars,
                color: BRAND_ORANGE,
                barGradient: true,
                yFormat: (v) => String(Math.round(v)),
                // Job count on the band (white) or just above a short one (copper).
                insideLabels: true,
                onBarClick: openBand,
                barTooltip: (label, value) => (
                  <div className="chart-tooltip">
                    <span>{label}</span>
                    <strong>
                      {value} job{value === 1 ? "" : "s"}
                    </strong>
                  </div>
                ),
              }}
            />
          </Widget>
        </MotionItem>


        {/* ── Monthly margin, by completion month ───────────────────────── */}
        <MotionItem className="col-span-full">
          <Widget
            title="Monthly Margin"
            description={`The chart's months, job by job. Every job, whatever the scope above. Click a month for its jobs; click a job for its cost detail.`}
            loading={isLoading}
            noData={!isLoading && monthRows.length === 0}
            className="ohr-spending-widget"
          >
            <MonthRows
              rows={monthRows}
              openKey={expandedMonth}
              onToggle={(key) => setExpandedMonth((curr) => (curr === key ? null : key))}
              showPm={showPm}
              marginColorsOn={marginColorsOn}
            />
          </Widget>
        </MotionItem>
      </MotionList>

      <MarginGroupsModal
        open={groupsModal != null}
        title={groupsModal === "property" ? "Margin by Property" : "Margin by Client"}
        subtitle={`${scopeSuffix} eligible jobs`}
        nameLabel={groupsModal === "property" ? "Property" : "Client"}
        plural={groupsModal === "property" ? "properties" : "clients"}
        groups={groupsModal === "property" ? propertyGroups : clientGroups}
        onOpenGroup={groupsModal === "property" ? openProperty : openClient}
        onClose={() => setGroupsModal(null)}
      />
      <MarginJobsModal
        key={`${modal?.title ?? "closed"}:${modal?.projectBasis ?? false}:${modal != null}`}
        open={modal != null}
        title={modal?.title ?? ""}
        subtitle={modal?.subtitle}
        jobs={modal?.jobs ?? []}
        showPm={showPm}
        hideKind={modal?.hideKind}
        projectBasis={modal?.projectBasis}
        selectedYearJobs={modal?.selectedYearJobs}
        fullJobJobs={modal?.fullJobJobs}
        link={modal?.link}
        onClose={() => setModal(null)}
      />
    </Page>
  )
}

export default function MarginReportPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [scope, setScope] = useState<Scope>("all")
  const [jobScope, setJobScope] = useState<JobScope>("mine")
  const { claims } = useAuth()
  const isManager = effectiveRole(claims["role"] as string | undefined) === "manager"

  // Only managers send jobScope; the backend decides scope from the token
  // for every other role and ignores the param.
  const params = useMemo<PageParams>(() => {
    const p: PageParams = { year }
    if (isManager) p.jobScope = jobScope
    return p
  }, [isManager, year, jobScope])

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.marginReport} params={params}>
      <MarginReportContent
        year={year}
        setYear={setYear}
        scope={scope}
        setScope={setScope}
        jobScope={jobScope}
        setJobScope={setJobScope}
        isManager={isManager}
      />
    </PageDataProvider>
  )
}
