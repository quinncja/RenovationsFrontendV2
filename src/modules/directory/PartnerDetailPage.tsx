import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useParams } from "react-router-dom"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, type Transition } from "framer-motion"
import { ChevronRight, ExternalLink, X } from "lucide-react"
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
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { invoiceStatusLabel, invoiceStatusTone } from "../../shared/utils/invoiceStatus"
import { formatMoneyFull, formatDate, marginTextColor } from "../../shared/utils/format"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { useJobcostNav } from "../jobcost/useJobcostNav"
import {
  JobTable,
  normalizeProject,
  buildGroups,
  type RawProject,
  type Job,
  type JobDetail,
  type SortKey as JobSortKey,
  type SortDir,
} from "../jobcost/Jobcost"
import { marginClass, formatMargin } from "../../shared/components/JobDetailPanel/JobDetailPanel"
import type { PartnerKind } from "./usePartnerNav"
import { JOB_STATUS_LABELS } from "./directoryShared"

// ─── Kind configuration ───────────────────────────────────────────────────────

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
  /** Days past duedte before an open invoice counts as overdue: AR follows the
   *  aging rule (duedte + 30), AP ages straight off the due date. */
  overdueGraceDays: number
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
    invoicesKey: "clientInvoices",
    invoiceModule: "clients",
    moneyNoun: "Revenue",
    shareTitle: "Share of Revenue",
    overdueGraceDays: 30,
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
    invoicesKey: "vendorInvoices",
    invoiceModule: "suppliers",
    moneyNoun: "Material Spend",
    shareTitle: "Share of Material Costs",
    overdueGraceDays: 0,
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
    invoicesKey: "subcontractorInvoices",
    invoiceModule: "subcontractors",
    moneyNoun: "Subcontract Spend",
    shareTitle: "Share of Subcontract Costs",
    overdueGraceDays: 0,
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
  dueDate: string | null
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
          <HistoryChart
            cfg={cfg}
            partnerId={partnerId}
            year={year}
            loading={isLoading}
            byYear={byYear}
            byMonth={byMonth}
            invoices={invoices}
            onOpenInvoice={setSelectedInvoiceId}
          />
        </MotionItem>

        <MotionItem>
          {kind === "client" ? (
            <ClientProjectsSection clientId={partnerId} year={year} />
          ) : (
            <ContributionSection cfg={cfg} rows={contribution} year={year} loading={isLoading} />
          )}
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
type InvoiceFilter = "all" | "outstanding" | "overdue"

/** Overdue per the partner kind's aging rule: open balance whose due date
 *  (plus the kind's grace window) has passed. */
function isInvoiceOverdue(inv: RecentInvoice, graceDays: number): boolean {
  if (inv.status === 5 || (inv.amountRemaining ?? 0) <= 0 || !inv.dueDate) return false
  const mark = new Date(inv.dueDate)
  mark.setDate(mark.getDate() + graceDays)
  return mark.getTime() < Date.now()
}

function HistoryChart({ cfg, partnerId, year, loading, byYear, byMonth, invoices, onOpenInvoice }: {
  cfg: KindConfig
  partnerId: number
  year: number | null
  loading: boolean
  byYear: YearPoint[]
  byMonth: MonthlySeries | null
  invoices: RecentInvoice[]
  onOpenInvoice: (id: string) => void
}) {
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter | null>(null)
  // All Time reads best year-over-year; a specific year defaults to its
  // month-over-month story.
  const [view, setView] = useState<HistoryView>(year == null ? "yearly" : "monthly")
  useEffect(() => {
    if (year == null) setView("yearly")
  }, [year])

  // The invoice rollup under the chart follows the chart's scope: Monthly is
  // the selected year's story, Yearly is the all-time one. Page data already
  // carries the selected year's invoices; the all-time set (only needed when a
  // specific year is selected) is fetched once per partner and cached.
  const wantAllTime = view === "yearly" && year != null
  const [allTimeInvoices, setAllTimeInvoices] = useState<RecentInvoice[] | null>(null)
  useEffect(() => {
    setAllTimeInvoices(null)
  }, [partnerId, cfg.invoicesKey])
  useEffect(() => {
    if (!wantAllTime || allTimeInvoices != null) return
    const controller = new AbortController()
    fetchPageData({
      module: "dashboard",
      queries: [cfg.invoicesKey],
      params: { id: partnerId, year: null },
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return
        const rows = result[cfg.invoicesKey]
        setAllTimeInvoices(Array.isArray(rows) ? (rows as RecentInvoice[]) : [])
      })
      .catch(() => {})
    return () => controller.abort()
  }, [wantAllTime, allTimeInvoices, partnerId, cfg.invoicesKey])

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

  const scopedInvoices = wantAllTime ? allTimeInvoices : invoices
  const invoicesLoading = wantAllTime && allTimeInvoices == null
  const scopeLabel = view === "yearly" ? "All-Time" : String(chartYear)

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

      <InvoicesFooter
        scopeLabel={scopeLabel}
        invoices={scopedInvoices ?? []}
        loading={invoicesLoading}
        graceDays={cfg.overdueGraceDays}
        onOpen={setInvoiceFilter}
      />

      <InvoiceListModal
        cfg={cfg}
        scopeLabel={view === "yearly" ? "All Time" : String(chartYear)}
        filter={invoiceFilter}
        invoices={scopedInvoices ?? []}
        graceDays={cfg.overdueGraceDays}
        onClose={() => setInvoiceFilter(null)}
        onOpenInvoice={onOpenInvoice}
      />
    </Widget>
  )
}

