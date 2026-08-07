import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, type Transition } from "framer-motion"
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Download, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData, usePageYear } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { Widget } from "../../shared/components/Widget/Widget"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import { Chart } from "../../shared/components/Chart/Chart"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import {
  MonthlyDetailTable,
  collapseValue,
} from "../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { colorRamp, RAMP_SCHEMES } from "../../shared/config/chartColors"
import { shortMonth, fullMonth, formatMoneyFull, formatDate } from "../../shared/utils/format"
import { downloadXlsx } from "../../shared/utils/exportXlsx"
import { buildMonthlyBreakdownXlsx } from "./exportMonthlyBreakdownXlsx"
import type { LineMarker, SpendItem } from "../../shared/components/Chart/chart.types"
import { useOnboarding } from "../../core/onboarding/OnboardingProvider"
import { SECTION_OVERHEAD_REPORT } from "../../core/onboarding/markers"
import { SegmentedControl } from "../../shared/components/SegmentedControl"

// Full overhead-spending report (Finances → Overhead Report). Where the
// dashboard's /dashboard/breakdown/overhead drill-down shows one chart and
// the monthly table, this page adds the category donut (per 6xxx GL account),
// a per-category cost modal, cumulative + YoY views, and derived stats. Both
// years of every comparison are capped at the same month on the backend
// (overheadCategoryComparison) so mid-year deltas are apples-to-apples.

// Row travel when the Top Movers ranking flips between $ and % — the same
// soft-landing spring as the jobcost pinned-property reorder glide.
const REORDER_SPRING: Transition = {
  type: "spring",
  bounce: 0.18,
  visualDuration: 0.45,
}

const BRAND_ORANGE = "#c27c3e"
const PREVIOUS_YEAR_COLOR = "#94a3b8"
// Muted clay / sage rather than alert red / green: on a report where most
// numbers grow most years, full-saturation red made the whole page read as an
// alarm. Direction still reads, but as information, not a siren.
const UP_COLOR = "#b3574f" // overhead growing = worth attention
const DOWN_COLOR = "#4d8f66" // overhead shrinking = good

interface MonthRow {
  month: number
  year: number
  [key: string]: number
}

interface CategoryRow {
  account_number: number | string
  account_name: string
  current_amount: number
  previous_amount: number
}

interface AnnualRow {
  year: number
  overhead: number
}

interface OpenMonthPayload {
  openMonthPeriod?: number
  openMonthYear?: number
}

type LineItem = Record<string, unknown>

interface PageData extends Record<string, unknown> {
  monthlyOverheadComparison: MonthRow[] | null
  monthlyRevenueComparison: MonthRow[] | null
  overheadCategoryComparison: CategoryRow[] | null
  annualOverheadTrend: AnnualRow[] | null
  overheadLineItems: LineItem[] | null
  openMonthFinances: OpenMonthPayload | null
}

function yearRows(rows: MonthRow[] | null | undefined, year: number): MonthRow[] {
  return (rows ?? [])
    .filter((r) => r.year === year && r.month >= 1 && r.month <= 12)
    .sort((a, b) => a.month - b.month)
}

/** Vertical dashed "Open" reference marker, shared by the two line charts. */
function openMonthMarkers(
  openMonth: number | null,
  openYear: number | null,
  year: number,
): LineMarker[] | undefined {
  if (openMonth == null || openYear == null) return undefined
  if (year !== openYear && year - 1 !== openYear) return undefined
  return [
    {
      axis: "x",
      value: shortMonth(openMonth),
      legend: "Open",
      legendOrientation: "vertical",
      legendPosition: "top",
      lineStyle: {
        stroke: PREVIOUS_YEAR_COLOR,
        strokeWidth: 1.25,
        strokeDasharray: "4 4",
        strokeOpacity: 0.7,
      },
      textStyle: { fill: PREVIOUS_YEAR_COLOR, fontSize: 10, fontWeight: 600 },
    },
  ]
}

/** YoY pill pinned to a stat card's top-right corner ("▼ 4% vs ’25").
 *  Overhead growing reads red, shrinking green; values within a rounding
 *  whisker read neutral. `unit: "points"` compares two percentages directly
 *  ("▼ 0.8 pt vs ’25"). `hint` carries the precise comparison as a tooltip. */
