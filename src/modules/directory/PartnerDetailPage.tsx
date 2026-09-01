import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { FileText } from "lucide-react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { fetchPageData } from "../../shared/api/pageApi"
import { Widget } from "../../shared/components/Widget/Widget"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import { Chart } from "../../shared/components/Chart/Chart"
import { Badge } from "../../shared/components/Badge"
import { SegmentedControl } from "../../shared/components/SegmentedControl"
import { SortTh } from "../../shared/components/SortTh"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { CollapsibleSection, Metric, MetricDivider } from "../../shared/components/CollapsibleSection/CollapsibleSection"
import { invoiceStatusLabel, invoiceStatusTone } from "../../shared/utils/invoiceStatus"
import { formatMoneyFull, formatDate } from "../../shared/utils/format"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import { useJobcostNav } from "../jobcost/useJobcostNav"
import {
  JobTable,
  normalizeProject,
  buildGroups,
  type RawProject,
  type Job,
  type JobDetail,
  type Group,
  type SortKey as JobSortKey,
  type SortDir,
} from "../jobcost/Jobcost"
import { marginClass, formatMargin } from "../../shared/components/JobDetailPanel/JobDetailPanel"
import type { PartnerKind } from "./usePartnerNav"
import { JOB_STATUS_LABELS } from "./directoryShared"
import JobcostIcon from "../../core/components/JobcostIcon"

// ─── Kind configuration ───────────────────────────────────────────────────────

const PROJECTS_ACCENT = "#c27c3e"
const INVOICES_ACCENT = "var(--secondary-text)"
const PRIOR_YEAR_COLOR = "#a9b2be"
const SERIES_COLOR = "#c27c3e"

const JOB_STATUS_CLASS: Record<number, string> = {
  1: "bid",
  2: "refused",
  3: "contract",
  4: "current",
  5: "complete",
  6: "closed",
}

interface KindConfig {
  noun: string
  nounPlural: string
  yearKey: string
  queries: readonly string[]
  summaryKey: string
  byYearKey: string
  byMonthKey: string
  shareKey: string
  invoicesKey: string
  invoiceModule: "clients" | "suppliers" | "subcontractors"
  /** The money the headline stats measure ("Revenue" / "Material Spend" / …). */
  moneyNoun: string
  shareTitle: string
}

const CONFIG: Record<PartnerKind, KindConfig> = {
  client: {
    noun: "Client",
    nounPlural: "clients",
    yearKey: "clientsYear",
    queries: PAGE_QUERIES.clientDetail,
    summaryKey: "clientSummary",
    byYearKey: "clientRevenueByYear",
    byMonthKey: "clientRevenueByMonth",
    shareKey: "clientRevenueShare",
    invoicesKey: "clientRecentInvoices",
    invoiceModule: "clients",
    moneyNoun: "Revenue",
    shareTitle: "Share of Revenue",
  },
  vendor: {
    noun: "Vendor",
    nounPlural: "vendors",
    yearKey: "vendorsYear",
    queries: PAGE_QUERIES.vendorDetail,
    summaryKey: "vendorSummary",
    byYearKey: "vendorSpendByYear",
    byMonthKey: "vendorSpendByMonth",
    shareKey: "vendorCategoryShare",
    invoicesKey: "vendorRecentInvoices",
    invoiceModule: "suppliers",
    moneyNoun: "Material Spend",
    shareTitle: "Share of Material Costs",
  },
  subcontractor: {
    noun: "Subcontractor",
    nounPlural: "subcontractors",
    yearKey: "subsYear",
    queries: PAGE_QUERIES.subcontractorDetail,
    summaryKey: "subcontractorSummary",
    byYearKey: "subcontractorSpendByYear",
    byMonthKey: "subcontractorSpendByMonth",
    shareKey: "subcontractorCategoryShare",
    invoicesKey: "subcontractorRecentInvoices",
    invoiceModule: "subcontractors",
    moneyNoun: "Subcontract Spend",
    shareTitle: "Share of Subcontract Costs",
  },
}

// ─── Query result shapes ──────────────────────────────────────────────────────

