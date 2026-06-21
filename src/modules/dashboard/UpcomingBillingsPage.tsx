import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ChevronDown, ChevronRight, Download } from "lucide-react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import useIsMobile from "../../shared/hooks/useIsMobile"
import { downloadXlsx } from "../../shared/utils/exportXlsx"
import { formatMoney, formatMoneyFull, formatDate } from "../../shared/utils/format"
import {
  buildAgingForecast,
  buildBillingsInvoices,
  type AgingOpenRow,
  type BillingsInvoice,
} from "./utils/agingForecast"
import { AR_COLOR, AP_COLOR } from "./widgets/billings/billingsShared"

// Drill-down for the home Upcoming Billings widget: the forecast chart plus one
// expandable card per week (accordion — a single card open at a time, so the
// reader keeps context). Clicking a bar (here or on the home page, via ?week=)
// expands the matching card, revealing its AR and AP invoices.

interface WeekGroup {
  index: number
  label: string
  ar: BillingsInvoice[]
  ap: BillingsInvoice[]
  arTotal: number
  apTotal: number
}

type Side = "AR" | "AP"

type LeafSortKey = "counterparty" | "invnum" | "job" | "due" | "mark" | "total" | "amount"

function InvoiceTable({
  list,
  side,
  onOpen,
}: {
  list: BillingsInvoice[]
  side: Side
  onOpen: (recnum: string, side: Side) => void
}) {
  const color = side === "AR" ? AR_COLOR : AP_COLOR
  const sort = useTableSort<LeafSortKey>("amount", "desc")
  const sorted = applySort(list, sort, (inv, key) =>
    key === "amount"
      ? inv.amount
      : key === "total"
        ? inv.total
        : key === "mark"
          ? inv.mark.getTime()
          : key === "due"
            ? inv.due.getTime()
            : key === "invnum"
              ? inv.invnum
              : key === "job"
                ? inv.job
                : inv.counterparty
  )
  return (
    <table className="data-table billings-leaf-table">
      <thead>
        <tr>
          <SortableHeader label="Client / Vendor" columnKey="counterparty" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Invoice" columnKey="invnum" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Job" columnKey="job" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Due" columnKey="due" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Overdue on" columnKey="mark" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Invoice Amt" columnKey="total" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
          <SortableHeader label="Balance" columnKey="amount" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((inv, i) => (
          <tr
            key={`${inv.invnum}-${i}`}
            className={inv.recnum ? "clickable-row" : undefined}
            onClick={inv.recnum ? () => onOpen(inv.recnum, side) : undefined}
            title={inv.recnum ? "View invoice details" : undefined}
          >
            <td>{inv.counterparty || "—"}</td>
            <td className="text-secondary">{inv.invnum || "—"}</td>
            <td className="text-secondary">{inv.job || "—"}</td>
            <td className="text-secondary">{formatDate(inv.due)}</td>
            <td className="text-secondary">{formatDate(inv.mark)}</td>
            <td className="num text-secondary">{inv.total ? formatMoneyFull(inv.total) : "—"}</td>
            <td className="num" style={{ color }}>
              {formatMoneyFull(inv.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function UpcomingBillingsContent() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data, isLoading } = useWidgetData<{ agingSummaryOpen: AgingOpenRow[] | null }>([
    "agingSummaryOpen",
  ])

  const forecast = useMemo(
    () => buildAgingForecast(data?.agingSummaryOpen, new Date()),
    [data?.agingSummaryOpen]
  )
  const invoices = useMemo(
    () => buildBillingsInvoices(data?.agingSummaryOpen, new Date()),
    [data?.agingSummaryOpen]
  )

  const weeks: WeekGroup[] = useMemo(() => {
    const labels = forecast?.weeks.map((w) => w.label) ?? []
    return labels.map((label, i) => {
      const ar = invoices.filter((inv) => inv.weekIndex === i && inv.side === "AR")
      const ap = invoices.filter((inv) => inv.weekIndex === i && inv.side === "AP")
      return {
        index: i,
        label,
        ar,
        ap,
        arTotal: ar.reduce((s, x) => s + x.amount, 0),
        apTotal: ap.reduce((s, x) => s + x.amount, 0),
      }
    })
  }, [forecast, invoices])

  // Diverging lines: AR above zero, AP (negated) below — money-in vs money-out.
  const series = useMemo(
    () => [
      { id: "AR", color: AR_COLOR, data: forecast?.weeks.map((w) => ({ x: w.label, y: w.ar })) ?? [] },
      { id: "AP", color: AP_COLOR, data: forecast?.weeks.map((w) => ({ x: w.label, y: -w.ap })) ?? [] },
    ],
    [forecast]
  )

  // Mobile: nine bucket labels crowd the x axis — show every other one.
  const isMobile = useIsMobile()
  const axisBottomTickValues = useMemo(
    () => (isMobile ? forecast?.weeks.filter((_, i) => i % 2 === 0).map((w) => w.label) : undefined),
    [isMobile, forecast]
  )

  // Accordion: a single open card keeps the reader anchored to one week.
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  // The AR/AP section headers only become sticky once the expand animation has
  // finished — while the body still has overflow:hidden, sticky would resolve
  // against the body instead of the page and the headers render ~2rem low,
  // snapping up when the overflow is released.
  const [bodySettled, setBodySettled] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<
    { recnum: string; module: "clients" | "suppliers" } | null
  >(null)
  const weekRefs = useRef<(HTMLDivElement | null)[]>([])
  // Week index waiting to be scrolled to the top once its expand animation
  // finishes (scrolling while the body is still collapsed can't reach the
  // top — the page doesn't have its full height yet).
  const pendingScroll = useRef<number | null>(null)

  function toggleWeek(weekIndex: number) {
    setBodySettled(false)
    setOpenWeek((prev) => (prev === weekIndex ? null : weekIndex))
  }

  // "start" pins the card to the top of the page, where its sticky header
  // lands anyway — "center" left it floating mid-viewport.
  function scrollWeekToTop(weekIndex: number) {
    weekRefs.current[weekIndex]?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function openWeekCard(weekIndex: number) {
    if (openWeek === weekIndex) {
      // Already open — no expand animation will fire, scroll straight away.
      scrollWeekToTop(weekIndex)
      return
    }
    setBodySettled(false)
    setOpenWeek(weekIndex)
    pendingScroll.current = weekIndex
  }

  function handleBarClick(label: string) {
    const i = weeks.findIndex((w) => w.label === label)
    if (i >= 0) openWeekCard(i)
  }

  function openInvoice(recnum: string, side: Side) {
    setSelectedInvoice({ recnum, module: side === "AP" ? "suppliers" : "clients" })
  }

  function handleExport() {
    if (invoices.length === 0) return
    // Balances split into AR In / AP Out columns (the other side left blank)
    // so each column sums independently in the spreadsheet.
    const header = ["Week", "Type", "Client / Vendor", "Invoice", "Job", "Due", "Overdue on", "AR In", "AP Out"]
    const rows: (string | number)[][] = [header]
    for (const inv of invoices) {
      rows.push([
        inv.weekLabel,
        inv.side,
        inv.counterparty,
        inv.invnum,
        inv.job,
        formatDate(inv.due),
        formatDate(inv.mark),
        inv.side === "AR" ? inv.amount : "",
        inv.side === "AP" ? inv.amount : "",
      ])
    }
    const date = new Date().toISOString().slice(0, 10)
    downloadXlsx(rows, `Upcoming_Billings_${date}.xlsx`, "Upcoming Billings", {
      autoFilterRow: 0,
      autoFilterCols: header.length,
    })
  }

  // Deep link from the home widget: ?week=<index> opens that card (both AR and
  // AP are visible in an open card, so ?side= no longer changes anything).
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || weeks.length === 0) return
    didInit.current = true
    const wParam = searchParams.get("week")
    if (wParam == null) return
    const i = Number(wParam)
    if (!Number.isInteger(i) || i < 0 || i >= weeks.length) return
    openWeekCard(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks.length])

  return (
    <Page
      title="Upcoming Billings"
      actions={
        <>
          <button className="jc-export-btn" onClick={() => navigate("/dashboard")} title="Back to dashboard">
            <ArrowLeft size={14} /> Dashboard
          </button>
          <button
            className="jc-export-btn"
            onClick={handleExport}
            disabled={isLoading || invoices.length === 0}
            title="Export to Excel"
          >
            <Download size={14} /> Export Report
          </button>
        </>
      }
    >
      <div className="mbp-stack">
        <Widget
          title="Forecast — weeks until invoices reach 30 days past due"
          loading={isLoading}
          noData={!forecast}
          className="mbp-chart-widget"
        >
          {forecast && (
            <Chart
              config={{
                type: "line",
                series,
                yFormat: (v) => formatMoney(Math.abs(v)),
                enableArea: true,
                curve: "monotoneX",
                legend: true,
                axisBottomTickValues,
                disableGrowthTooltip: true,
                onPointClick: handleBarClick,
              }}
            />
          )}
        </Widget>

        {/* Week cards render straight onto the page (no parent card) — each
            week is its own standalone card. */}
        <section className="billings-week-section">
          {/* Same text treatment as a widget header, just floating on the page. */}
          <h2 className="widget-title headline billings-week-section-title">Invoices by week</h2>
          {!isLoading && invoices.length === 0 && (
            <p className="body-text text-secondary">No upcoming invoices.</p>
          )}
          <div className="billings-week-cards">
            {weeks.map((week) => {
              const count = week.ar.length + week.ap.length
              const isOpen = openWeek === week.index
              const net = week.arTotal - week.apTotal
              return (
                <div
                  key={week.index}
                  ref={(el) => {
                    weekRefs.current[week.index] = el
                  }}
                  className={`billings-week-card${isOpen ? " expanded" : ""}${count === 0 ? " is-empty" : ""}`}
                >
                  <button
                    type="button"
                    className="billings-week-card-header"
                    onClick={() => toggleWeek(week.index)}
                    disabled={count === 0}
                    aria-expanded={isOpen}
                    title={count > 0 ? `${isOpen ? "Collapse" : "Expand"} ${week.label}` : undefined}
                  >
                    <span className="billings-week-card-title">
                      {/* Empty weeks render an invisible chevron so labels stay aligned. */}
                      <span className={`jc-group-chevron${count === 0 ? " jc-group-chevron-spacer" : ""}`}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      {week.label}
                      <span className="billings-count">
                        {count} invoice{count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="billings-week-card-stats">
                      {/* Zero amounts read as inert gray — color is reserved for real money. */}
                      <span className="billings-week-stat">
                        <span className="billings-week-stat-label">AR in</span>
                        <span className="num" style={{ color: week.arTotal ? AR_COLOR : "var(--secondary-text)" }}>
                          {formatMoneyFull(week.arTotal)}
                        </span>
                      </span>
                      <span className="billings-week-stat">
                        <span className="billings-week-stat-label">AP out</span>
                        <span className="num" style={{ color: week.apTotal ? AP_COLOR : "var(--secondary-text)" }}>
                          {formatMoneyFull(week.apTotal)}
                        </span>
                      </span>
                      <span className="billings-week-stat">
                        <span className="billings-week-stat-label">Net</span>
                        <span className="num" style={{ color: net === 0 ? "var(--secondary-text)" : net > 0 ? AR_COLOR : AP_COLOR }}>
                          {formatMoneyFull(net)}
                        </span>
                      </span>
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        className={`billings-week-card-body${bodySettled ? " is-settled" : ""}`}
                        // overflow stays hidden only while the height animates —
                        // a persistent overflow ancestor would break the sticky
                        // AR/AP section headers inside the body.
                        initial={{ height: 0, opacity: 0, overflow: "hidden" }}
                        animate={{ height: "auto", opacity: 1, overflow: "hidden", transitionEnd: { overflow: "visible" } }}
                        exit={{ height: 0, opacity: 0, overflow: "hidden" }}
                        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                        onAnimationComplete={(def) => {
                          // Only the expand animation ends at height:auto.
                          if (typeof def === "object" && def !== null && (def as { height?: unknown }).height === "auto") {
                            setBodySettled(true)
                            // Now that the page has its full height, the
                            // deferred chart-click scroll can reach the top.
                            if (pendingScroll.current != null) {
                              const target = pendingScroll.current
                              pendingScroll.current = null
                              requestAnimationFrame(() => scrollWeekToTop(target))
                            }
                          }
                        }}
                      >
                        <div className="billings-week-card-body-inner">
                          {(["AR", "AP"] as const).map((side) => {
                            const list = side === "AR" ? week.ar : week.ap
                            if (list.length === 0) return null
                            return (
                              <div key={side} className="billings-side-section">
                                <div className="billings-side-section-header">
                                  <span className={`inv-type-badge inv-type-badge--${side.toLowerCase()}`}>{side}</span>
                                  <span className="billings-count">
                                    {list.length} invoice{list.length === 1 ? "" : "s"}
                                  </span>
                                </div>
                                <div className="billings-leaf-wrap">
                                  <InvoiceTable list={list} side={side} onOpen={openInvoice} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <InvoiceDetailModal
        invoiceId={selectedInvoice?.recnum ?? null}
        module={selectedInvoice?.module ?? "clients"}
        onClose={() => setSelectedInvoice(null)}
      />
    </Page>
  )
}

export default function UpcomingBillingsPage() {
  return (
    <PageDataProvider module="dashboard" queries={PAGE_QUERIES.dashboardUpcomingBillings}>
      <UpcomingBillingsContent />
    </PageDataProvider>
  )
}