function DeltaPill({
  current,
  previous,
  lastYear,
  hint,
  unit = "percent",
}: {
  current: number
  previous: number
  lastYear: number
  hint: string
  unit?: "percent" | "points"
}) {
  if (!previous) return null
  const delta = current - previous
  const magnitude =
    unit === "percent" ? Math.abs(delta / Math.abs(previous)) * 100 : Math.abs(delta)
  const up = delta > 0
  const flat = unit === "percent" ? magnitude < 0.5 : magnitude < 0.05
  const color = flat ? "var(--secondary-text)" : up ? UP_COLOR : DOWN_COLOR
  const figure = unit === "percent" ? `${magnitude.toFixed(0)}%` : `${magnitude.toFixed(1)} pt`
  return (
    <span
      className="ohr-kpi-pill"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
      title={hint}
    >
      {flat ? "±" : up ? "▲" : "▼"} {figure} vs ’{String(lastYear).slice(-2)}
    </span>
  )
}

type ModalSortKey = "date" | "trnnum" | "description" | "month" | "amount"

interface ModalCategory {
  id: string
  name: string
}

/**
 * Every individual GL cost line behind one pie category. Rows come from the
 * already-fetched overheadLineItems payload (no extra fetch) filtered by the
 * account FK; when the selected year holds the open period the rows are also
 * capped at the open month so the modal total reconciles with the pie slice.
 */
