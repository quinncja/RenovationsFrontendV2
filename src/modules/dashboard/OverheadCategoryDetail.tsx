import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, X } from "lucide-react"
import { Chart } from "../../shared/components/Chart/Chart"
import { SegmentedControl } from "../../shared/components/SegmentedControl"
import { SkelText } from "../../shared/components/SkelText"
import { collapseValue } from "../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { fetchPageData } from "../../shared/api/pageApi"
import { shortMonth, fullMonth, formatMoneyFull, formatDate } from "../../shared/utils/format"
import type { LineMarker } from "../../shared/components/Chart/chart.types"
import { buildCategoryTrend, type CategoryHistoryRow, type TrendGroup, type TrendView, type TrendSeries } from "./overheadTrend"

type LineItem = Record<string, unknown>

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
  /** Which panel to morph out of; absent when opened from the donut/list. */
  layoutId?: string
}

/** Line items for one posting year. The page already holds the selected
 *  year's; other years (Yearly view rows) are fetched on first expand. */
type YearItems = LineItem[] | "loading" | "error"

const PRIOR_YEAR_DOT_COLOR = "#a9b2be"

const openSpring = { type: "spring", bounce: 0, visualDuration: 0.42 } as const

/** Shared-element ids: the panel's name and total morph into the modal's. */
export const catNameLayoutId = (id: string) => `ohr-cat-name-${id}`
export const catValueLayoutId = (id: string) => `ohr-cat-value-${id}`

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
}) {
  const open = category !== null
  const { overlayZ, contentZ } = useModalLayer(open)
  const [view, setView] = useState<TrendView>(initialView)
  const [openKey, setOpenKey] = useState<number | null>(null)
  const [yearItems, setYearItems] = useState<Record<number, YearItems>>({})
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
      const t = window.setTimeout(() => setSettled(true), 300)
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

  const rows = useMemo(() => {
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
      return list
    }
    return series.data
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
  const pct = grandTotals[view] > 0 ? (Math.max(total, 0) / grandTotals[view]) * 100 : null

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
              layoutId={category.layoutId}
              style={{ borderRadius: 16 }}
              initial={category.layoutId ? undefined : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={category.layoutId ? undefined : { opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
              transition={{ layout: openSpring, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* ── Left: the panel, grown ── */}
              <div className="ohr-detail-left">
                <div className="ohr-detail-title">
                  <motion.h2
                    className="title2 emphasized ohr-detail-name"
                    style={{ color: category.color }}
                    layoutId={category.layoutId ? catNameLayoutId(category.id) : undefined}
                    transition={{ layout: openSpring }}
                  >
                    {category.name}
                  </motion.h2>
                  <span className={`reports-modal-subtitle ohr-detail-static${settled ? " is-in" : ""}`}>
                    {pct != null ? `${pct.toFixed(pct >= 10 ? 0 : 1)}% of ${view === "monthly" ? `${pageYear} ` : ""}overhead` : "—"}
                  </span>
                  <motion.div
                    className="ohr-multi-value ohr-detail-value"
                    layoutId={category.layoutId ? catValueLayoutId(category.id) : undefined}
                    transition={{ layout: openSpring }}
                  >
                    {formatMoneyFull(total)}
                  </motion.div>
                </div>
                <div className={`ohr-detail-chart ohr-detail-static${settled ? " is-in" : ""}`}>
                  {series && settled && (
                    <Chart
                      config={{
                        type: "line",
                        sparkline: true,
                        series: [
                          {
                            id: series.prevData ? String(pageYear) : series.id,
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
              </div>

              {/* ── Right: costs by month | year ── */}
              <div className={`ohr-detail-right ohr-detail-static${settled ? " is-in" : ""}`}>
                <div className="ohr-detail-right-head">
                  <div>
                    <h2 className="title2 emphasized">Costs</h2>
                    <span className="reports-modal-subtitle">
                      {view === "monthly" ? `${pageYear}, by month` : "By year"}
                      {category.id !== "__other__" && category.id !== "OWNERS_SALARY" ? ` · Account ${category.id}` : ""}
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
                <div ref={listRef} className="ohr-detail-list">
                  {rows.length === 0 && (
                    <p className="reports-modal-empty body-text text-secondary">No costs recorded for this category.</p>
                  )}
                  {rows.map((row) => {
                    const isOpen = openKey === row.key
                    const items = isOpen ? (row.items ?? (view === "yearly" ? yearItems[row.key] ?? "loading" : [])) : null
                    return (
                      <div
                        key={`${view}-${row.key}`}
                        data-row-key={row.key}
                        className={`ohr-cost-card${isOpen ? " ohr-cost-card-open" : ""}`}
                      >
                        <div
                          className="ohr-cost-head"
                          role="button"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          onClick={() => toggleRow(row.key)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              toggleRow(row.key)
                            }
                          }}
                        >
                          <span className="jc-head-toggle">
                            <ChevronRight size={15} className={`jc-expand-chevron${isOpen ? " open" : ""}`} />
                          </span>
                          <span className="ohr-cost-label">{row.label}</span>
                          <span className="ohr-cost-stats">
                            <span className="jc-head-stat">
                              <span className="jc-head-stat-label">Items</span>
                              <span className="jc-head-stat-value">{row.count ?? "—"}</span>
                            </span>
                            <span className="jc-head-stat">
                              <span className="jc-head-stat-label">Total</span>
                              <span className="jc-head-stat-value">{formatMoneyFull(row.total)}</span>
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
                              transition={{ height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2 } }}
                            >
                              <CostItems items={items} showMonth={view === "yearly"} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** The itemized ledger lines inside an open month/year row. Sorted by date,
 *  newest first; rows fade in with a short stagger once the tray opens. */
function CostItems({ items, showMonth }: { items: YearItems | null; showMonth: boolean }) {
  if (items === "loading" || items == null) {
    return (
      <div className="ohr-cost-items ohr-cost-items-loading" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="ohr-cost-skel-row">
            <SkelText ch={9} />
            <SkelText ch={26} />
            <SkelText ch={8} />
          </div>
        ))}
      </div>
    )
  }
  if (items === "error") {
    return <p className="reports-modal-empty body-text text-secondary">Couldn't load these costs. Try again in a moment.</p>
  }
  if (items.length === 0) {
    return <p className="reports-modal-empty body-text text-secondary">No costs this period.</p>
  }
  const sorted = [...items].sort(
    (a, b) =>
      (new Date(String(collapseValue(b.trndte) ?? "")).getTime() || 0) -
      (new Date(String(collapseValue(a.trndte) ?? "")).getTime() || 0),
  )
  const total = items.reduce((s, li) => s + Number(collapseValue(li.net) ?? 0), 0)
  return (
    <div className="ohr-cost-items">
      <table className="data-table ohr-cost-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Trans #</th>
            <th>Description</th>
            {showMonth && <th>Month</th>}
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((li, i) => {
            const month = Number(collapseValue(li.month))
            return (
              <motion.tr
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: Math.min(i, 12) * 0.02 + 0.08, duration: 0.2 } }}
              >
                <td className="text-secondary">{formatDate(collapseValue(li.trndte))}</td>
                <td>{String(collapseValue(li.trnnum) ?? "—")}</td>
                <td>{String(collapseValue(li.dscrpt) ?? "") || "—"}</td>
                {showMonth && <td>{month >= 1 && month <= 12 ? shortMonth(month) : "Adj."}</td>}
                <td className="num">{formatMoneyFull(Number(collapseValue(li.net) ?? 0))}</td>
              </motion.tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={showMonth ? 4 : 3}>Total</td>
            <td className="num">{formatMoneyFull(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
