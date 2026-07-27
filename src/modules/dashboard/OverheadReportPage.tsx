import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Download, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData, usePageYear } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { Widget } from "../../shared/components/Widget/Widget"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import { Chart } from "../../shared/components/Chart/Chart"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { MonthlyDetailTable, collapseValue } from "../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import { MonthlyYearComparisonWidget } from "./widgets/MonthlyYearComparisonWidget"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { colorRamp, RAMP_SCHEMES } from "../../shared/config/chartColors"
import { shortMonth, fullMonth, formatMoneyFull, formatDate } from "../../shared/utils/format"
import { downloadXlsx } from "../../shared/utils/exportXlsx"
import { buildMonthlyBreakdownXlsx } from "./exportMonthlyBreakdownXlsx"
import type { LineMarker, SpendItem } from "../../shared/components/Chart/chart.types"

// Full overhead-spending report (Finances → Overhead Report). Where the
// dashboard's /dashboard/breakdown/overhead drill-down shows one chart and
// the monthly table, this page adds the category donut (per 6xxx GL account),
// a per-category cost modal, cumulative + YoY views, and derived stats. Both
// years of every comparison are capped at the same month on the backend
// (overheadCategoryComparison) so mid-year deltas are apples-to-apples.

const BRAND_ORANGE = "#c27c3e"
const PREVIOUS_YEAR_COLOR = "#94a3b8"
const UP_COLOR = "#ef4444" // overhead growing = bad
const DOWN_COLOR = "#22c55e" // overhead shrinking = good

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