function OverheadCategoryModal({
  category,
  onClose,
  lineItems,
  monthCap,
}: {
  category: ModalCategory | null
  onClose: () => void
  lineItems: LineItem[] | null
  monthCap: number | null
}) {
  const open = category !== null
  const sort = useTableSort<ModalSortKey>("date", "desc")
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(open)

  const rows = useMemo(() => {
    if (!category || !Array.isArray(lineItems)) return []
    return lineItems.filter((li) => {
      if (String(collapseValue(li.lgract)) !== category.id) return false
      const month = Number(collapseValue(li.month))
      return monthCap == null || (month >= 1 && month <= monthCap)
    })
  }, [category, lineItems, monthCap])

  const sorted = useMemo(
    () =>
      applySort(rows, sort, (li, key) =>
        key === "date"
          ? new Date(String(collapseValue(li.trndte) ?? "")).getTime() || 0
          : key === "amount"
            ? Number(collapseValue(li.net) ?? 0)
            : key === "month"
              ? Number(collapseValue(li.month) ?? 0)
              : key === "trnnum"
                ? String(collapseValue(li.trnnum) ?? "")
                : String(collapseValue(li.dscrpt) ?? ""),
      ),
    [rows, sort],
  )

  const total = rows.reduce((sum, li) => sum + Number(collapseValue(li.net) ?? 0), 0)

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
                    <h2 className="title2 emphasized">{category?.name}</h2>
                    <span className="reports-modal-subtitle">
                      Account {category?.id} · {rows.length} cost
                      {rows.length === 1 ? "" : "s"} · {formatMoneyFull(total)}
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
                    No costs recorded for this category.
                  </p>
                ) : (
                  <table className="data-table billings-invoice-table">
                    <thead>
                      <tr>
                        <SortableHeader
                          label="Date"
                          columnKey="date"
                          activeKey={sort.key}
                          dir={sort.dir}
                          onSort={sort.toggle}
                        />
                        <SortableHeader
                          label="Trans #"
                          columnKey="trnnum"
                          activeKey={sort.key}
                          dir={sort.dir}
                          onSort={sort.toggle}
                        />
                        <SortableHeader
                          label="Description"
                          columnKey="description"
                          activeKey={sort.key}
                          dir={sort.dir}
                          onSort={sort.toggle}
                        />
                        <SortableHeader
                          label="Month"
                          columnKey="month"
                          activeKey={sort.key}
                          dir={sort.dir}
                          onSort={sort.toggle}
                        />
                        <SortableHeader
                          label="Amount"
                          columnKey="amount"
                          activeKey={sort.key}
                          dir={sort.dir}
                          onSort={sort.toggle}
                          align="right"
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((li, i) => {
                        const month = Number(collapseValue(li.month))
                        return (
                          <tr key={i}>
                            <td className="text-secondary">
                              {formatDate(collapseValue(li.trndte))}
                            </td>
                            <td>{String(collapseValue(li.trnnum) ?? "—")}</td>
                            <td>{String(collapseValue(li.dscrpt) ?? "") || "—"}</td>
                            <td>{month >= 1 && month <= 12 ? fullMonth(month) : "Adjustment"}</td>
                            <td className="num">
                              {formatMoneyFull(Number(collapseValue(li.net) ?? 0))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>Total</td>
                        <td className="num">{formatMoneyFull(total)}</td>
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
    document.body,
  )
}

/**
 * The "Other" tail of the category donut: every account past the top 7, as a
 * ranked list. Clicking a row drills into that category's cost modal, which
 * stacks ON TOP of this one (useModalLayer), so the user can dip into a
 * category's costs and pop back to the full list.
 */
function OtherCategoriesModal({
  open,
  categories,
  total,
  onSelect,
  onClose,
}: {
  open: boolean
  categories: CategoryRow[]
  total: number
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(open)
  const otherTotal = categories.reduce((s, c) => s + (c.current_amount || 0), 0)

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
                    <h2 className="title2 emphasized">Other Categories</h2>
                    <span className="reports-modal-subtitle">
                      {categories.length} account
                      {categories.length === 1 ? "" : "s"} · {formatMoneyFull(otherTotal)}
                    </span>
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
                      <th>Category</th>
                      <th className="num">Amount</th>
                      <th className="num">% of Overhead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => {
                      const pct = total > 0 ? (c.current_amount / total) * 100 : 0
                      return (
                        <tr
                          key={c.account_number}
                          className="ohr-other-row"
                          onClick={() => onSelect(String(c.account_number))}
                        >
                          <td>{c.account_name}</td>
                          <td className="num">{formatMoneyFull(c.current_amount)}</td>
                          <td className="num text-secondary">{pct.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function OverheadReportContent({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const navigate = useNavigate()
  const pageYear = usePageYear()
  const lastYear = pageYear - 1
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  // One trend widget, two reads: month-by-month spending or the running total.
  const [trendView, setTrendView] = useState<"monthly" | "cumulative">("monthly")
  // Top Movers ranks by dollar swing or percent swing — one leads at a time.
  const [moversBy, setMoversBy] = useState<"dollars" | "percent">("dollars")
  const [modalCategory, setModalCategory] = useState<ModalCategory | null>(null)
  // The category donut rolls everything past the top 7 into one "Other" slice;
  // clicking it opens a modal listing the remainder, each of which drills into
  // its own cost modal on top.
  const [otherModalOpen, setOtherModalOpen] = useState(false)

  const { data, isLoading } = useWidgetData<PageData>([
    "monthlyOverheadComparison",
    "monthlyRevenueComparison",
    "overheadCategoryComparison",
    "annualOverheadTrend",
    "overheadLineItems",
    "openMonthFinances",
  ])

  const openMonth = data?.openMonthFinances?.openMonthPeriod ?? null
  const openYear = data?.openMonthFinances?.openMonthYear ?? null

  const categories = useMemo(() => {
    const raw = data?.overheadCategoryComparison
    return Array.isArray(raw) ? raw : []
  }, [data])

  const lineItems = data?.overheadLineItems ?? null

  // ── Totals (both sides capped at the same month by the backend query) ──
  const totalCurrent = categories.reduce((s, c) => s + (c.current_amount || 0), 0)
  const totalPrevious = categories.reduce((s, c) => s + (c.previous_amount || 0), 0)

  const currentMonthRows = useMemo(
    () => yearRows(data?.monthlyOverheadComparison, pageYear),
    [data, pageYear],
  )
  const monthsElapsed = currentMonthRows.length
  const avgMonthly = monthsElapsed > 0 ? totalCurrent / monthsElapsed : null
  // Prior-year monthly average over the SAME elapsed months — totalPrevious is
  // already capped at the open month by the backend, so dividing by the same
  // count keeps the comparison apples-to-apples.
  const avgMonthlyPrev = monthsElapsed > 0 ? totalPrevious / monthsElapsed : null
  const runRate = monthsElapsed > 0 ? (totalCurrent / monthsElapsed) * 12 : null
  const lastYearActual =
    (data?.annualOverheadTrend ?? []).find((r) => r.year === lastYear)?.overhead ?? 0

  // ── Trend widget series: month-by-month, or the cumulative running sum,
  //    switched by the widget's Monthly / Running total toggle ──
  const trendSeries = useMemo(() => {
    const raw = data?.monthlyOverheadComparison
    if (!Array.isArray(raw) || raw.length === 0) return null
    const toSeries = (y: number, color: string) => {
      let sum = 0
      const points = yearRows(raw, y).map((r) => {
        sum += r.overhead ?? 0
        return {
          x: shortMonth(r.month),
          y: trendView === "cumulative" ? sum : (r.overhead ?? 0),
        }
      })
      return { id: String(y), color, data: points }
    }
    return [toSeries(pageYear, BRAND_ORANGE), toSeries(lastYear, PREVIOUS_YEAR_COLOR)]
  }, [data, pageYear, lastYear, trendView])

  // ── Overhead as % of revenue, month by month for both years ──
  const pctOfRevenueSeries = useMemo(() => {
    const overhead = data?.monthlyOverheadComparison
    const revenue = data?.monthlyRevenueComparison
    if (!Array.isArray(overhead) || !Array.isArray(revenue)) return null
    const toSeries = (y: number, color: string) => ({
      id: String(y),
      color,
      data: yearRows(overhead, y).flatMap((o) => {
        const rev = revenue.find((r) => r.year === y && r.month === o.month)?.revenue
        if (!rev) return []
        return [{ x: shortMonth(o.month), y: ((o.overhead ?? 0) / rev) * 100 }]
      }),
    })
    const series = [toSeries(pageYear, BRAND_ORANGE), toSeries(lastYear, PREVIOUS_YEAR_COLOR)]
    return series.some((s) => s.data.length > 0) ? series : null
  }, [data, pageYear, lastYear])

  // ── Overhead as a share of revenue, YTD (headline KPI) ──
  // Both years summed over the same elapsed months so the comparison is
  // apples-to-apples, mirroring how the backend caps the category query.
  const pctOfRevenue = useMemo(() => {
    const sum = (rows: MonthRow[] | null | undefined, y: number, key: string) =>
      yearRows(rows, y)
        .filter((r) => r.month <= monthsElapsed)
        .reduce((s, r) => s + (Number(r[key]) || 0), 0)
    const ratio = (y: number) => {
      const rev = sum(data?.monthlyRevenueComparison, y, "revenue")
      return rev ? (sum(data?.monthlyOverheadComparison, y, "overhead") / rev) * 100 : null
    }
    return { current: ratio(pageYear), previous: ratio(lastYear) }
  }, [data, pageYear, lastYear, monthsElapsed])

  // ── Category donut: top 10 explicit, the long tail folded into "Other" ──
  // A 20-slice donut is unreadable and a 20-row list swallows the page. The
  // remainder rolls into one slice whose click opens the tail modal — small
  // categories stay one tap from their costs.
  const OTHER_ID = "__other__"
  const sortedCats = useMemo(
    () =>
      categories
        .filter((c) => c.current_amount > 0)
        .sort((a, b) => b.current_amount - a.current_amount),
    [categories],
  )
  const topCats = sortedCats.slice(0, 10)
  const restCats = sortedCats.slice(10)
  const restTotal = restCats.reduce((s, c) => s + c.current_amount, 0)
  const pieItems: SpendItem[] = useMemo(() => {
    const top = topCats.map((c) => ({
      id: String(c.account_number),
      label: c.account_name,
      value: c.current_amount,
    }))
    return restCats.length
      ? [
          ...top,
          {
            id: OTHER_ID,
            label: `Other (${restCats.length} categories)`,
            value: restTotal,
          },
        ]
      : top
  }, [topCats, restCats, restTotal])
  const { hue, drift } = RAMP_SCHEMES.orange
  const pieColors = colorRamp(hue, drift, Math.max(pieItems.length, 1))

  // ── Top movers vs last year ──
  // Ranked by whichever metric the widget's toggle has in the lead. Percent
  // mode drops categories with no prior-year spend (a change from $0 has no
  // meaningful percentage and would rank as infinite).
  const movers = useMemo(() => {
    const all = categories
      .map((c) => ({
        id: String(c.account_number),
        name: c.account_name,
        delta: (c.current_amount || 0) - (c.previous_amount || 0),
        previous: c.previous_amount || 0,
      }))
      .filter((m) => Math.abs(m.delta) >= 1)
    return (
      moversBy === "percent"
        ? all
            .filter((m) => m.previous !== 0)
            .sort(
              (a, b) =>
                Math.abs(b.delta / Math.abs(b.previous)) - Math.abs(a.delta / Math.abs(a.previous)),
            )
        : all.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    ).slice(0, 6)
  }, [categories, moversBy])

  // ── Annual overhead, as a trend line across years ──
  const annualSeries = useMemo(() => {
    const points = (data?.annualOverheadTrend ?? [])
      .filter((r) => r.year > 0)
      .sort((a, b) => a.year - b.year)
      .map((r) => ({ x: String(r.year), y: r.overhead }))
    return points.length ? [{ id: "Overhead", color: BRAND_ORANGE, data: points }] : null
  }, [data])

  // ── Monthly table + export (same machinery as the breakdown page) ──
  const monthlyTotals = useMemo(
    () => currentMonthRows.map((r) => ({ month: r.month, value: r.overhead ?? 0 })),
    [currentMonthRows],
  )

  function handlePointClick(x: string) {
    const monthNum = currentMonthRows.find((r) => shortMonth(r.month) === x)?.month
    if (monthNum == null) return
    setSelectedMonth((curr) => (curr === monthNum ? null : monthNum))
  }

  function handleExport() {
    if (!lineItems) return
    const { rows, lineItemHeaderRow, lineItemCols } = buildMonthlyBreakdownXlsx({
      title: "Overhead Expense Report",
      totalLabel: "Overhead",
      year: pageYear,
      monthlyTotals,
      lineItems,
      kpis: [
        {
          label: `Total Overhead (${pageYear})`,
          value: totalCurrent,
          format: "money",
        },
        {
          label: `Total Overhead (${lastYear}, same period)`,
          value: totalPrevious,
          format: "money",
        },
        { label: "Avg / Month", value: avgMonthly, format: "money" },
        { label: "Projected Run Rate", value: runRate, format: "money" },
        {
          label: "Overhead Share of Revenue",
          value: pctOfRevenue.current,
          format: "percent",
        },
      ],
      monthlyPrevious: yearRows(data?.monthlyOverheadComparison, lastYear).map((r) => ({
        month: r.month,
        value: r.overhead ?? 0,
      })),
      categories: categories.map((c) => ({
        accountNumber: c.account_number,
        accountName: c.account_name,
        current: c.current_amount || 0,
        previous: c.previous_amount || 0,
      })),
    })
    const date = new Date().toISOString().slice(0, 10)
    downloadXlsx(rows, `Overhead_Expense_Report_${pageYear}_${date}.xlsx`, `Overhead ${pageYear}`, {
      autoFilterRow: lineItemHeaderRow,
      autoFilterCols: lineItemCols,
    })
  }

  const openModal = (id: string) => {
    const cat = categories.find((c) => String(c.account_number) === id)
    if (cat) setModalCategory({ id, name: cat.account_name })
  }

  // Donut/list click: the synthetic "Other" slice opens the tail modal; a real
  // category opens its cost modal.
  const handleCatClick = (id: string) => (id === OTHER_ID ? setOtherModalOpen(true) : openModal(id))

  // Line items span the full posted year while the pie is capped at the open
  // month — cap the modal the same way so its total matches the slice.
  const modalMonthCap = pageYear === openYear && openMonth != null ? openMonth : null

  const noData = !isLoading && categories.length === 0 && currentMonthRows.length === 0

  return (
    <Page
      title="Overhead Expense Report"
      actions={
        <>
          <button
            className="jc-export-btn"
            onClick={() => navigate("/dashboard")}
            title="Back to dashboard"
          >
            <ArrowLeft size={14} /> Dashboard
          </button>
          <button
            className="jc-export-btn"
            onClick={handleExport}
            disabled={isLoading || !lineItems || lineItems.length === 0}
            title="Export report to Excel"
          >
            <Download size={14} /> Export Report
          </button>
          <YearSelector value={year} onChange={setYear} />
        </>
      }
    >
      <MotionList className="widget-grid widget-grid-2">
        {/* ── Summary strip ─────────────────────────────────────────────── */}
        <MotionItem className="col-span-full">
          <div className="stat-grid ohr-kpi-grid">
            <StatWidget
              title={`${pageYear} Overhead`}
              value={noData ? null : totalCurrent}
              loading={isLoading}
              badge={
                totalPrevious ? (
                  <DeltaPill
                    current={totalCurrent}
                    previous={totalPrevious}
                    lastYear={lastYear}
                    hint={`Compared with ${lastYear} through the same month`}
                  />
                ) : undefined
              }
            />
            <StatWidget
              title="Avg / Month"
              value={avgMonthly}
              loading={isLoading}
              badge={
                avgMonthly != null && avgMonthlyPrev ? (
                  <DeltaPill
                    current={avgMonthly}
                    previous={avgMonthlyPrev}
                    lastYear={lastYear}
                    hint={`Compared with the ${lastYear} monthly average over the same months`}
                  />
                ) : undefined
              }
            />
            <StatWidget
              title="Projected Run Rate"
              value={runRate}
              loading={isLoading}
              badge={
                runRate != null && lastYearActual !== 0 ? (
                  <DeltaPill
                    current={runRate}
                    previous={lastYearActual}
                    lastYear={lastYear}
                    hint={`Compared with actual ${lastYear} full-year overhead`}
                  />
                ) : undefined
              }
            />
            <StatWidget
              title="Share of Revenue"
              value={pctOfRevenue.current}
              loading={isLoading}
              format={(v) => `${v.toFixed(1)}%`}
              badge={
                pctOfRevenue.current != null && pctOfRevenue.previous != null ? (
                  <DeltaPill
                    current={pctOfRevenue.current}
                    previous={pctOfRevenue.previous}
                    lastYear={lastYear}
                    unit="points"
                    hint={`Overhead ÷ revenue, both years through the same month (${lastYear}: ${pctOfRevenue.previous.toFixed(1)}%)`}
                  />
                ) : undefined
              }
            />
          </div>
        </MotionItem>

        {/* ── Trend + biggest changes ───────────────────────────────────── */}
        <MotionItem>
          <Widget
            title="Overhead by Month"
            loading={isLoading}
            noData={!trendSeries}
            actions={
              <SegmentedControl
                variant="ohr"
                ariaLabel="Trend view"
                layoutId="ohrTrendThumb"
                value={trendView}
                options={[
                  { key: "monthly", label: "Monthly" },
                  { key: "cumulative", label: "Running total" },
                ]}
                onChange={setTrendView}
              />
            }
          >
            {trendSeries && (
              <Chart
                config={{
                  type: "line",
                  series: trendSeries,
                  legend: true,
                  enableArea: true,
                  markers: openMonthMarkers(openMonth, openYear, pageYear),
                  pulsePoint:
                    openMonth != null && openYear === pageYear
                      ? {
                          seriesId: String(pageYear),
                          xValue: shortMonth(openMonth),
                          color: BRAND_ORANGE,
                        }
                      : undefined,
                  onPointClick: handlePointClick,
                  highlightedX: selectedMonth != null ? shortMonth(selectedMonth) : null,
                }}
              />
            )}
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget
            title={`Top Movers vs ${lastYear}`}
            loading={isLoading}
            noData={!isLoading && movers.length === 0}
            actions={
              <SegmentedControl
                variant="ohr"
                ariaLabel="Rank movers by"
                layoutId="ohrMoversThumb"
                value={moversBy}
                options={[
                  { key: "dollars", label: "By $" },
                  { key: "percent", label: "By %" },
                ]}
                onChange={setMoversBy}
              />
            }
          >
            <ol className="ohr-movers">
              {/* Rows glide to their new rank when the toggle flips; rows
                  falling out of / into the top 6 fade while the rest travel. */}
              <AnimatePresence initial={false} mode="popLayout">
                {movers.map((m) => {
                  const up = m.delta > 0
                  const sign = up ? "+" : "−"
                  const color = up ? UP_COLOR : DOWN_COLOR
                  const pct =
                    m.previous !== 0 ? Math.abs((m.delta / Math.abs(m.previous)) * 100) : null
                  const amount = `${sign}${formatMoneyFull(Math.abs(m.delta))}`
                  const percent = pct != null ? `${sign}${pct.toFixed(0)}%` : null
                  // The toggled metric leads in color; the other drops to the
                  // muted context line so the two never compete.
                  const primary = moversBy === "percent" ? percent : amount
                  const secondary = moversBy === "percent" ? amount : percent
                  return (
                    <motion.li
                      key={m.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        layout: REORDER_SPRING,
                        opacity: { duration: 0.18 },
                      }}
                      className="ohr-mover"
                      onClick={() => openModal(m.id)}
                    >
                      <span
                        className="ohr-mover-icon"
                        style={{
                          color,
                          background: `color-mix(in srgb, ${color} 14%, transparent)`,
                        }}
                      >
                        {up ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                      </span>
                      <span className="ohr-mover-name">{m.name}</span>
                      <span className="ohr-mover-figures">
                        {/* Ink, not delta-colored — the tinted arrow badge
                            already carries direction; six colored amounts in a
                            column turned the list into a wall of red. */}
                        <span className="ohr-mover-amt">{primary}</span>
                        {secondary != null && (
                          <span className="ohr-mover-pct">
                            {secondary} vs {lastYear}
                          </span>
                        )}
                      </span>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ol>
          </Widget>
        </MotionItem>

        {/* ── Composition: where the money goes ─────────────────────────── */}
        <MotionItem className="col-span-full">
          <Widget
            title="Overhead by Category"
            loading={isLoading}
            noData={!isLoading && pieItems.length === 0}
          >
            <Chart
              config={{
                type: "pie-with-list",
                items: pieItems,
                previewCount: pieItems.length,
                centerLabel: "OVERHEAD",
                centerTotal: totalCurrent,
                colors: pieColors,
                chartSize: "lg",
                showPercent: true,
                onItemClick: handleCatClick,
              }}
            />
          </Widget>
        </MotionItem>

        {/* Every dollar, month by month. Clicking a month on "Overhead by
            Month" filters this table to that month. */}
        <MotionItem className="col-span-full">
          <Widget
            title="Monthly Spending"
            description={
              selectedMonth != null ? `Showing ${fullMonth(selectedMonth)} only` : undefined
            }
            loading={isLoading && lineItems === null}
            className="mbp-table-widget"
            actions={
              selectedMonth != null ? (
                <button
                  className="widget-link-btn"
                  onClick={() => setSelectedMonth(null)}
                  title="Clear month selection"
                >
                  <X size={12} /> Clear {fullMonth(selectedMonth)}
                </button>
              ) : undefined
            }
          >
            <MonthlyDetailTable
              monthlyTotals={monthlyTotals}
              lineItems={lineItems}
              isLoading={isLoading}
              totalLabel="Overhead"
              filterMonth={selectedMonth}
            />
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget
            title="Share of Revenue by Month"
            loading={isLoading}
            noData={!pctOfRevenueSeries}
          >
            {pctOfRevenueSeries && (
              <Chart
                config={{
                  type: "line",
                  series: pctOfRevenueSeries,
                  legend: true,
                  yFormat: (v) => `${v.toFixed(1)}%`,
                  markers: openMonthMarkers(openMonth, openYear, pageYear),
                  pulsePoint:
                    openMonth != null && openYear === pageYear
                      ? {
                          seriesId: String(pageYear),
                          xValue: shortMonth(openMonth),
                          color: BRAND_ORANGE,
                        }
                      : undefined,
                }}
              />
            )}
          </Widget>
        </MotionItem>

        {/* ── Long view (shares the row with Share of Revenue above) ─────── */}
        <MotionItem>
          <Widget title="Annual Overhead" loading={isLoading} noData={!isLoading && !annualSeries}>
            {annualSeries && (
              <Chart
                config={{
                  type: "line",
                  series: annualSeries,
                  enableArea: true,
                  curve: "monotoneX",
                  yFormat: formatMoneyFull,
                  // The open/in-progress year is the "you are here" point.
                  pulsePoint:
                    openYear != null && annualSeries[0].data.some((p) => p.x === String(openYear))
                      ? {
                          seriesId: "Overhead",
                          xValue: String(openYear),
                          color: BRAND_ORANGE,
                        }
                      : undefined,
                }}
              />
            )}
          </Widget>
        </MotionItem>
      </MotionList>

      <OtherCategoriesModal
        open={otherModalOpen}
        categories={restCats}
        total={totalCurrent}
        onSelect={openModal}
        onClose={() => setOtherModalOpen(false)}
      />

      <OverheadCategoryModal
        category={modalCategory}
        onClose={() => setModalCategory(null)}
        lineItems={lineItems}
        monthCap={modalMonthCap}
      />
    </Page>
  )
}

export default function OverheadReportPage() {
  const [year, setYear] = useState(new Date().getFullYear())

  // Visiting the report is the strongest possible acknowledgment of its
  // "new section" nav hint — clear the milestone so the hint never shows
  // (or stops showing) once the user has found the page.
  const { seen, acknowledge } = useOnboarding()
  useEffect(() => {
    if (!seen(SECTION_OVERHEAD_REPORT)) acknowledge(SECTION_OVERHEAD_REPORT)
  }, [seen, acknowledge])

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.overheadReport} params={{ year }}>
      <OverheadReportContent year={year} setYear={setYear} />
    </PageDataProvider>
  )
}