/** Invoice rollup band under the history chart, scoped to the chart's view
 *  (selected year ↔ all-time). Each metric is a tile that opens the invoice
 *  modal filtered to what it counts. */
function InvoicesFooter({ scopeLabel, invoices, loading, graceDays, onOpen }: {
  scopeLabel: string
  invoices: RecentInvoice[]
  loading: boolean
  graceDays: number
  onOpen: (filter: InvoiceFilter) => void
}) {
  // Void (status 5) stays out of the rollups, matching the backend's summary
  // filters. The modal still lists voids under "all".
  const billable = invoices.filter((i) => i.status !== 5)
  const totalBilled = billable.reduce((s, i) => s + (i.value ?? 0), 0)
  // Net of credits — the outstanding modal lists every nonzero balance,
  // credit memos included, so its rows sum to exactly this figure.
  const totalOutstanding = billable.reduce((s, i) => s + (i.amountRemaining ?? 0), 0)
  const totalOverdue = billable
    .filter((i) => isInvoiceOverdue(i, graceDays))
    .reduce((s, i) => s + (i.amountRemaining ?? 0), 0)

  const tiles: {
    key: InvoiceFilter
    label: string
    value: string
    valueClass?: string
    enabled: boolean
  }[] = [
    {
      key: "all",
      label: `${scopeLabel} Invoices`,
      value: String(billable.length),
      enabled: invoices.length > 0,
    },
    {
      key: "all",
      label: "Total Billed",
      value: formatMoneyFull(totalBilled),
      enabled: invoices.length > 0,
    },
    {
      key: "outstanding",
      label: "Outstanding",
      value: formatMoneyFull(totalOutstanding),
      valueClass: totalOutstanding > 0 ? "invoice-amount-value--remaining" : undefined,
      enabled: billable.some((i) => (i.amountRemaining ?? 0) !== 0),
    },
  ]
  if (totalOverdue > 0) {
    tiles.push({
      key: "overdue",
      label: "Overdue",
      value: formatMoneyFull(totalOverdue),
      valueClass: "ptr-metric-overdue",
      enabled: true,
    })
  }

  return (
    <div className="ptr-fin-band" role="group" aria-label={`${scopeLabel} invoice summary`}>
      {tiles.map((t, i) => (
        <button
          key={`${t.key}-${i}`}
          type="button"
          className="ptr-fin-cell"
          onClick={() => onOpen(t.key)}
          disabled={loading || !t.enabled}
          title={t.enabled ? `View ${t.label.toLowerCase()}` : undefined}
        >
          <span className={`ptr-fin-cell-value${t.valueClass ? ` ${t.valueClass}` : ""}`}>
            {loading ? <span className="skel-line ptr-fin-cell-skel" /> : t.value}
          </span>
          <span className="ptr-fin-cell-label">
            {t.label}
            <ChevronRight size={12} className="ptr-fin-cell-chev" aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  )
}

const MODAL_ROW_CAP = 300

const FILTER_TITLES: Record<InvoiceFilter, string> = {
  all: "Invoices",
  outstanding: "Outstanding Invoices",
  overdue: "Overdue Invoices",
}

type InvSortKey = "invnum" | "description" | "job" | "date" | "status" | "amount" | "open"

function InvoiceListModal({ cfg, scopeLabel, filter, invoices, graceDays, onClose, onOpenInvoice }: {
  cfg: KindConfig
  scopeLabel: string
  filter: InvoiceFilter | null
  invoices: RecentInvoice[]
  graceDays: number
  onClose: () => void
  onOpenInvoice: (id: string) => void
}) {
  const open = filter != null
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(open)
  // Keep the last filter through the exit animation so the content doesn't
  // flash back to "all" while the modal fades out.
  const lastFilter = useRef<InvoiceFilter>("all")
  if (filter != null) lastFilter.current = filter
  const activeFilter = filter ?? lastFilter.current

  // Outstanding lists every nonzero balance — credit memos included, so the
  // list sums to the (net) tile figure. Overdue is positive past-due balances.
  const rows =
    activeFilter === "all"
      ? invoices
      : invoices.filter((i) =>
          i.status !== 5 &&
          (activeFilter === "outstanding"
            ? (i.amountRemaining ?? 0) !== 0
            : isInvoiceOverdue(i, graceDays))
        )
  // "All" totals bill; the open-balance filters total what's still owed.
  const rollup =
    activeFilter === "all"
      ? rows.filter((i) => i.status !== 5).reduce((s, i) => s + (i.value ?? 0), 0)
      : rows.reduce((s, i) => s + (i.amountRemaining ?? 0), 0)

  const sort = useTableSort<InvSortKey>("date", "desc")
  const sorted = applySort(rows, sort, (inv, key) =>
    key === "date"
      ? new Date(inv.invoiceDate).getTime()
      : key === "amount"
        ? inv.value ?? 0
        : key === "open"
          ? inv.amountRemaining ?? 0
          : key === "status"
            ? inv.status
            : key === "invnum"
              ? inv.invoiceNum
              : key === "job"
                ? inv.jobName ?? ""
                : inv.description ?? ""
  )
  const shown = sorted.slice(0, MODAL_ROW_CAP)

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
              className="modal reports-modal ptr-inv-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <div className="reports-modal-title">
                  <div>
                    <h2 className="title2 emphasized">
                      {FILTER_TITLES[activeFilter]} — {scopeLabel}
                    </h2>
                    <span className="reports-modal-subtitle">
                      {rows.length} invoice{rows.length === 1 ? "" : "s"} · {formatMoneyFull(rollup)}
                      {activeFilter === "all" ? "" : " open"}
                    </span>
                  </div>
                </div>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              <div className="reports-modal-body">
                {rows.length === 0 ? (
                  <p className="reports-modal-empty body-text text-secondary">
                    No {FILTER_TITLES[activeFilter].toLowerCase()} for this {cfg.noun.toLowerCase()}.
                  </p>
                ) : (
                  <table className="data-table billings-invoice-table">
                    <thead>
                      <tr>
                        <SortableHeader label="Invoice" columnKey="invnum" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Description" columnKey="description" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Job" columnKey="job" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Date" columnKey="date" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Status" columnKey="status" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Amount" columnKey="amount" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Open" columnKey="open" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((inv) => (
                        <tr
                          key={inv.id}
                          className="clickable-row"
                          onClick={() => onOpenInvoice(inv.id)}
                          title="View invoice details"
                          tabIndex={0}
                          role="button"
                          onKeyDown={(e) => e.key === "Enter" && onOpenInvoice(inv.id)}
                        >
                          <td>#{inv.invoiceNum}</td>
                          <td className="text-secondary ptr-inv-td-desc">{inv.description || "—"}</td>
                          <td className="text-secondary ptr-inv-td-desc">{inv.jobName || "—"}</td>
                          <td className="text-secondary">{formatDate(inv.invoiceDate)}</td>
                          <td>
                            <Badge tone={invoiceStatusTone(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
                          </td>
                          <td className="num">{formatMoneyFull(inv.value ?? 0)}</td>
                          <td className={`num ${(inv.amountRemaining ?? 0) !== 0 ? "" : "text-secondary"}`}>
                            {(inv.amountRemaining ?? 0) !== 0 ? formatMoneyFull(inv.amountRemaining) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={activeFilter === "all" ? 5 : 6}>Total</td>
                        {activeFilter === "all" && <td className="num">{formatMoneyFull(rollup)}</td>}
                        {activeFilter === "all" ? (
                          <td className="num">
                            {formatMoneyFull(rows.filter((i) => i.status !== 5).reduce((s, i) => s + (i.amountRemaining ?? 0), 0))}
                          </td>
                        ) : (
                          <td className="num">{formatMoneyFull(rollup)}</td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                )}
                {rows.length > MODAL_ROW_CAP && (
                  <p className="ptr-inv-footnote subheadline text-secondary">
                    Showing the first {MODAL_ROW_CAP} of {rows.length} invoices.
                  </p>
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

// ─── Jobcost-style deck primitives ────────────────────────────────────────────
// Same card grammar as the Job Costing board / Employees deck: dark command
// bar above white jc-project-cards with fixed-width head-stat slots and a
// height-animated body. (Values mirror EmployeesPage's ENTRANCE_EASE/EXPAND.)

const ENTRANCE_EASE = [0.25, 0.46, 0.45, 0.94] as const
const EXPAND: Transition = { duration: 0.38, ease: [0.4, 0, 0.2, 1] }

interface DeckStat {
  label: string
  value: string
  color?: string
}

function DeckCard({ name, subtitle, stats, open, entrance, index, onToggle, onReport, reportLabel, children }: {
  name: string
  subtitle: string
  stats: DeckStat[]
  open: boolean
  entrance: boolean
  index: number
  onToggle: () => void
  /** Opens the card's report (e.g. the property page); omit to hide the tile. */
  onReport?: () => void
  reportLabel?: string
  children: ReactNode
}) {
  return (
    <motion.div
      className={`jc-project-card${open ? " jc-project-card-open" : ""}`}
      initial={entrance ? { opacity: 0, y: 12, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay: entrance ? 0.08 + Math.min(index, 8) * 0.08 : 0, ease: ENTRANCE_EASE }}
    >
      <div
        className="jc-project-head"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onToggle()
          }
        }}
        aria-expanded={open}
      >
        <span className="jc-head-toggle">
          <ChevronRight size={15} className={`jc-expand-chevron${open ? " open" : ""}`} />
        </span>
        <span className="jc-project-title">
          <span className="jc-project-name-row">
            <span className="jc-project-name">{name}</span>
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
        {onReport && (
          <button
            type="button"
            className="jc-view-tile jc-view-tile-wide"
            aria-label={reportLabel ?? "Open report"}
            title={reportLabel ?? "Open report"}
            onClick={(e) => {
              e.stopPropagation()
              onReport()
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {reportLabel ?? "View"} <ExternalLink size={13} />
          </button>
        )}
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

function DeckGhosts() {
  return (
    <motion.div
      className="jc-skeleton-list"
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {Array.from({ length: 4 }, (_, i) => (
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
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}

// ─── Client projects — jobcost-style board ────────────────────────────────────

type BoardView = "property" | "project"

function ClientProjectsSection({ clientId, year }: { clientId: number; year: number | null }) {
  const { goToJobcost, goToProperty } = useJobcostNav()
  const marginColorsOn = useMarginColorsEnabled()
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
    <section className="ptr-deck-section">
      <div className="jc-command-bar">
        <SegmentedControl<BoardView>
          value={view}
          options={[
            { key: "property", label: "Property" },
            { key: "project", label: "Project" },
          ]}
          onChange={setView}
          layoutId="ptr-client-board-view"
          variant="jc"
          ariaLabel="Project grouping"
        />
        <span className="jc-cb-divider" aria-hidden="true" />
        {!loading && jobs.length > 0 && (
          <span className="jc-cb-legend">
            {formatMoneyFull(totalContract)} contract · {formatMargin(aggMargin)} margin
          </span>
        )}
        <span className="jc-cb-count">
          <span className="jc-cb-count-num">{groups.length}</span>{" "}
          {groups.length === 1 ? "Property" : "Properties"}
          {" · "}
          <span className="jc-cb-count-num">{jobs.length}</span>{" "}
          {jobs.length === 1 ? "Project" : "Projects"}
        </span>
      </div>

      <div className="jc-swap-stack">
        <AnimatePresence>{loading && <DeckGhosts key="ghosts" />}</AnimatePresence>
        {!loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }}>
            {jobs.length === 0 ? (
              <div className="jc-empty-note body-text text-secondary">
                No projects {year != null ? `in ${year}` : "on record"} for this client.
              </div>
            ) : view === "project" ? (
              <Widget className="co-widget jc-table-widget">
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
              </Widget>
            ) : (
              <div className="ptr-deck">
                {groups.map((g, i) => (
                  <DeckCard
                    key={g.key}
                    name={g.key}
                    subtitle={[
                      `${g.phases.length} ${g.phases.length === 1 ? "phase" : "phases"}`,
                      g.oneoffs.length > 0
                        ? `${g.oneoffs.length} one-off${g.oneoffs.length === 1 ? "" : "s"}`
                        : null,
                    ].filter(Boolean).join(" · ")}
                    stats={[
                      { label: "Contract", value: formatMoneyFull(g.contract) },
                      { label: "Cost", value: formatMoneyFull(g.totalCost) },
                      {
                        label: "Margin",
                        value: formatMargin(g.margin),
                        color: marginColorsOn && g.margin != null ? marginTextColor(g.margin) : undefined,
                      },
                    ]}
                    open={openGroup === g.key}
                    entrance
                    index={i}
                    onToggle={() => setOpenGroup((k) => (k === g.key ? null : g.key))}
                    onReport={() => goToProperty(g.key)}
                  >
                    <div className="jc-member-table">
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
                          {[...g.phases, ...g.oneoffs].map((m) => (
                            <tr
                              key={m.recnum}
                              className="spend-rank-table-row"
                              onClick={() => goToJobcost(Number(m.jobNumber))}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === "Enter" && goToJobcost(Number(m.jobNumber))}
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
                    </div>
                  </DeckCard>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </section>
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
  const { goToJobcost, goToProperty } = useJobcostNav()
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
    <section className="ptr-deck-section">
      <div className="jc-command-bar">
        <SegmentedControl<ContribView>
          value={view}
          options={[
            { key: "properties", label: "Properties" },
            { key: "phases", label: "Phases" },
          ]}
          onChange={setView}
          layoutId="ptr-contrib-view"
          variant="jc"
          ariaLabel="Contribution grouping"
        />
        <span className="jc-cb-divider" aria-hidden="true" />
        <span className="jc-cb-count">
          <span className="jc-cb-count-num">{groups.length}</span>{" "}
          {groups.length === 1 ? "Property" : "Properties"}
          {" · "}
          <span className="jc-cb-count-num">{rows.length}</span>{" "}
          {rows.length === 1 ? "Phase" : "Phases"}
        </span>
      </div>

      <div className="jc-swap-stack">
        <AnimatePresence>{loading && <DeckGhosts key="ghosts" />}</AnimatePresence>
        {!loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }}>
            {rows.length === 0 ? (
              <div className="jc-empty-note body-text text-secondary">
                No posted costs {year != null ? `in ${year}` : "on record"} for this {cfg.noun.toLowerCase()}.
              </div>
            ) : view === "properties" ? (
              <div className="ptr-deck">
                {groups.map((g, i) => {
                  const share = g.totalCost > 0 ? (g.partnerCost / g.totalCost) * 100 : null
                  return (
                    <DeckCard
                      key={g.key}
                      name={g.key}
                      subtitle={`${g.rows.length} ${g.rows.length === 1 ? "phase" : "phases"}`}
                      stats={[
                        { label: "Their Work", value: formatMoneyFull(g.partnerCost) },
                        { label: "Total Cost", value: formatMoneyFull(g.totalCost) },
                        {
                          label: "Of Spend",
                          value: share != null ? formatShare(share) : "—",
                          color: "var(--primary-color)",
                        },
                      ]}
                      open={openGroup === g.key}
                      entrance
                      index={i}
                      onToggle={() => setOpenGroup((k) => (k === g.key ? null : g.key))}
                      onReport={g.isProperty ? () => goToProperty(g.key) : undefined}
                    >
                      <div className="jc-member-table">
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
                      </div>
                    </DeckCard>
                  )
                })}
              </div>
            ) : (
              <Widget className="co-widget jc-table-widget">
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
              </Widget>
            )}
          </motion.div>
        )}
      </div>
    </section>
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
