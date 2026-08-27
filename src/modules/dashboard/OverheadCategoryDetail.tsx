import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { Chart } from "../../shared/components/Chart/Chart"
import { SegmentedControl } from "../../shared/components/SegmentedControl"
import { collapseValue } from "../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { fetchPageData } from "../../shared/api/pageApi"
import { fullMonth, formatMoneyFull } from "../../shared/utils/format"
import type { LineMarker, SpendItem } from "../../shared/components/Chart/chart.types"
import { LedgerTransactionModal, type LedgerRef } from "./LedgerTransactionModal"
import { OverheadCostRows, type CostRow, type PeriodItems, type LineItem } from "./OverheadCostRows"
import { buildCategoryTrend, type CategoryHistoryRow, type TrendGroup, type TrendView, type TrendSeries } from "./overheadTrend"


export interface DetailCategory {
  /** Value matched against a line item's lgract (account number, the
   *  virtual OWNERS_SALARY id, or the "Other" sentinel). */
  id: string
  name: string
  color: string
  /** Which history rows belong to this category (top-N account, the Other
   *  tail, or a single tail account opened from the Other list). */
  match: (r: CategoryHistoryRow) => boolean
  /** Same test against a line item. */
  matchItem: (li: LineItem) => boolean
}

/** Line items for one posting year. The page already holds the selected
 *  year's; other years (Yearly view rows) are fetched on first expand. */
type YearItems = PeriodItems

const PRIOR_YEAR_DOT_COLOR = "#a9b2be"


/** Sentinel category id for the "every category" view. */
export const ALL_ID = "__all__"

/**
 * Full-screen category drill-down. The left pane is the Category Trend panel
 * the user clicked, grown into place via a shared layoutId (same gray
 * surface, bigger chart, its own Monthly/Yearly toggle). The right pane is
 * white like a widget and lists that category's costs broken down by month
 * or year; a row expands into the itemized ledger lines, and clicking a
 * point on the chart opens the matching row.
 */