interface Summary {
  label: string
  value: number
}
interface YearPoint {
  label: string
  value: number
}
interface MonthlySeries {
  year: number
  months: { month: number; value: number; prevValue: number }[]
}
interface ShareRow {
  partnerValue: number
  categoryTotal: number
  rank: number
  partnerCount: number
}
interface MarginSummary {
  closedJobs: number
  closedRevenue: number
  closedCost: number
  companyClosedRevenue: number
  companyClosedCost: number
  originalContractTotal: number
  changeOrderTotal: number
}
interface PaymentBehavior {
  avgDaysToPay: number | null
  paymentCount: number
  outstanding: number
  overdue: number
}
interface Relationship {
  firstInvoiceDate: string | null
  lastInvoiceDate: string | null
  invoiceCount: number
  outstanding: number
}
interface RecentInvoice {
  id: string
  jobName?: string | null
  invoiceNum: string
  description: string | null
  value: number
  invoiceDate: string
  status: number
  amountRemaining: number
}
interface ContributionRow {
  recnum: number
  jobName: string
  status: number
  parent: string | null
  partnerCost: number
  totalCost: number
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function formatShare(pct: number): string {
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`
}

/** YoY pill for the headline stat. Clients read revenue growth as good
 *  (green up / red down); vendor & sub spend stays neutral — more spend is
 *  not a win or a loss by itself. */
function YoYPill({ current, previous, lastYear, tone }: {
  current: number
  previous: number
  lastYear: number
  tone: "revenue" | "neutral"
}) {
  if (!previous) return null
  const delta = current - previous
  const pct = Math.abs(delta / Math.abs(previous)) * 100
  const flat = pct < 0.5
  const up = delta > 0
  const color = flat || tone === "neutral"
    ? "var(--secondary-text)"
    : up ? "#16a34a" : "#dc2626"
  return (
    <span
      className="ptr-kpi-pill"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      title={`${formatMoneyFull(current)} vs ${formatMoneyFull(previous)} in ${lastYear}`}
    >
      {flat ? "±" : up ? "▲" : "▼"} {pct.toFixed(0)}% vs ’{String(lastYear).slice(-2)}
    </span>
  )
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function PartnerDetailPage({ kind }: { kind: PartnerKind }) {
  const cfg = CONFIG[kind]
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  // The list page shares this key and persists `null` for "All Time".
  const [year, setYear] = useLocalStorage<number | null>(cfg.yearKey, new Date().getFullYear())

  if (!id || isNaN(numericId)) {
    return <Page title={`${cfg.noun} Not Found`}><p>Invalid {cfg.noun.toLowerCase()} ID.</p></Page>
  }

  return (
    <PageDataProvider module="dashboard" queries={cfg.queries} params={{ id: numericId, year }}>
      <PartnerDetail kind={kind} partnerId={numericId} year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

function PartnerDetail({ kind, partnerId, year, onYearChange }: {
  kind: PartnerKind
  partnerId: number
  year: number | null
  onYearChange: (y: number | null) => void
}) {
  const cfg = CONFIG[kind]
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  const { data, isLoading } = useWidgetData<Record<string, unknown>>([...cfg.queries])

  const summary = (data?.[cfg.summaryKey] as Summary | null) ?? null
  const byYear = (data?.[cfg.byYearKey] as YearPoint[] | null) ?? []
  const byMonth = (data?.[cfg.byMonthKey] as MonthlySeries | null) ?? null
  const share = (data?.[cfg.shareKey] as ShareRow | null) ?? null
  const invoices = (data?.[cfg.invoicesKey] as RecentInvoice[] | null) ?? []
  const marginSummary = kind === "client" ? ((data?.clientMarginSummary as MarginSummary | null) ?? null) : null
  const payment = kind === "client" ? ((data?.clientPaymentBehavior as PaymentBehavior | null) ?? null) : null
  const relationship = kind !== "client" ? ((data?.[`${kind}Relationship`] as Relationship | null) ?? null) : null
  const contribution = kind !== "client" ? ((data?.partnerProjectContribution as ContributionRow[] | null) ?? []) : []

  return (
    <Page
      title={summary?.label ?? cfg.noun}
      actions={<YearSelector value={year} onChange={onYearChange} allowAllTime />}
    >
      <MotionList className="inv-page-stack">
        <MotionItem>
          <div className="ptr-kpi-grid">
            <KpiCards
              kind={kind}
              year={year}
              loading={isLoading}
              summary={summary}
              byYear={byYear}
              share={share}
              marginSummary={marginSummary}
              payment={payment}
              relationship={relationship}
            />
          </div>
        </MotionItem>

        <MotionItem>
          <HistoryChart cfg={cfg} year={year} loading={isLoading} byYear={byYear} byMonth={byMonth} />
        </MotionItem>

        <MotionItem>
          {kind === "client" ? (
            <ClientProjectsSection clientId={partnerId} year={year} />
          ) : (
            <ContributionSection cfg={cfg} rows={contribution} year={year} loading={isLoading} />
          )}
        </MotionItem>

        <MotionItem>
          <InvoicesSection
            cfg={cfg}
            year={year}
            loading={isLoading}
            invoices={invoices}
            overdue={payment?.overdue ?? null}
            onOpen={setSelectedInvoiceId}
          />
        </MotionItem>
      </MotionList>

      <InvoiceDetailModal
        invoiceId={selectedInvoiceId}
        module={cfg.invoiceModule}
        onClose={() => setSelectedInvoiceId(null)}
      />
    </Page>
  )
}

// ─── KPI row ──────────────────────────────────────────────────────────────────

function KpiCards({ kind, year, loading, summary, byYear, share, marginSummary, payment, relationship }: {
  kind: PartnerKind
  year: number | null
  loading: boolean
  summary: Summary | null
  byYear: YearPoint[]
  share: ShareRow | null
  marginSummary: MarginSummary | null
  payment: PaymentBehavior | null
  relationship: Relationship | null
}) {
  const cfg = CONFIG[kind]

  // YoY badge for the headline stat — only meaningful with a specific year.
  const prevPoint = year != null ? byYear.find((p) => p.label === String(year - 1)) : undefined
  const yoy = year != null && summary && prevPoint ? (
    <YoYPill
      current={summary.value}
      previous={prevPoint.value}
      lastYear={year - 1}
      tone={kind === "client" ? "revenue" : "neutral"}
    />
  ) : undefined

  const sharePct = share && share.categoryTotal > 0 ? (share.partnerValue / share.categoryTotal) * 100 : null

  const cards = [
    <StatWidget
      key="headline"
      title={`${year ?? "All-Time"} ${cfg.moneyNoun}`}
      value={summary?.value ?? null}
      loading={loading}
      badge={yoy}
    />,
    <StatWidget
      key="share"
      title={`${cfg.shareTitle}${year != null ? ` — ${year}` : ""}`}
      value={sharePct}
      loading={loading}
      format={(v) => formatShare(v)}
      caption={
        share && share.partnerValue > 0 ? (
          <span className="ptr-kpi-caption subheadline text-secondary">
            #{share.rank} of {share.partnerCount} {cfg.nounPlural}
          </span>
        ) : undefined
      }
    />,
  ]

  if (kind === "client") {
    const closedMargin =
      marginSummary && marginSummary.closedRevenue > 0
        ? ((marginSummary.closedRevenue - marginSummary.closedCost) / marginSummary.closedRevenue) * 100
        : null
    const companyMargin =
      marginSummary && marginSummary.companyClosedRevenue > 0
        ? ((marginSummary.companyClosedRevenue - marginSummary.companyClosedCost) /
            marginSummary.companyClosedRevenue) * 100
        : null
    const marginColor =
      closedMargin != null && companyMargin != null && Math.abs(closedMargin - companyMargin) >= 1
        ? closedMargin > companyMargin ? "#16a34a" : "#dc2626"
        : undefined
    cards.push(
      <StatWidget
        key="margin"
        title="Closed-Job Margin"
        value={closedMargin}
        loading={loading}
        format={(v) => formatShare(v)}
        valueColor={marginColor}
        caption={
          marginSummary && marginSummary.closedJobs > 0 ? (
            <span className="ptr-kpi-caption subheadline text-secondary">
              {marginSummary.closedJobs} closed {marginSummary.closedJobs === 1 ? "job" : "jobs"}
              {companyMargin != null ? ` · company avg ${formatShare(companyMargin)}` : ""}
            </span>
          ) : undefined
        }
      />,
      <StatWidget
        key="pay"
        title="Avg Days to Pay"
        value={payment?.avgDaysToPay ?? null}
        loading={loading}
        format={(v) => `${Math.round(v)} days`}
        caption={
          payment ? (
            (payment.overdue ?? 0) > 0 ? (
              <span className="ptr-kpi-caption subheadline" style={{ color: "#dc2626" }}>
                {formatMoneyFull(payment.overdue)} overdue
              </span>
            ) : (
              <span className="ptr-kpi-caption subheadline text-secondary">Nothing overdue</span>
            )
          ) : undefined
        }
      />,
    )
    const coRate =
      marginSummary && marginSummary.originalContractTotal > 0
        ? (marginSummary.changeOrderTotal / marginSummary.originalContractTotal) * 100
        : null
    cards.push(
      <StatWidget
        key="co"
        title="Change-Order Rate"
        value={coRate}
        loading={loading}
        format={(v) => formatShare(v)}
        caption={
          marginSummary && coRate != null ? (
            <span className="ptr-kpi-caption subheadline text-secondary">
              {formatMoneyFull(marginSummary.changeOrderTotal)} in approved COs
            </span>
          ) : undefined
        }
      />,
    )
  } else {
    const sinceYear = relationship?.firstInvoiceDate
      ? new Date(relationship.firstInvoiceDate).getFullYear()
      : null
    cards.push(
      <StatWidget
        key="outstanding"
        title="Outstanding Balance"
        value={relationship?.outstanding ?? null}
        loading={loading}
        caption={
          relationship ? (
            <span className="ptr-kpi-caption subheadline text-secondary">
              {relationship.invoiceCount} invoices all-time
            </span>
          ) : undefined
        }
      />,
      <StatWidget
        key="since"
        title="Partner Since"
        value={sinceYear}
        loading={loading}
        format={(v) => String(v)}
        caption={
          relationship?.lastInvoiceDate ? (
            <span className="ptr-kpi-caption subheadline text-secondary">
              Last invoice {formatDate(relationship.lastInvoiceDate)}
            </span>
          ) : undefined
        }
      />,
    )
  }

  return <>{cards}</>
}

// ─── History chart (Monthly ↔ Yearly) ─────────────────────────────────────────

type HistoryView = "monthly" | "yearly"

function HistoryChart({ cfg, year, loading, byYear, byMonth }: {
  cfg: KindConfig
  year: number | null
  loading: boolean
  byYear: YearPoint[]
  byMonth: MonthlySeries | null
}) {
  // All Time reads best year-over-year; a specific year defaults to its
  // month-over-month story.
  const [view, setView] = useState<HistoryView>(year == null ? "yearly" : "monthly")
  useEffect(() => {
    if (year == null) setView("yearly")
  }, [year])

  const chartYear = byMonth?.year ?? year ?? new Date().getFullYear()

  const monthly = useMemo(() => {
    if (!byMonth || byMonth.months.length === 0) return null
    const byIdx = new Map(byMonth.months.map((m) => [m.month, m]))
    const postedMonths = byMonth.months.filter((m) => (m.value ?? 0) !== 0).map((m) => m.month)
    // Truncate the current-year line after its last posted month so unposted
    // future months read as "not yet" instead of a crash to zero.
    const lastPosted = postedMonths.length ? Math.max(...postedMonths) : 0
    const data = MONTH_SHORT.map((label, i) => ({
      x: label,
      y: i + 1 <= lastPosted ? byIdx.get(i + 1)?.value ?? 0 : null,
    }))
    const prevData = MONTH_SHORT.map((label, i) => ({
      x: label,
      y: byIdx.get(i + 1)?.prevValue ?? 0,
    }))
    const hasPrev = byMonth.months.some((m) => (m.prevValue ?? 0) !== 0)
    const hasCurrent = lastPosted > 0
    if (!hasCurrent && !hasPrev) return null
    return { data, prevData: hasPrev ? prevData : null, hasCurrent }
  }, [byMonth])

  const showMonthly = view === "monthly"
  const noData = showMonthly ? monthly == null : byYear.length === 0

  return (
    <Widget
      title={`${cfg.moneyNoun} History`}
      loading={loading}
      noData={!loading && noData}
      actions={
        <SegmentedControl<HistoryView>
          value={view}
          options={[
            { key: "monthly", label: `${chartYear} Monthly` },
            { key: "yearly", label: "Yearly" },
          ]}
          onChange={setView}
          layoutId="ptr-history-view"
          variant="ohr"
          ariaLabel="History granularity"
        />
      }
    >
      {showMonthly && monthly && (
        <Chart
          config={{
            type: "line",
            series: [
              ...(monthly.hasCurrent
                ? [{ id: String(chartYear), color: SERIES_COLOR, data: monthly.data }]
                : []),
              ...(monthly.prevData
                ? [{ id: String(chartYear - 1), color: PRIOR_YEAR_COLOR, data: monthly.prevData }]
                : []),
            ],
            dashedSeriesIds: monthly.prevData ? [String(chartYear - 1)] : undefined,
            dashedSeriesAsRows: true,
            curve: "monotoneX",
            yFormat: formatMoneyFull,
          }}
        />
      )}
      {!showMonthly && byYear.length > 0 && (
        <Chart
          config={{
            type: "line",
            series: [
              { id: cfg.moneyNoun, data: byYear.map((d) => ({ x: d.label, y: d.value })) },
            ],
            enableArea: true,
          }}
        />
      )}
    </Widget>
  )
}

// ─── Client projects — jobcost-style board ────────────────────────────────────

type BoardView = "property" | "project"

function ClientProjectsSection({ clientId, year }: { clientId: number; year: number | null }) {
  const { goToJobcost } = useJobcostNav()
  const marginColorsOn = useMarginColorsEnabled()
  const [open, setOpen] = useState(true)
  const [view, setView] = useLocalStorage<BoardView>("ptrClientProjectView", "property")
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<JobSortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [openJobKey, setOpenJobKey] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, JobDetail | "loading">>({})
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const yearRef = useRef(year)
  yearRef.current = year

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setOpenJobKey(null)
    setDetails({})
    setOpenGroup(null)
    fetchPageData({ module: "jobcost", queries: ["getPhases"], params: { year }, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        const raw = Array.isArray(result.getPhases) ? (result.getPhases as RawProject[]) : []
        setJobs(
          raw
            .map(normalizeProject)
            .filter((j) => j.clientId === clientId)
        )
        setLoading(false)
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setLoading(false)
      })
    return () => controller.abort()
  }, [clientId, year])

  function loadDetail(job: Job) {
    setDetails((d) => ({ ...d, [job.recnum]: "loading" }))
    fetchPageData({
      module: "jobcost",
      queries: ["getBudgetByRecnum", "getAllCostItems"],
      params: { recnum: Number(job.jobNumber), year: yearRef.current },
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
    if (willOpen && !details[job.recnum]) loadDetail(job)
    setOpenJobKey(willOpen ? job.recnum : null)
  }

  function handleSort(key: JobSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "name" || key === "supervisor" ? "asc" : "desc")
    }
  }

  const sortedJobs = useMemo(() => {
    if (!sortKey) return [...jobs].sort((a, b) => b.contract - a.contract)
    const dir = sortDir === "asc" ? 1 : -1
    return [...jobs].sort((a, b) => {
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name) * dir
        case "status": return (a.status - b.status) * dir
        case "supervisor": return a.supervisor.localeCompare(b.supervisor) * dir
        case "contract": return (a.contract - b.contract) * dir
        case "totalCost": return (a.totalCost - b.totalCost) * dir
        case "budget": return (a.budget - b.budget) * dir
        case "variance": return (a.variance - b.variance) * dir
        case "margin": return ((a.margin ?? -Infinity) - (b.margin ?? -Infinity)) * dir
        default: return 0
      }
    })
  }, [jobs, sortKey, sortDir])

  const groups = useMemo(
    () => buildGroups(jobs).sort((a, b) => b.contract - a.contract),
    [jobs]
  )

  const totalContract = jobs.reduce((s, j) => s + j.contract, 0)
  const totalCost = jobs.reduce((s, j) => s + j.totalCost, 0)
  const aggMargin = totalContract > 0 ? ((totalContract - totalCost) / totalContract) * 100 : null

  return (
    <CollapsibleSection
      title={`Projects — ${year ?? "All Time"}`}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      loading={loading}
      isEmpty={!loading && jobs.length === 0}
      emptyMessage="No projects this year."
      icon={<JobcostIcon size={16} />}
      accentColor={PROJECTS_ACCENT}
      metrics={
        <>
          <Metric value={groups.length} label={groups.length === 1 ? "Property" : "Properties"} />
          <MetricDivider />
          <Metric value={jobs.length} label={jobs.length === 1 ? "Project" : "Projects"} />
          <MetricDivider />
          <Metric value={formatMoneyFull(totalContract)} label="Total Contract" />
          <MetricDivider />
          <Metric
            value={formatMargin(aggMargin)}
            label="Margin"
            valueClass={marginColorsOn ? marginClass(aggMargin) : undefined}
          />
        </>
      }
    >
      <div className="ptr-board">
        <div className="ptr-board-bar">
          <SegmentedControl<BoardView>
            value={view}
            options={[
              { key: "property", label: "Property" },
              { key: "project", label: "Project" },
            ]}
            onChange={setView}
            layoutId="ptr-client-board-view"
            variant="ohr"
            ariaLabel="Project grouping"
          />
        </div>

        {view === "project" ? (
          <JobTable
            jobs={sortedJobs}
            isManager={false}
            marginColorsOn={marginColorsOn}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            openJobKey={openJobKey}
            details={details}
            onToggleExpand={toggleExpand}
            onOpenJob={(job) => goToJobcost(Number(job.jobNumber))}
          />
        ) : (
          <PropertyCardList
            groups={groups}
            openGroup={openGroup}
            onToggleGroup={(key) => setOpenGroup((k) => (k === key ? null : key))}
            marginColorsOn={marginColorsOn}
            onOpenJob={(recnum) => goToJobcost(Number(recnum))}
          />
        )}
      </div>
    </CollapsibleSection>
  )
}

function PropertyCardList({ groups, openGroup, onToggleGroup, marginColorsOn, onOpenJob }: {
  groups: Group[]
  openGroup: string | null
  onToggleGroup: (key: string) => void
  marginColorsOn: boolean
  onOpenJob: (recnum: string) => void
}) {
  const navigate = useNavigate()
  return (
    <div className="ptr-prop-list">
      {groups.map((g) => {
        const isOpen = openGroup === g.key
        const members = [...g.phases, ...g.oneoffs]
        return (
          <div key={g.key} className={`ptr-prop-card${isOpen ? " ptr-prop-card--open" : ""}`}>
            <button type="button" className="ptr-prop-head" onClick={() => onToggleGroup(g.key)}>
              <span className="ptr-prop-name body-text emphasized">{g.key}</span>
              <span className="ptr-prop-facts subheadline text-secondary">
                {g.phases.length} {g.phases.length === 1 ? "phase" : "phases"}
                {g.oneoffs.length > 0 ? ` · ${g.oneoffs.length} one-off${g.oneoffs.length === 1 ? "" : "s"}` : ""}
              </span>
              <span className="ptr-prop-figures">
                <span className="ptr-prop-figure">
                  <span className="ptr-prop-figure-value body-text emphasized">{formatMoneyFull(g.contract)}</span>
                  <span className="ptr-prop-figure-label subheadline text-secondary">Contract</span>
                </span>
                <span className="ptr-prop-figure">
                  <span className="ptr-prop-figure-value body-text emphasized">{formatMoneyFull(g.totalCost)}</span>
                  <span className="ptr-prop-figure-label subheadline text-secondary">Cost</span>
                </span>
                <span className="ptr-prop-figure">
                  <span className={`ptr-prop-figure-value body-text emphasized ${marginColorsOn ? marginClass(g.margin) : ""}`}>
                    {formatMargin(g.margin)}
                  </span>
                  <span className="ptr-prop-figure-label subheadline text-secondary">Margin</span>
                </span>
              </span>
            </button>
            {isOpen && (
              <div className="ptr-prop-body">
                <table className="spend-rank-table">
                  <thead>
                    <tr>
                      <th className="spend-rank-table-num">#</th>
                      <th className="spend-rank-table-name">Project</th>
                      <th className="spend-rank-table-name">Status</th>
                      <th className="spend-rank-table-value">Contract</th>
                      <th className="spend-rank-table-value">Cost</th>
                      <th className="spend-rank-table-value">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr
                        key={m.recnum}
                        className="spend-rank-table-row"
                        onClick={() => onOpenJob(m.jobNumber)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && onOpenJob(m.jobNumber)}
                      >
                        <td className="spend-rank-table-num subheadline text-secondary">{m.recnum}</td>
                        <td className="spend-rank-table-name body-text">{m.oneoffName ?? m.name}</td>
                        <td className="spend-rank-table-name">
                          <span className={`jc-status-badge jc-badge-${JOB_STATUS_CLASS[m.status] ?? "closed"}`}>
                            {JOB_STATUS_LABELS[m.status] ?? `Status ${m.status}`}
                          </span>
                        </td>
                        <td className="spend-rank-table-value body-text">{formatMoneyFull(m.contract)}</td>
                        <td className="spend-rank-table-value body-text">{formatMoneyFull(m.totalCost)}</td>
                        <td className={`spend-rank-table-value body-text ${marginColorsOn ? marginClass(m.margin) : ""}`}>
                          {formatMargin(m.margin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="ptr-prop-report-link subheadline"
                  onClick={() => navigate(`/jobcost/property/${encodeURIComponent(g.key)}`)}
                >
                  Open property report →
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Vendor / subcontractor contribution board ────────────────────────────────

type ContribView = "properties" | "phases"
type ContribSortKey = "recnum" | "jobName" | "status" | "partnerCost" | "totalCost" | "share"

interface ContribGroup {
  key: string
  isProperty: boolean
  rows: ContributionRow[]
  partnerCost: number
  totalCost: number
}

function ContributionSection({ cfg, rows, year, loading }: {
  cfg: KindConfig
  rows: ContributionRow[]
  year: number | null
  loading: boolean
}) {
  const { goToJobcost } = useJobcostNav()
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)
  const [view, setView] = useLocalStorage<ContribView>("ptrContributionView", "properties")
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<ContribSortKey>("partnerCost")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const groups = useMemo<ContribGroup[]>(() => {
    const byParent = new Map<string, ContributionRow[]>()
    for (const r of rows) {
      const key = r.parent?.trim() || r.jobName
      const list = byParent.get(key)
      if (list) list.push(r)
      else byParent.set(key, [r])
    }
    return [...byParent.entries()]
      .map(([key, members]) => ({
        key,
        isProperty: members.some((m) => m.parent?.trim()),
        rows: [...members].sort((a, b) => b.partnerCost - a.partnerCost),
        partnerCost: members.reduce((s, m) => s + (m.partnerCost ?? 0), 0),
        totalCost: members.reduce((s, m) => s + (m.totalCost ?? 0), 0),
      }))
      .sort((a, b) => b.partnerCost - a.partnerCost)
  }, [rows])

  const partnerTotal = rows.reduce((s, r) => s + (r.partnerCost ?? 0), 0)
  const jobsTotal = rows.reduce((s, r) => s + (r.totalCost ?? 0), 0)
  const overallShare = jobsTotal > 0 ? (partnerTotal / jobsTotal) * 100 : null

  function handleSort(key: ContribSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "jobName" ? "asc" : "desc")
    }
  }

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1
    const shareOf = (r: ContributionRow) => (r.totalCost > 0 ? r.partnerCost / r.totalCost : 0)
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "recnum": return (a.recnum - b.recnum) * dir
        case "jobName": return a.jobName.localeCompare(b.jobName) * dir
        case "status": return (a.status - b.status) * dir
        case "partnerCost": return (a.partnerCost - b.partnerCost) * dir
        case "totalCost": return (a.totalCost - b.totalCost) * dir
        case "share": return (shareOf(a) - shareOf(b)) * dir
        default: return 0
      }
    })
  }, [rows, sortKey, sortDir])

  return (
    <CollapsibleSection
      title={`Projects — ${year ?? "All Time"}`}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      loading={loading}
      isEmpty={!loading && rows.length === 0}
      emptyMessage="No posted costs this year."
      icon={<JobcostIcon size={16} />}
      accentColor={PROJECTS_ACCENT}
      metrics={
        <>
          <Metric value={groups.length} label={groups.length === 1 ? "Property" : "Properties"} />
          <MetricDivider />
          <Metric value={rows.length} label={rows.length === 1 ? "Phase" : "Phases"} />
          <MetricDivider />
          <Metric value={formatMoneyFull(partnerTotal)} label="Work Performed" />
          <MetricDivider />
          <Metric
            value={overallShare != null ? formatShare(overallShare) : "—"}
            label="Of Their Projects' Costs"
          />
        </>
      }
    >
      <div className="ptr-board">
        <div className="ptr-board-bar">
          <SegmentedControl<ContribView>
            value={view}
            options={[
              { key: "properties", label: "Properties" },
              { key: "phases", label: "Phases" },
            ]}
            onChange={setView}
            layoutId="ptr-contrib-view"
            variant="ohr"
            ariaLabel="Contribution grouping"
          />
          <span className="ptr-board-note subheadline text-secondary">
            {cfg.noun} cost vs total posted cost, {year ?? "all time"}
          </span>
        </div>

        {view === "properties" ? (
          <div className="ptr-prop-list">
            {groups.map((g) => {
              const isOpen = openGroup === g.key
              const share = g.totalCost > 0 ? (g.partnerCost / g.totalCost) * 100 : null
              return (
                <div key={g.key} className={`ptr-prop-card${isOpen ? " ptr-prop-card--open" : ""}`}>
                  <button
                    type="button"
                    className="ptr-prop-head"
                    onClick={() => setOpenGroup((k) => (k === g.key ? null : g.key))}
                  >
                    <span className="ptr-prop-name body-text emphasized">{g.key}</span>
                    <span className="ptr-prop-facts subheadline text-secondary">
                      {g.rows.length} {g.rows.length === 1 ? "phase" : "phases"}
                    </span>
                    <span className="ptr-prop-figures">
                      <span className="ptr-prop-figure">
                        <span className="ptr-prop-figure-value body-text emphasized">
                          {formatMoneyFull(g.partnerCost)}
                        </span>
                        <span className="ptr-prop-figure-label subheadline text-secondary">Their Work</span>
                      </span>
                      <span className="ptr-prop-figure">
                        <span className="ptr-prop-figure-value body-text emphasized">
                          {formatMoneyFull(g.totalCost)}
                        </span>
                        <span className="ptr-prop-figure-label subheadline text-secondary">Total Cost</span>
                      </span>
                      <span className="ptr-prop-figure">
                        <span className="ptr-share-pill">{share != null ? formatShare(share) : "—"}</span>
                        <span className="ptr-prop-figure-label subheadline text-secondary">Of Spend</span>
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="ptr-prop-body">
                      <table className="spend-rank-table">
                        <thead>
                          <tr>
                            <th className="spend-rank-table-num">#</th>
                            <th className="spend-rank-table-name">Phase</th>
                            <th className="spend-rank-table-name">Status</th>
                            <th className="spend-rank-table-value">Their Work</th>
                            <th className="spend-rank-table-value">Total Cost</th>
                            <th className="spend-rank-table-value">% of Spend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r) => (
                            <ContributionRowTr key={r.recnum} row={r} onOpen={() => goToJobcost(r.recnum)} />
                          ))}
                        </tbody>
                      </table>
                      {g.isProperty && (
                        <button
                          type="button"
                          className="ptr-prop-report-link subheadline"
                          onClick={() => navigate(`/jobcost/property/${encodeURIComponent(g.key)}`)}
                        >
                          Open property report →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <table className="spend-rank-table">
            <thead>
              <tr>
                <SortTh spendRank col="recnum" label="#" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh spendRank col="jobName" label="Phase" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh spendRank col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh spendRank col="partnerCost" label="Their Work" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh spendRank col="totalCost" label="Total Cost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh spendRank col="share" label="% of Spend" align="right" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <ContributionRowTr key={r.recnum} row={r} onOpen={() => goToJobcost(r.recnum)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </CollapsibleSection>
  )
}

function ContributionRowTr({ row, onOpen }: { row: ContributionRow; onOpen: () => void }) {
  const share = row.totalCost > 0 ? (row.partnerCost / row.totalCost) * 100 : null
  return (
    <tr
      className="spend-rank-table-row"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      <td className="spend-rank-table-num subheadline text-secondary">{row.recnum}</td>
      <td className="spend-rank-table-name body-text">{row.jobName}</td>
      <td className="spend-rank-table-name">
        <span className={`jc-status-badge jc-badge-${JOB_STATUS_CLASS[row.status] ?? "closed"}`}>
          {JOB_STATUS_LABELS[row.status] ?? `Status ${row.status}`}
        </span>
      </td>
      <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(row.partnerCost)}</td>
      <td className="spend-rank-table-value body-text text-secondary">{formatMoneyFull(row.totalCost)}</td>
      <td className="spend-rank-table-value">
        <span className="ptr-share-pill">{share != null ? formatShare(share) : "—"}</span>
      </td>
    </tr>
  )
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

function InvoicesSection({ cfg, year, loading, invoices, overdue, onOpen }: {
  cfg: KindConfig
  year: number | null
  loading: boolean
  invoices: RecentInvoice[]
  overdue: number | null
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  // Void (status 5) stays visible in the list but out of the rollups, matching
  // the backend summary's `status < 5`.
  const billable = invoices.filter((i) => i.status !== 5)
  const totalBilled = billable.reduce((s, i) => s + (i.value ?? 0), 0)
  const totalOutstanding = billable.reduce((s, i) => s + (i.amountRemaining ?? 0), 0)

  return (
    <CollapsibleSection
      title={`Invoices — ${year ?? "All Time"}`}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      loading={loading}
      isEmpty={!loading && invoices.length === 0}
      emptyMessage="No invoices this year."
      icon={<FileText size={16} />}
      accentColor={INVOICES_ACCENT}
      metrics={
        <>
          <Metric value={billable.length} label="Invoices" />
          <MetricDivider />
          <Metric value={formatMoneyFull(totalBilled)} label="Total Billed" />
          <MetricDivider />
          <Metric
            value={formatMoneyFull(totalOutstanding)}
            label="Outstanding"
            valueClass="invoice-amount-value--remaining"
          />
          {overdue != null && overdue > 0 && (
            <>
              <MetricDivider />
              <Metric
                value={formatMoneyFull(overdue)}
                label="Overdue"
                valueClass="ptr-metric-overdue"
              />
            </>
          )}
        </>
      }
    >
      <div className="ptr-inv-list">
        {invoices.map((inv) => (
          <button
            key={inv.id}
            type="button"
            className="ptr-inv-row"
            onClick={() => onOpen(inv.id)}
          >
            <span className="ptr-inv-main">
              <span className="ptr-inv-num body-text emphasized">#{inv.invoiceNum}</span>
              {(inv.description || inv.jobName) && (
                <span className="ptr-inv-desc subheadline text-secondary">
                  {inv.description || inv.jobName}
                  {inv.description && inv.jobName ? ` · ${inv.jobName}` : ""}
                </span>
              )}
            </span>
            <span className="ptr-inv-date subheadline text-secondary">{formatDate(inv.invoiceDate)}</span>
            <span className="ptr-inv-status">
              <Badge tone={invoiceStatusTone(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
            </span>
            <span className="ptr-inv-amounts">
              <span className="ptr-inv-total body-text emphasized">{formatMoneyFull(inv.value ?? 0)}</span>
              <span
                className={`ptr-inv-remaining subheadline ${
                  (inv.amountRemaining ?? 0) > 0 ? "invoice-amount-value--remaining" : "text-secondary"
                }`}
              >
                {(inv.amountRemaining ?? 0) > 0
                  ? `${formatMoneyFull(inv.amountRemaining)} open`
                  : "Paid"}
              </span>
            </span>
          </button>
        ))}
        <p className="ptr-inv-footnote subheadline text-secondary">
          Showing the {invoices.length === 25 ? "25 most recent" : `${invoices.length}`} invoice
          {invoices.length === 1 ? "" : "s"}
          {year != null ? ` posted in ${year}` : ""} for this {cfg.noun.toLowerCase()}.
        </p>
      </div>
    </CollapsibleSection>
  )
}