/** Signed YoY caption under a stat: red when overhead is up, green when down. */
function DeltaCaption({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0) return null
  const delta = current - previous
  const pct = (delta / Math.abs(previous)) * 100
  return (
    <span className="ohr-stat-caption">
      <span style={{ color: delta > 0 ? UP_COLOR : DOWN_COLOR }}>
        {delta > 0 ? "↑" : "↓"} {formatMoneyFull(Math.abs(delta))} ({Math.abs(pct).toFixed(1)}%)
      </span>{" "}
      {label}
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
  const { overlayZ, contentZ } = useModalLayer(open)

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
                    <h2 className="title2 emphasized">{category?.name}</h2>
                    <span className="reports-modal-subtitle">
                      Account {category?.id} · {rows.length} cost{rows.length === 1 ? "" : "s"} ·{" "}
                      {formatMoneyFull(total)}
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
                        <SortableHeader label="Date" columnKey="date" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Trans #" columnKey="trnnum" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Description" columnKey="description" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Month" columnKey="month" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Amount" columnKey="amount" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((li, i) => {
                        const month = Number(collapseValue(li.month))
                        return (
                          <tr key={i}>
                            <td className="text-secondary">{formatDate(collapseValue(li.trndte))}</td>
                            <td>{String(collapseValue(li.trnnum) ?? "—")}</td>
                            <td>{String(collapseValue(li.dscrpt) ?? "") || "—"}</td>
                            <td>{month >= 1 && month <= 12 ? fullMonth(month) : "Adjustment"}</td>
                            <td className="num">{formatMoneyFull(Number(collapseValue(li.net) ?? 0))}</td>
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

function OverheadReportContent({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const navigate = useNavigate()
  const pageYear = usePageYear()
  const lastYear = pageYear - 1
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [modalCategory, setModalCategory] = useState<ModalCategory | null>(null)

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
  const runRate = monthsElapsed > 0 ? (totalCurrent / monthsElapsed) * 12 : null
  const lastYearActual =
    (data?.annualOverheadTrend ?? []).find((r) => r.year === lastYear)?.overhead ?? 0

  // ── Cumulative view: client-side running sum of the monthly comparison ──
  const cumulativeSeries = useMemo(() => {
    const raw = data?.monthlyOverheadComparison
    if (!Array.isArray(raw) || raw.length === 0) return null
    const toSeries = (y: number, color: string) => {
      let sum = 0
      const points = yearRows(raw, y).map((r) => {
        sum += r.overhead ?? 0
        return { x: shortMonth(r.month), y: sum }
      })
      return { id: String(y), color, data: points }
    }
    return [toSeries(pageYear, BRAND_ORANGE), toSeries(lastYear, PREVIOUS_YEAR_COLOR)]
  }, [data, pageYear, lastYear])

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

  // ── Category donut ──
  const pieItems: SpendItem[] = useMemo(
    () =>
      categories
        .filter((c) => c.current_amount > 0)
        .sort((a, b) => b.current_amount - a.current_amount)
        .map((c) => ({
          id: String(c.account_number),
          label: c.account_name,
          value: c.current_amount,
        })),
    [categories],
  )
  const { hue, drift } = RAMP_SCHEMES.orange
  const pieColors = colorRamp(hue, drift, Math.max(pieItems.length, 1))

  // ── Top movers vs last year ──
  const movers = useMemo(
    () =>
      categories
        .map((c) => ({
          id: String(c.account_number),
          name: c.account_name,
          delta: (c.current_amount || 0) - (c.previous_amount || 0),
          previous: c.previous_amount || 0,
        }))
        .filter((m) => Math.abs(m.delta) >= 1)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 8),
    [categories],
  )

  // ── Annual YoY bars ──
  const annualBars = useMemo(
    () =>
      (data?.annualOverheadTrend ?? [])
        .filter((r) => r.year > 0)
        .map((r) => ({ label: String(r.year), value: r.overhead })),
    [data],
  )

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

  // Line items span the full posted year while the pie is capped at the open
  // month — cap the modal the same way so its total matches the slice.
  const modalMonthCap = pageYear === openYear && openMonth != null ? openMonth : null

  const noData = !isLoading && categories.length === 0 && currentMonthRows.length === 0

  return (
    <Page
      title="Overhead Expense Report"
      actions={
        <>
          <button className="jc-export-btn" onClick={() => navigate("/dashboard")} title="Back to dashboard">
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
        <MotionItem className="col-span-full">
          <div className="stat-grid">
            <StatWidget
              title={`Total Overhead — ${pageYear}`}
              value={noData ? null : totalCurrent}
              loading={isLoading}
              caption={
                <DeltaCaption
                  current={totalCurrent}
                  previous={totalPrevious}
                  label={`vs same period ${lastYear}`}
                />
              }
            />
            <StatWidget title="Avg Monthly Overhead" value={avgMonthly} loading={isLoading} />
            <StatWidget
              title={`Projected ${pageYear} Run Rate`}
              value={runRate}
              loading={isLoading}
              caption={
                runRate != null && lastYearActual !== 0 ? (
                  <DeltaCaption current={runRate} previous={lastYearActual} label={`vs ${lastYear} actual`} />
                ) : undefined
              }
            />
          </div>
        </MotionItem>

        <MotionItem>
          <MonthlyYearComparisonWidget
            title="Overhead by Month"
            queryName="monthlyOverheadComparison"
            valueKey="overhead"
            onPointClick={handlePointClick}
            highlightedX={selectedMonth != null ? shortMonth(selectedMonth) : null}
          />
        </MotionItem>

        <MotionItem>
          <Widget title="Cumulative Overhead" loading={isLoading} noData={!cumulativeSeries}>
            {cumulativeSeries && (
              <Chart
                config={{
                  type: "line",
                  series: cumulativeSeries,
                  legend: true,
                  enableArea: true,
                  markers: openMonthMarkers(openMonth, openYear, pageYear),
                  pulsePoint:
                    openMonth != null && openYear === pageYear
                      ? { seriesId: String(pageYear), xValue: shortMonth(openMonth), color: BRAND_ORANGE }
                      : undefined,
                }}
              />
            )}
          </Widget>
        </MotionItem>

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
                onItemClick: openModal,
              }}
            />
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget
            title={`Top Movers vs ${lastYear}`}
            description="Largest category changes, both years through the same month"
            loading={isLoading}
            noData={!isLoading && movers.length === 0}
          >
            <ol className="spend-list ohr-movers-list">
              {movers.map((m) => (
                <li
                  key={m.id}
                  className="spend-list-item spend-list-item-clickable"
                  onClick={() => openModal(m.id)}
                >
                  <span
                    className="spend-list-dot"
                    style={{ background: m.delta > 0 ? UP_COLOR : DOWN_COLOR }}
                  />
                  <span className="spend-list-name body-text">{m.name}</span>
                  {m.previous !== 0 && (
                    <span className="spend-list-percent body-text">
                      {m.delta > 0 ? "+" : "−"}
                      {Math.abs((m.delta / Math.abs(m.previous)) * 100).toFixed(0)}%
                    </span>
                  )}
                  <span
                    className="spend-list-value body-text emphasized"
                    style={{ color: m.delta > 0 ? UP_COLOR : DOWN_COLOR }}
                  >
                    {m.delta > 0 ? "+" : "−"}{formatMoneyFull(Math.abs(m.delta))}
                  </span>
                </li>
              ))}
            </ol>
          </Widget>
        </MotionItem>

        <MotionItem>
          <Widget title="Overhead as % of Revenue" loading={isLoading} noData={!pctOfRevenueSeries}>
            {pctOfRevenueSeries && (
              <Chart
                config={{
                  type: "line",
                  series: pctOfRevenueSeries,
                  legend: true,
                  yFormat: (v) => `${v.toFixed(1)}%`,
                  markers: openMonthMarkers(openMonth, openYear, pageYear),
                }}
              />
            )}
          </Widget>
        </MotionItem>

        <MotionItem className="col-span-full">
          <Widget
            title="Annual Overhead"
            description="Year over year, all closed + open periods"
            loading={isLoading}
            noData={!isLoading && annualBars.length === 0}
          >
            <Chart
              config={{
                type: "bar",
                data: annualBars,
                color: BRAND_ORANGE,
                yFormat: formatMoneyFull,
              }}
            />
          </Widget>
        </MotionItem>

        <MotionItem className="col-span-full">
          <Widget
            title="Monthly breakdown"
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
      </MotionList>

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

  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.overheadReport} params={{ year }}>
      <OverheadReportContent year={year} setYear={setYear} />
    </PageDataProvider>
  )
}