export function OverheadCategoryDetail({
  category,
  onClose,
  history,
  lineItems,
  pageYear,
  monthCap,
  initialView,
  sliceTotals,
  grandTotals,
  pieItems,
  pieColors,
  onSwitch,
}: {
  category: DetailCategory | null
  onClose: () => void
  history: CategoryHistoryRow[]
  lineItems: LineItem[] | null
  pageYear: number
  /** Open month when the selected year holds the open period, so the
   *  month rows reconcile with the donut (which is capped the same way). */
  monthCap: number | null
  initialView: TrendView
  /** Whole-overhead totals per x label for both views (tooltip shares). */
  sliceTotals: Record<TrendView, Record<string, number>>
  /** All-category overhead for each view's range (the share denominator). */
  grandTotals: Record<TrendView, number>
  /** The report's category donut (same items + colors), shown under the
   *  chart. Clicking another slice switches the detail to that category;
   *  clicking the active one widens to every category. */
  pieItems: SpendItem[]
  pieColors: string[]
  onSwitch: (id: string) => void
}) {
  const open = category !== null
  const { overlayZ, contentZ } = useModalLayer(open)
  const [view, setView] = useState<TrendView>(initialView)
  const [openKey, setOpenKey] = useState<number | null>(null)
  // Switching category keeps the view but closes any open row.
  useEffect(() => setOpenKey(null), [category?.id])
  const [yearItems, setYearItems] = useState<Record<number, YearItems>>({})
  // A clicked cost line opens its ledger transaction on top of this modal.
  const [ledger, setLedger] = useState<LedgerRef | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // The nivo chart mounts only once the morph has landed: measuring and
  // painting an SVG mid-spring is what made the open stutter.
  const [settled, setSettled] = useState(false)

  // Fresh state per open: the page's current toggle, nothing expanded.
  useEffect(() => {
    if (open) {
      setView(initialView)
      setOpenKey(null)
      setSettled(false)
      const t = window.setTimeout(() => setSettled(true), 120)
      return () => window.clearTimeout(t)
    }
  }, [open, initialView])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const trend = useMemo(() => {
    if (!category) return null
    const group: TrendGroup = { id: category.name, accountId: category.id, color: category.color, match: category.match }
    return buildCategoryTrend(history, [group], view, pageYear)
  }, [category, history, view, pageYear])
  const series: TrendSeries | null = trend?.series[0] ?? null

  // ── Cost rows: one per month (selected year) or per year ──
  const itemsFor = (year: number): YearItems | null =>
    year === pageYear ? lineItems : (yearItems[year] ?? null)

  const monthOf = (li: LineItem) => Number(collapseValue(li.month))
  const netOf = (li: LineItem) => Number(collapseValue(li.net) ?? 0)

  const rows = useMemo<CostRow[]>(() => {
    if (!category || !series) return []
    if (view === "monthly") {
      const items = Array.isArray(lineItems) ? lineItems.filter(category.matchItem) : []
      const months = series.data.filter((p) => p.y != null).map((p) => p.key)
      const adjustments = items.filter((li) => monthOf(li) === 13)
      const list = months.map((m) => {
        const mine = items.filter((li) => monthOf(li) === m && (monthCap == null || m <= monthCap))
        return { key: m, label: fullMonth(m), total: mine.reduce((s, li) => s + netOf(li), 0), count: mine.length, items: mine as YearItems }
      })
      if (adjustments.length && (monthCap == null || pageYear !== new Date().getFullYear()))
        list.push({ key: 13, label: "Year-end adjustments", total: adjustments.reduce((s, li) => s + netOf(li), 0), count: adjustments.length, items: adjustments as YearItems })
      return list.reverse()
    }
    return series.data.slice().reverse()
      .filter((p) => p.y != null)
      .map((p) => {
        const fetched = itemsFor(p.key)
        const mine = Array.isArray(fetched) ? fetched.filter(category.matchItem) : null
        return {
          key: p.key,
          label: String(p.key),
          total: p.y ?? 0,
          count: mine ? mine.length : null,
          items: (mine ?? fetched) as YearItems | null,
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, series, view, lineItems, yearItems, monthCap, pageYear])

  // Yearly rows lazily pull that year's ledger lines (one request per year,
  // cached for the life of the page).
  const inFlight = useRef(new Set<number>())
  useEffect(() => {
    if (view !== "yearly" || openKey == null || openKey === pageYear) return
    const year = openKey
    if (yearItems[year] != null || inFlight.current.has(year)) return
    inFlight.current.add(year)
    setYearItems((m) => ({ ...m, [year]: "loading" }))
    fetchPageData({ module: "dashboard", queries: ["overheadLineItems"], params: { year } })
      .then((res) => {
        const items = res.overheadLineItems
        setYearItems((m) => ({ ...m, [year]: Array.isArray(items) ? (items as LineItem[]) : "error" }))
      })
      .catch(() => setYearItems((m) => ({ ...m, [year]: "error" })))
      .finally(() => inFlight.current.delete(year))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, openKey, pageYear])

  const toggleRow = (key: number) => setOpenKey((k) => (k === key ? null : key))

  // A click on the chart opens that month/year's row and brings it into view.
  const openFromChart = (xLabel: string) => {
    const point = series?.data.find((p) => p.x === xLabel)
    if (!point || point.y == null) return
    setOpenKey(point.key)
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-row-key="${point.key}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
  }

  const selectedX = openKey != null ? (series?.data.find((p) => p.key === openKey)?.x ?? null) : null
  const selectedMarker: LineMarker[] | undefined = selectedX
    ? [{ axis: "x", value: selectedX, lineStyle: { stroke: category?.color, strokeWidth: 1.5, strokeDasharray: "3 4", strokeOpacity: 0.9 } }]
    : undefined
  const total = series?.total ?? 0
  const isAll = category?.id === ALL_ID
  const pct = isAll ? 100 : grandTotals[view] > 0 ? (Math.max(total, 0) / grandTotals[view]) * 100 : null
  const pieTotal = pieItems.reduce((s, it) => s + it.value, 0)
  const activeItem = !isAll ? pieItems.find((it) => it.id === category?.id) : undefined
  const piePct = isAll ? 100 : activeItem && pieTotal > 0 ? (activeItem.value / pieTotal) * 100 : null

  return createPortal(
    <AnimatePresence>
      {open && category && (
        <>
          <motion.div
            key="overlay"
            // No backdrop blur here: blurring a page full of SVG charts is
            // what fought the morph for frames.
            className="modal-overlay"
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            onClick={onClose}
          />
          <div className="modal-positioner ohr-detail-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              key="card"
              className="ohr-detail"
              style={{ borderRadius: 16 }}
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.16 } }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* ── Left: the panel, grown ── */}
              <div className="ohr-detail-left">
                <div className="ohr-detail-title">
                  <h2 className="title2 emphasized ohr-detail-name" style={{ color: category.color }}>
                    {category.name}
                  </h2>
                  <span className={`reports-modal-subtitle ohr-detail-static${settled ? " is-in" : ""}`}>
                    {pct != null ? `${pct.toFixed(pct >= 10 ? 0 : 1)}% of ${view === "monthly" ? `${pageYear} ` : ""}overhead` : "—"}
                  </span>
                  <div className="ohr-multi-value ohr-detail-value">{formatMoneyFull(total)}</div>
                </div>
                <div className={`ohr-detail-chart ohr-detail-static${settled ? " is-in" : ""}`}>
                  {series && settled && (
                    <Chart
                      config={{
                        type: "line",
                        sparkline: true,
                        series: [
                          // Same id in both views so nivo tweens the path
                          // when the toggle flips instead of remounting it.
                          {
                            id: String(pageYear),
                            color: series.color,
                            data: series.prevData ? series.data : series.data.filter((p) => p.y != null),
                          },
                          ...(series.prevData ? [{ id: String(pageYear - 1), color: PRIOR_YEAR_DOT_COLOR, data: series.prevData }] : []),
                        ],
                        dashedSeriesIds: series.prevData ? [String(pageYear - 1)] : undefined,
                        dashedSeriesAsRows: true,
                        curve: "monotoneX",
                        yFormat: formatMoneyFull,
                        disableGrowthTooltip: !series.prevData,
                        sliceShareTotals: sliceTotals[view],
                        sliceShareLabel: view === "monthly" ? "month" : "year",
                        markers: selectedMarker,
                        onPointClick: openFromChart,
                      }}
                    />
                  )}
                </div>
                <p className={`ohr-detail-hint ohr-detail-static${settled ? " is-in" : ""}`}>
                  Click a {view === "monthly" ? "month" : "year"} on the chart to open its costs.
                </p>
                <div className={`ohr-detail-pie ohr-detail-static${settled ? " is-in" : ""}`}>
                  <Chart
                    config={{
                      type: "pie-with-list",
                      items: pieItems,
                      previewCount: pieItems.length,
                      colors: pieColors,
                      chartSize: "md",
                      hideList: true,
                      activeId: isAll ? null : category.id,
                      centerText: {
                        primary: piePct != null ? `${piePct.toFixed(piePct >= 10 ? 0 : 1)}%` : "—",
                        secondary: isAll ? "ALL CATEGORIES" : "OF OVERHEAD",
                      },
                      onItemClick: (id) => onSwitch(id === category.id ? ALL_ID : id),
                    }}
                  />
                  <p className="ohr-detail-hint">
                    {isAll ? "Click a slice to focus one category." : "Click another slice to switch, or this one for all categories."}
                  </p>
                </div>
              </div>

              {/* ── Right: costs by month | year ── */}
              <div className={`ohr-detail-right ohr-detail-static${settled ? " is-in" : ""}`}>
                <div className="ohr-detail-right-head">
                  <div>
                    <h2 className="title2 emphasized">Costs</h2>
                    <span className="reports-modal-subtitle">
                      {view === "monthly" ? `${pageYear}, by month` : "By year"}
                      {category.id !== "__other__" && category.id !== "OWNERS_SALARY" && !isAll ? ` · Account ${category.id}` : ""}
                    </span>
                  </div>
                  <div className="ohr-detail-head-actions">
                    {settled && (
                    <SegmentedControl
                      variant="ohr"
                      ariaLabel="Category detail view"
                      layoutId="ohrDetailViewThumb"
                      value={view}
                      options={[
                        { key: "monthly", label: "Monthly" },
                        { key: "yearly", label: "Yearly" },
                      ]}
                      onChange={(v) => {
                        setView(v)
                        setOpenKey(null)
                      }}
                    />
                    )}
                    <button className="button modal-close" onClick={onClose} aria-label="Close">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <OverheadCostRows
                  rows={rows}
                  openKey={openKey}
                  onToggle={toggleRow}
                  onOpen={setLedger}
                  showCount={view === "monthly"}
                  showMonth={view === "yearly"}
                  emptyText="No costs recorded for this category."
                  listRef={listRef}
                />
              </div>
            </motion.div>
          </div>
          <LedgerTransactionModal ledger={ledger} onClose={() => setLedger(null)} />
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
