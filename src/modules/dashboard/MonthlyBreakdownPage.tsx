import { useMemo, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Download, X } from "lucide-react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData, usePageYear } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { MonthlyDetailTable } from "../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import { buildMonthSeries } from "../../shared/utils/chart"
import { shortMonth, fullMonth } from "../../shared/utils/format"
import { downloadXlsx } from "../../shared/utils/exportXlsx"
import { buildMonthlyBreakdownXlsx } from "./exportMonthlyBreakdownXlsx"

// Drill-down for the three home-page "by month" widgets. One file, one
// route (/dashboard/breakdown/:category), one shared layout — the
// CONFIG map below drives which queries, title, color, and totals label
// to use per category. Ported from 93E's MonthlyBreakdownPage; the
// account-pattern divergence (RD uses brand orange across all three
// metrics, no per-category color) is intentional so the brand orange
// reads consistently with the home page line chart that linked here.

type Category = "revenue" | "direct-expense" | "overhead"

interface CategoryConfig {
  title: string
  totalLabel: string
  color: string
  monthlyQueryKey: "monthlyRevenueComparison" | "monthlyDirectExpenseComparison" | "monthlyOverheadComparison"
  monthlyValueField: "revenue" | "expense" | "overhead"
  lineItemsQueryKey: "revenueLineItems" | "directExpenseLineItems" | "overheadLineItems"
  pageQueryListKey: "dashboardBreakdownRevenue" | "dashboardBreakdownDirectExpense" | "dashboardBreakdownOverhead"
}

const BRAND_ORANGE = "#c27c3e"

const CONFIG: Record<Category, CategoryConfig> = {
  "revenue": {
    title: "Gross Revenue",
    totalLabel: "Revenue",
    color: BRAND_ORANGE,
    monthlyQueryKey: "monthlyRevenueComparison",
    monthlyValueField: "revenue",
    lineItemsQueryKey: "revenueLineItems",
    pageQueryListKey: "dashboardBreakdownRevenue",
  },
  "direct-expense": {
    title: "Total Direct Expense",
    totalLabel: "Direct Expense",
    color: BRAND_ORANGE,
    monthlyQueryKey: "monthlyDirectExpenseComparison",
    monthlyValueField: "expense",
    lineItemsQueryKey: "directExpenseLineItems",
    pageQueryListKey: "dashboardBreakdownDirectExpense",
  },
  "overhead": {
    title: "Overhead Expense",
    totalLabel: "Overhead",
    color: BRAND_ORANGE,
    monthlyQueryKey: "monthlyOverheadComparison",
    monthlyValueField: "overhead",
    lineItemsQueryKey: "overheadLineItems",
    pageQueryListKey: "dashboardBreakdownOverhead",
  },
}

// The monthly comparison queries return one row per (month, year). On the
// breakdown page we only care about the current year, so the filter +
// pivot below drops the previous-year rows.
interface MonthlyPoint {
  month: number
  year: number
  [key: string]: number
}

interface BreakdownContentProps {
  config: CategoryConfig
  year: number
  setYear: (y: number) => void
}

function BreakdownContent({ config, year, setYear }: BreakdownContentProps) {
  const navigate = useNavigate()
  const pageYear = usePageYear()
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const { data, isLoading } = useWidgetData<Record<string, unknown>>([
    config.monthlyQueryKey,
    config.lineItemsQueryKey,
  ])

  // Filter the monthly query to just the current year (it returns
  // current + previous year for the home page comparison widgets).
  const monthlyPoints = useMemo(() => {
    const raw = (data?.[config.monthlyQueryKey] as MonthlyPoint[] | null) ?? []
    return raw.filter((p) => p.year === pageYear)
  }, [data, config.monthlyQueryKey, pageYear])

  const lineItems = (data?.[config.lineItemsQueryKey] as Record<string, unknown>[] | null) ?? null

  const monthlyTotals = useMemo(
    () =>
      monthlyPoints.map((p) => ({
        month: p.month,
        value: (p[config.monthlyValueField] as number) ?? 0,
      })),
    [monthlyPoints, config.monthlyValueField],
  )

  const noData = !isLoading && monthlyPoints.length === 0

  const highlightedX = selectedMonth != null ? shortMonth(selectedMonth) : null

  function handlePointClick(x: string) {
    const monthNum = monthlyPoints.find((p) => shortMonth(p.month) === x)?.month
    if (monthNum == null) return
    setSelectedMonth((curr) => (curr === monthNum ? null : monthNum))
  }

  function handleExport() {
    if (!lineItems) return
    const { rows, lineItemHeaderRow, lineItemCols } = buildMonthlyBreakdownXlsx({
      title: config.title,
      totalLabel: config.totalLabel,
      year: pageYear,
      monthlyTotals,
      lineItems,
    })
    const safeName = config.title.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")
    const date = new Date().toISOString().slice(0, 10)
    downloadXlsx(rows, `${safeName}_${pageYear}_${date}.xlsx`, `${config.title} ${pageYear}`, {
      autoFilterRow: lineItemHeaderRow,
      autoFilterCols: lineItemCols,
    })
  }

  const exportDisabled = isLoading || lineItems === null || lineItems.length === 0

  return (
    <Page
      title={`${config.title} Breakdown`}
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
            disabled={exportDisabled}
            title="Export breakdown to Excel"
          >
            <Download size={14} /> Export Report
          </button>
          <YearSelector value={year} onChange={setYear} />
        </>
      }
    >
      <div className="mbp-stack">
        <Widget title={`${config.title} — ${pageYear}`} loading={isLoading} noData={noData} className="mbp-chart-widget">
          <Chart
            config={{
              type: "line",
              series: [
                {
                  id: String(pageYear),
                  color: config.color,
                  data: buildMonthSeries(monthlyPoints, config.monthlyValueField),
                },
              ],
              enableArea: true,
              legend: false,
              highlightedX,
              onPointClick: handlePointClick,
            }}
          />
        </Widget>

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
            totalLabel={config.totalLabel}
            filterMonth={selectedMonth}
          />
        </Widget>
      </div>
    </Page>
  )
}

export default function MonthlyBreakdownPage() {
  const { category } = useParams<{ category: Category }>()
  const [year, setYear] = useState(new Date().getFullYear())

  const config = category ? CONFIG[category] : undefined

  if (!config) {
    return (
      <Page title="Not Found">
        <p className="body-text">Unknown breakdown category.</p>
      </Page>
    )
  }

  return (
    <PageDataProvider
      module="dashboard"
      queries={PAGE_QUERIES[config.pageQueryListKey]}
      params={{ year }}
    >
      <BreakdownContent config={config} year={year} setYear={setYear} />
    </PageDataProvider>
  )
}
