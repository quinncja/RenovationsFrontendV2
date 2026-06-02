import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, ChevronDown, ChevronRight, Download } from "lucide-react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { downloadXlsx } from "../../shared/utils/exportXlsx"
import { formatMoney, formatMoneyFull, formatDate } from "../../shared/utils/format"
import {
  buildAgingForecast,
  buildBillingsInvoices,
  type AgingOpenRow,
  type BillingsInvoice,
} from "./utils/agingForecast"
import { AR_COLOR, AP_COLOR, niceCeil } from "./widgets/billings/billingsShared"

// Drill-down for the home Upcoming Billings widget: the forecast chart plus a
// Week → AR/AP → invoices folder tree. Clicking a bar (here or on the home page,
// via ?week=&side=) expands the matching folder.

interface WeekGroup {
  index: number
  label: string
  ar: BillingsInvoice[]
  ap: BillingsInvoice[]
  arTotal: number
  apTotal: number
}

type Side = "AR" | "AP"

type LeafSortKey = "counterparty" | "invnum" | "job" | "mark" | "amount"

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
      : key === "mark"
        ? inv.mark.getTime()
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
          <SortableHeader label="Expected" columnKey="mark" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
          <SortableHeader label="Amount" columnKey="amount" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
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
            <td className="text-secondary">{formatDate(inv.mark)}</td>
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

  const bars = useMemo(
    () => forecast?.weeks.map((w) => ({ label: w.label, AR: w.ar, AP: -w.ap })) ?? [],
    [forecast]
  )
  const bound = useMemo(() => {
    const magnitude = Math.max(0, ...(forecast?.weeks.flatMap((w) => [w.ar, w.ap]) ?? []))
    return niceCeil(magnitude) || 10_000
  }, [forecast])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedInvoice, setSelectedInvoice] = useState<
    { recnum: string; module: "clients" | "suppliers" } | null
  >(null)
  const weekRefs = useRef<(HTMLTableRowElement | null)[]>([])

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openFolder(weekIndex: number, side?: Side) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(`w${weekIndex}`)
      if (side) next.add(`w${weekIndex}-${side}`)
      return next
    })
    requestAnimationFrame(() =>
      weekRefs.current[weekIndex]?.scrollIntoView({ behavior: "smooth", block: "center" })
    )
  }

  function handleBarClick(label: string, side?: string) {
    const i = weeks.findIndex((w) => w.label === label)
    if (i >= 0) openFolder(i, side === "AR" || side === "AP" ? side : undefined)
  }

  function openInvoice(recnum: string, side: Side) {
    setSelectedInvoice({ recnum, module: side === "AP" ? "suppliers" : "clients" })
  }

  function handleExport() {
    if (invoices.length === 0) return
    const header = ["Week", "Type", "Client / Vendor", "Invoice", "Job", "Expected", "Amount"]
    const rows: (string | number)[][] = [header]
    for (const inv of invoices) {
      rows.push([
        inv.weekLabel,
        inv.side,
        inv.counterparty,
        inv.invnum,
        inv.job,
        formatDate(inv.mark),
        inv.amount,
      ])
    }
    const date = new Date().toISOString().slice(0, 10)
    downloadXlsx(rows, `Upcoming_Billings_${date}.xlsx`, "Upcoming Billings", {
      autoFilterRow: 0,
      autoFilterCols: header.length,
    })
  }

  // Deep link from the home widget: ?week=<index>&side=<AR|AP> opens that folder.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || weeks.length === 0) return
    didInit.current = true
    const wParam = searchParams.get("week")
    if (wParam == null) return
    const i = Number(wParam)
    if (!Number.isInteger(i) || i < 0 || i >= weeks.length) return
    const sParam = searchParams.get("side")
    openFolder(i, sParam === "AR" || sParam === "AP" ? sParam : undefined)
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
          title="Forecast — next 6 weeks"
          loading={isLoading}
          noData={!forecast}
          className="mbp-chart-widget"
        >
          {forecast && (
            <Chart
              config={{
                type: "bar",
                data: bars,
                keys: ["AR", "AP"],
                indexBy: "label",
                colors: [AR_COLOR, AP_COLOR],
                yFormat: (v) => formatMoney(Math.abs(v)),
                minValue: -bound,
                maxValue: bound,
                axisLeftTickValues: 5,
                emphasizeZero: true,
                groupTooltip: true,
                tooltipTotalLabel: "Net",
                hideLegend: true,
                onBarClick: handleBarClick,
              }}
            />
          )}
        </Widget>

        <Widget title="Invoices by week" loading={isLoading} noData={!isLoading && invoices.length === 0}>
          <table className="data-table billings-tree">
            <thead>
              <tr>
                <th>Week</th>
                <th className="num">AR in</th>
                <th className="num">AP out</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const count = week.ar.length + week.ap.length
                const weekOpen = expanded.has(`w${week.index}`)
                const net = week.arTotal - week.apTotal
                return (
                  <Fragment key={week.index}>
                    <tr
                      ref={(el) => {
                        weekRefs.current[week.index] = el
                      }}
                      className={`billings-week-row${weekOpen ? " expanded" : ""}${count === 0 ? " is-empty" : ""}`}
                      onClick={count > 0 ? () => toggle(`w${week.index}`) : undefined}
                      role={count > 0 ? "button" : undefined}
                      tabIndex={count > 0 ? 0 : undefined}
                      onKeyDown={count > 0 ? (e) => e.key === "Enter" && toggle(`w${week.index}`) : undefined}
                    >
                      <td className="billings-week-name">
                        <span className="billings-folder-label">
                          <span className="jc-group-chevron">
                            {count > 0 ? weekOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
                          </span>
                          {week.label}
                          <span className="billings-count">
                            {count} invoice{count === 1 ? "" : "s"}
                          </span>
                        </span>
                      </td>
                      <td className="num" style={{ color: AR_COLOR }}>{formatMoneyFull(week.arTotal)}</td>
                      <td className="num" style={{ color: AP_COLOR }}>{formatMoneyFull(week.apTotal)}</td>
                      <td className="num" style={{ color: net >= 0 ? AR_COLOR : AP_COLOR }}>
                        {formatMoneyFull(net)}
                      </td>
                    </tr>

                    {weekOpen &&
                      (["AR", "AP"] as const).map((side) => {
                        const list = side === "AR" ? week.ar : week.ap
                        const sideOpen = expanded.has(`w${week.index}-${side}`)
                        const sideTotal = side === "AR" ? week.arTotal : week.apTotal
                        const color = side === "AR" ? AR_COLOR : AP_COLOR
                        const hasRows = list.length > 0
                        const toggleSide = () => toggle(`w${week.index}-${side}`)
                        return (
                          <Fragment key={side}>
                            <tr
                              className={`billings-side-row${sideOpen ? " expanded" : ""}${hasRows ? "" : " is-empty"}`}
                              onClick={hasRows ? toggleSide : undefined}
                              role={hasRows ? "button" : undefined}
                              tabIndex={hasRows ? 0 : undefined}
                              onKeyDown={hasRows ? (e) => e.key === "Enter" && toggleSide() : undefined}
                            >
                              <td className="billings-side-name">
                                <span className="billings-folder-label">
                                  <span className="jc-group-chevron">
                                    {hasRows ? sideOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
                                  </span>
                                  <span className={`inv-type-badge inv-type-badge--${side.toLowerCase()}`}>{side}</span>
                                  <span className="billings-count">
                                    {list.length} invoice{list.length === 1 ? "" : "s"}
                                  </span>
                                </span>
                              </td>
                              <td className="num">
                                {side === "AR" ? (
                                  <span style={{ color }}>{formatMoneyFull(sideTotal)}</span>
                                ) : null}
                              </td>
                              <td className="num">
                                {side === "AP" ? (
                                  <span style={{ color }}>{formatMoneyFull(sideTotal)}</span>
                                ) : null}
                              </td>
                              <td />
                            </tr>
                            {sideOpen && hasRows && (
                              <tr className="billings-subrow">
                                <td colSpan={4}>
                                  <div className="billings-leaf-wrap">
                                    <InvoiceTable list={list} side={side} onOpen={openInvoice} />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </Widget>
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
