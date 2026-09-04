import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ChevronRight, Download, X } from "lucide-react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { Widget } from "../../shared/components/Widget/Widget"
import { Chart } from "../../shared/components/Chart/Chart"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { fetchPageData } from "../../shared/api/pageApi"
import { SkelText } from "../../shared/components/SkelText"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import useIsMobile from "../../shared/hooks/useIsMobile"
import { downloadXlsx, type SheetRow, type StyledCell } from "../../shared/utils/exportXlsx"
import { XLSX_INK, XLSX_INK_SOFT, XLSX_HEAD_FILL, XLSX_STRIPE, xlsxCellBorder } from "../../shared/utils/xlsxTheme"
import { formatMoney, formatMoneyFull, formatDate } from "../../shared/utils/format"
import {
  buildAgingForecast,
  buildBillingsInvoices,
  type AgingOpenRow,
  type BillingsInvoice,
} from "./utils/agingForecast"
import { AR_COLOR, AP_COLOR } from "./widgets/billings/billingsShared"
import { Fact } from "../jobcost/detailPrimitives"
import { PeriodSearch, Highlight } from "./PeriodSearch"

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

// Past-half data from `weeklyBillingAccuracy` (reconstructed forecast + paid).
interface PastSide {
  projected: number
  actual: number
}
interface PastWeek {
  weekStart: string
  ar: PastSide
  ap: PastSide
}
interface BillingAccuracyData {
  arAvailable: boolean
  apAvailable: boolean
  weeks: PastWeek[]
  /** Week-to-date payments for the current partial week (Monday → today). */
  current?: { weekStart: string; through: string; ar: { actual: number }; ap: { actual: number } }
}

const TODAY_LABEL = "This Week"

/** What the week modal shows: a forward week's open invoices for one side,
 *  or a past / current week's paid-vs-projected breakdown for one side. */
type WeekModalTarget =
  | { kind: "future"; side: Side; week: WeekGroup }
  | { kind: "past"; side: Side; label: string; weekStart: string; isCurrent: boolean }

interface DetailProjected {
  recnum: string
  invnum: string | null
  counterparty: string | null
  job: string | null
  duedte: string | null
  mark: string | null
  invttl: number
  openAtStart: number
  paidDuring: number
}
interface DetailPaid {
  recnum: string
  invnum: string | null
  counterparty: string | null
  job: string | null
  chkdte: string | null
  mark: string | null
  amount: number
  wasProjected: boolean
}
interface WeekDetail {
  available: boolean
  projected: DetailProjected[]
  paid: DetailPaid[]
}

const SIDE_META = {
  ar: { code: "AR", title: "Receivables", verb: "received" },
  ap: { code: "AP", title: "Payables", verb: "paid" },
} as const

/** Searchable text of an open invoice: client/vendor, invoice #, job, and
 *  the balance and invoice amounts (formatted digits and raw). */
function invoiceSearchText(inv: BillingsInvoice) {
  return [
    inv.counterparty,
    inv.invnum,
    inv.job,
    formatMoneyFull(inv.amount).replace(/[$,]/g, ""),
    inv.amount.toFixed(2),
    formatMoneyFull(inv.total).replace(/[$,]/g, ""),
    inv.total.toFixed(2),
  ]
    .join("\n")
    .toLowerCase()
}

/** Past-window totals for one side, for the accuracy strip. */
function sideTotals(weeks: PastWeek[], side: "ar" | "ap") {
  const projected = weeks.reduce((s, w) => s + w[side].projected, 0)
  const actual = weeks.reduce((s, w) => s + w[side].actual, 0)
  return { projected, actual, ratio: projected > 0 ? actual / projected : null }
}

type LeafSortKey = "counterparty" | "invnum" | "job" | "due" | "mark" | "total" | "amount"

function InvoiceTable({
  list,
  side,
  highlight,
  onOpen,
}: {
  list: BillingsInvoice[]
  side: Side
  highlight?: string
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
            tabIndex={inv.recnum ? 0 : undefined}
            role={inv.recnum ? "button" : undefined}
            onKeyDown={inv.recnum ? (e) => e.key === "Enter" && onOpen(inv.recnum, side) : undefined}
          >
            <td><Highlight text={inv.counterparty || "—"} query={highlight} /></td>
            <td className="text-secondary"><Highlight text={inv.invnum || "—"} query={highlight} /></td>
            <td className="text-secondary"><Highlight text={inv.job || "—"} query={highlight} /></td>
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

/** AR then AP tables for one week, shared by the row body and the modal. */
function WeekSides({ week, only, highlight, onOpenInvoice }: { week: WeekGroup; only?: Side; highlight?: string; onOpenInvoice: (recnum: string, side: Side) => void }) {
  const sides = (["AR", "AP"] as const).filter((side) => (!only || side === only) && (side === "AR" ? week.ar : week.ap).length > 0)
  if (sides.length === 0) return <p className="reports-modal-empty body-text text-secondary">No invoices this week.</p>
  return (
    <>
      {sides.map((side) => {
        const list = side === "AR" ? week.ar : week.ap
        return (
          <div key={side} className="billings-side-section">
            <div className="billings-side-section-header">
              <span className={`inv-type-badge inv-type-badge--${side.toLowerCase()}`}>{side}</span>
              <span className="billings-count">
                {list.length} invoice{list.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="ohr-cost-items">
              <InvoiceTable list={list} side={side} highlight={highlight} onOpen={onOpenInvoice} />
            </div>
          </div>
        )
      })}
    </>
  )
}

/**
 * Weeks as expanding period cards — the Overhead Report's Monthly Spending
 * rows (OverheadCostRows) with the week's AR / AP / Net in the head slots
 * and the AR + AP invoice tables in the body.
 */
function WeekRows({
  weeks,
  openKey,
  openKeys,
  highlight,
  emptyText = "No upcoming invoices.",
  onToggle,
  onOpenInvoice,
}: {
  weeks: WeekGroup[]
  /** The single open week (one at a time). */
  openKey: number | null
  /** When given, every listed week is open at once (search results); `openKey` is ignored. */
  openKeys?: ReadonlySet<number>
  /** Search text to mark inside client/vendor, invoice and job cells. */
  highlight?: string
  emptyText?: string
  onToggle: (i: number) => void
  onOpenInvoice: (recnum: string, side: Side) => void
}) {
  if (weeks.every((w) => w.ar.length + w.ap.length === 0)) {
    return <p className="reports-modal-empty body-text text-secondary">{emptyText}</p>
  }
  return (
    <div className="ohr-detail-list scrollbar-secondary">
      {weeks.map((week) => {
        const count = week.ar.length + week.ap.length
        const isOpen = openKeys ? openKeys.has(week.index) : openKey === week.index
        const net = week.arTotal - week.apTotal
        const money = (v: number, color: string) => (
          <span className="jc-head-stat-value num" style={{ color: v ? color : "var(--secondary-text)" }}>
            {formatMoneyFull(v)}
          </span>
        )
        return (
          <div key={week.index} className={`ohr-cost-card${isOpen ? " ohr-cost-card-open" : ""}${count === 0 ? " ubw-empty" : ""}`}>
            <div
              className="ohr-cost-head"
              role="button"
              tabIndex={count ? 0 : -1}
              aria-expanded={isOpen}
              aria-disabled={count === 0}
              onClick={() => count && onToggle(week.index)}
              onKeyDown={(e) => {
                if (count && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault()
                  onToggle(week.index)
                }
              }}
            >
              <span className="jc-head-toggle">
                <ChevronRight size={15} className={`jc-expand-chevron${isOpen ? " open" : ""}`} />
              </span>
              <span className="ohr-cost-label">{week.label}</span>
              <span className="ohr-cost-stats">
                <span className="jc-head-stat">
                  <span className="jc-head-stat-label">Invoices</span>
                  <span className="jc-head-stat-value">{count}</span>
                </span>
                <span className="jc-head-stat">
                  <span className="jc-head-stat-label">AR in</span>
                  {money(week.arTotal, AR_COLOR)}
                </span>
                <span className="jc-head-stat">
                  <span className="jc-head-stat-label">AP out</span>
                  {money(week.apTotal, AP_COLOR)}
                </span>
                <span className="jc-head-stat">
                  <span className="jc-head-stat-label">Net</span>
                  {money(net, net > 0 ? AR_COLOR : AP_COLOR)}
                </span>
              </span>
            </div>
            {openKeys ? (
              // Search mode: many weeks open at once, re-rendered per query,
              // so no height tween here.
              isOpen && (
                <div className="ohr-cost-body">
                  <WeekSides week={week} highlight={highlight} onOpenInvoice={onOpenInvoice} />
                </div>
              )
            ) : (
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
                    <WeekSides week={week} onOpenInvoice={onOpenInvoice} />
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * How a payment related to the forecast: it was projected for the week it
 * landed in, or for some week ahead (paid early) or behind (paid late), or
 * its invoice never had a due date to project from.
 */
function ProjectionBadge({ mark, weekStart, wasProjected }: { mark: string | null; weekStart: string; wasProjected: boolean }) {
  if (wasProjected) return <span className="ubw-badge ubw-badge--ok">Correctly projected</span>
  if (!mark) return <span className="ubw-badge">Not projected</span>
  const diff = Math.round((new Date(`${mark}T00:00:00Z`).getTime() - new Date(`${weekStart}T00:00:00Z`).getTime()) / (7 * 86_400_000))
  if (diff > 0) return <span className="ubw-badge ubw-badge--early">Projected {diff} week{diff === 1 ? "" : "s"} out</span>
  if (diff < 0) return <span className="ubw-badge ubw-badge--late">Projected {-diff} week{diff === -1 ? "" : "s"} earlier</span>
  return <span className="ubw-badge ubw-badge--ok">Correctly projected</span>
}

/** Section header inside the week modal: title, count, total. */
function DetailSectionHead({ title, count, noun, total, color }: { title: string; count: number; noun: string; total: number; color?: string }) {
  return (
    <div className="ubw-section-head">
      <span className="ubw-section-title headline">{title}</span>
      <span className="ubw-section-count footnote">
        {count} {noun}{count === 1 ? "" : "s"}
      </span>
      <span className="ubw-section-total title3 emphasized num" style={color ? { color } : undefined}>{formatMoneyFull(total)}</span>
    </div>
  )
}

/** Paid vs. projected tables for a past / current week (fetched on demand). */
function WeekDetailBody({
  target,
  detail,
  onOpenInvoice,
}: {
  target: Extract<WeekModalTarget, { kind: "past" }>
  detail: WeekDetail | "loading" | "error"
  onOpenInvoice: (recnum: string, side: Side) => void
}) {
  const color = target.side === "AR" ? AR_COLOR : AP_COLOR
  const verb = target.side === "AR" ? "Received" : "Paid"
  if (detail === "loading") {
    return (
      <div className="ohr-cost-items ohr-cost-items-loading" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="ohr-cost-skel-row">
            <SkelText ch={9} />
            <SkelText ch={26} />
            <SkelText ch={8} />
          </div>
        ))}
      </div>
    )
  }
  if (detail === "error") {
    return <p className="reports-modal-empty body-text text-secondary">Couldn't load this week. Try again in a moment.</p>
  }
  if (!detail.available) {
    return <p className="reports-modal-empty body-text text-secondary">{target.side} payment history is not exposed by Sage.</p>
  }
  const rowProps = (recnum: string) => ({
    className: "clickable-row",
    onClick: () => onOpenInvoice(recnum, target.side),
    tabIndex: 0,
    role: "button" as const,
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && onOpenInvoice(recnum, target.side),
    title: "View invoice details",
  })
  const paidTotal = detail.paid.reduce((s, p) => s + p.amount, 0)
  const projTotal = detail.projected.reduce((s, p) => s + p.openAtStart, 0)
  return (
    <>
      <div className="billings-side-section ubw-section">
        <DetailSectionHead
          title={`${verb} ${target.isCurrent ? "so far this week" : "this week"}`}
          count={detail.paid.length}
          noun="payment"
          total={paidTotal}
          color={color}
        />
        <div className="ohr-cost-items">
          {detail.paid.length === 0 ? (
            <p className="reports-modal-empty body-text text-secondary">Nothing {verb.toLowerCase()} {target.isCurrent ? "yet" : "this week"}.</p>
          ) : (
            <table className="data-table billings-leaf-table">
              <thead>
                <tr>
                  <th>Client / Vendor</th>
                  <th>Invoice</th>
                  <th>Job</th>
                  <th>{verb} on</th>
                  <th>Forecast</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {detail.paid.map((p, i) => (
                  <tr key={`${p.recnum}-${i}`} {...rowProps(p.recnum)}>
                    <td>{p.counterparty || "—"}</td>
                    <td className="text-secondary">{p.invnum || "—"}</td>
                    <td className="text-secondary">{p.job || "—"}</td>
                    <td className="text-secondary">{formatDate(p.chkdte)}</td>
                    <td><ProjectionBadge mark={p.mark} weekStart={target.weekStart} wasProjected={p.wasProjected} /></td>
                    <td className="num" style={{ color }}>{formatMoneyFull(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="billings-side-section ubw-section">
        <DetailSectionHead title="Projected for this week" count={detail.projected.length} noun="invoice" total={projTotal} />
        <div className="ohr-cost-items">
          {detail.projected.length === 0 ? (
            <p className="reports-modal-empty body-text text-secondary">Nothing was projected for this week.</p>
          ) : (
            <table className="data-table billings-leaf-table">
              <thead>
                <tr>
                  <th>Client / Vendor</th>
                  <th>Invoice</th>
                  <th>Job</th>
                  <th>Due</th>
                  <th>Overdue on</th>
                  <th className="num">Projected</th>
                  <th className="num">{verb}</th>
                </tr>
              </thead>
              <tbody>
                {detail.projected.map((p, i) => (
                  <tr key={`${p.recnum}-${i}`} {...rowProps(p.recnum)}>
                    <td>{p.counterparty || "—"}</td>
                    <td className="text-secondary">{p.invnum || "—"}</td>
                    <td className="text-secondary">{p.job || "—"}</td>
                    <td className="text-secondary">{formatDate(p.duedte)}</td>
                    <td className="text-secondary">{formatDate(p.mark)}</td>
                    <td className="num">{formatMoneyFull(p.openAtStart)}</td>
                    <td className="num" style={{ color: p.paidDuring > 0 ? color : "var(--secondary-text)" }}>
                      {formatMoneyFull(p.paidDuring)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * One week for one side in a modal — opened from a chart point, the way the
 * Overhead Report's Category Trend opens a category. Forward weeks list the
 * open invoices reaching their mark; past weeks and This Week show what was
 * actually paid against what was projected. Same overlay/card shell as the
 * category detail; the invoice modal stacks above via useModalLayer.
 */
function WeekInvoicesModal({
  target,
  onClose,
  onOpenInvoice,
}: {
  target: WeekModalTarget | null
  onClose: () => void
  onOpenInvoice: (recnum: string, side: Side) => void
}) {
  const open = target != null
  const { overlayZ, contentZ } = useModalLayer(open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Past / current weeks fetch their breakdown when opened (cached per
  // week+side for the life of the page).
  const [details, setDetails] = useState<Record<string, WeekDetail | "loading" | "error">>({})
  const detailKey = target?.kind === "past" ? `${target.side}|${target.weekStart}` : null
  useEffect(() => {
    if (!target || target.kind !== "past" || !detailKey || details[detailKey]) return
    setDetails((m) => ({ ...m, [detailKey]: "loading" }))
    fetchPageData({
      module: "dashboard",
      queries: ["billingWeekDetail"],
      params: { from: target.weekStart, kind: target.side.toLowerCase() },
    })
      .then((res) => {
        const d = res.billingWeekDetail as WeekDetail | null
        setDetails((m) => ({ ...m, [detailKey]: d && Array.isArray(d.projected) ? d : "error" }))
      })
      .catch(() => setDetails((m) => ({ ...m, [detailKey]: "error" })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailKey])

  const meta = target ? (target.side === "AR" ? SIDE_META.ar : SIDE_META.ap) : null
  const color = target?.side === "AR" ? AR_COLOR : AP_COLOR
  let title = ""
  let subtitle = ""
  let headline: number | null = null
  // Past weeks: projected total + signed miss ($ and % of projected).
  let projectedTotal: number | null = null
  if (target?.kind === "future") {
    const list = target.side === "AR" ? target.week.ar : target.week.ap
    title = target.week.label
    subtitle = `${meta!.title} · ${list.length} invoice${list.length === 1 ? "" : "s"} reaching 30 days past due`
    headline = list.reduce((s, x) => s + x.amount, 0)
  } else if (target?.kind === "past") {
    const d = detailKey ? details[detailKey] : undefined
    const ws = new Date(`${target.weekStart}T12:00:00`)
    const wsLabel = isNaN(ws.getTime()) ? target.label : ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    title = target.isCurrent ? "This Week" : `Week of ${wsLabel}`
    subtitle = target.isCurrent ? meta!.title : `${meta!.title} · ${target.label.replace("w ago", " weeks ago")}`
    if (d && typeof d === "object") {
      headline = d.paid.reduce((s, p) => s + p.amount, 0)
      projectedTotal = d.projected.reduce((s, p) => s + p.openAtStart, 0)
    }
  }
  const miss = headline != null && projectedTotal != null ? headline - projectedTotal : null

  return createPortal(
    <AnimatePresence>
      {open && target && (
        <>
          <motion.div
            key="overlay"
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
              className="ohr-detail ubw-modal"
              style={{ borderRadius: 16 }}
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.16 } }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="ohr-detail-right ubw-modal-pane">
                <div className="ohr-detail-right-head ubw-modal-head">
                  <div className="ubw-modal-title">
                    <h2 className="title2 emphasized">{title}</h2>
                    <span className="reports-modal-subtitle">
                      <span className="ubw-modal-side" style={{ color }}>{target.side}</span>
                      {" · "}
                      {subtitle}
                      {miss != null && miss !== 0 && (
                        <>
                          {" · "}
                          <span className="num" style={{ color: miss >= 0 ? AR_COLOR : AP_COLOR }}>
                            {miss >= 0 ? "+" : "−"}{formatMoneyFull(Math.abs(miss))}
                          </span>
                          {" vs. projected"}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="ohr-detail-head-actions">
                    <button type="button" className="button modal-close" onClick={onClose} aria-label="Close">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="ohr-detail-list scrollbar-secondary">
                  {target.kind === "future" ? (
                    <WeekSides week={target.week} only={target.side} onOpenInvoice={onOpenInvoice} />
                  ) : (
                    <WeekDetailBody target={target} detail={details[detailKey!] ?? "loading"} onOpenInvoice={onOpenInvoice} />
                  )}
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

function UpcomingBillingsContent() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data, isLoading } = useWidgetData<{
    agingSummaryOpen: AgingOpenRow[] | null
    weeklyBillingAccuracy: BillingAccuracyData | null
  }>(["agingSummaryOpen", "weeklyBillingAccuracy"])
  const past = data?.weeklyBillingAccuracy
  // Past weeks arrive oldest → newest; label each by its distance from today.
  const pastWeeks = useMemo(
    () => (past?.weeks ?? []).map((w, i, arr) => ({ ...w, label: `${arr.length - i}w ago` })),
    [past]
  )
  const pastLen = pastWeeks.length
  const arTotals = useMemo(() => sideTotals(pastWeeks, "ar"), [pastWeeks])
  const apTotals = useMemo(() => sideTotals(pastWeeks, "ap"), [pastWeeks])

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
  // Each side gets its own panel: one timeline with "This Week" in the middle.
  // Right of center is the live forecast; left of center is the same forecast
  // reconstructed for each past week (what this chart would have shown that
  // Monday) beside what Sage actually recorded as paid. Dashed = projected
  // (the app-wide plan-overlay convention), solid = actual; the actual series
  // is null on the forward half so its line ends at today.
  const panels = useMemo(() => {
    if (!forecast) return []
    const fut = forecast.weeks
    const xs = [...pastWeeks.map((w) => w.label), ...fut.map((w) => w.label)]
    const pts = (ys: (number | null)[]) => xs.map((x, i) => ({ x, y: ys[i] }))
    const build = (side: "ar" | "ap", color: string, available: boolean | undefined) => {
      const projected = [...pastWeeks.map((w) => w[side].projected), ...fut.map((w) => w[side])]
      // Actual runs through "This Week" as week-to-date, so the solid line
      // reaches today; it is null for every later week.
      const actual = [
        ...pastWeeks.map((w) => w[side].actual),
        ...fut.map((_, i) => (i === 0 && past?.current ? past.current[side].actual : null)),
      ]
      const series = [{ id: "Projected", color, data: pts(projected) }]
      if (pastLen && available) series.unshift({ id: "Actual", color, data: pts(actual) })
      const nextTotal = fut.reduce((sum, w) => sum + w[side], 0)
      return { side, color, series, nextTotal, available: Boolean(available) }
    }
    return [build("ar", AR_COLOR, past?.arAvailable), build("ap", AP_COLOR, past?.apAvailable)]
  }, [forecast, pastWeeks, pastLen, past?.arAvailable, past?.apAvailable, past?.current])

  // Seventeen labels crowd a half-width panel: show every other one on either
  // side of "This Week" (every fourth on a phone), always keeping the anchor.
  const isMobile = useIsMobile()
  const axisBottomTickValues = useMemo(() => {
    if (!forecast) return undefined
    const all = [...pastWeeks.map((w) => w.label), ...forecast.weeks.map((w) => w.label)]
    const step = isMobile ? 4 : 2
    return all.filter((x, i) => (i - pastLen) % step === 0 || x === TODAY_LABEL)
  }, [isMobile, forecast, pastWeeks, pastLen])

  // Invoices by week: one open row at a time (the Monthly Spending pattern).
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  // Search across every week: matching weeks open at once (minus any the
  // user folds back up); weeks without a match are hidden.
  const [searchQuery, setSearchQuery] = useState("")
  const [searchFolded, setSearchFolded] = useState<ReadonlySet<number>>(() => new Set())
  const handleSearchQuery = useCallback((q: string) => {
    setSearchQuery(q)
    setSearchFolded(new Set())
  }, [])
  const searchIndex = useMemo(() => new Map(invoices.map((inv) => [inv, invoiceSearchText(inv)] as const)), [invoices])
  const searchWeeks = useMemo<WeekGroup[]>(() => {
    if (!searchQuery) return weeks
    const hit = (inv: BillingsInvoice) => (searchIndex.get(inv) ?? "").includes(searchQuery)
    return weeks.flatMap((w) => {
      const ar = w.ar.filter(hit)
      const ap = w.ap.filter(hit)
      if (ar.length + ap.length === 0) return []
      return [{ ...w, ar, ap, arTotal: ar.reduce((s, x) => s + x.amount, 0), apTotal: ap.reduce((s, x) => s + x.amount, 0) }]
    })
  }, [weeks, searchQuery, searchIndex])
  const searchSummary = useMemo(() => {
    if (!searchQuery) return null
    const count = searchWeeks.reduce((s, w) => s + w.ar.length + w.ap.length, 0)
    const arTotal = searchWeeks.reduce((s, w) => s + w.arTotal, 0)
    const apTotal = searchWeeks.reduce((s, w) => s + w.apTotal, 0)
    return { count, weeks: searchWeeks.length, arTotal, apTotal }
  }, [searchWeeks, searchQuery])
  const searchOpenKeys = useMemo<ReadonlySet<number> | undefined>(() => {
    if (!searchQuery) return undefined
    return new Set(searchWeeks.map((w) => w.index).filter((k) => !searchFolded.has(k)))
  }, [searchWeeks, searchQuery, searchFolded])
  // Clicking a forward week on either chart opens that week's invoices in a
  // modal (the Category Trend pattern) instead of scrolling the page.
  const [modalTarget, setModalTarget] = useState<WeekModalTarget | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<
    { recnum: string; module: "clients" | "suppliers" } | null
  >(null)

  // A chart point opens the week for THAT panel's side only. Past weeks and
  // This Week show paid vs. projected (fetched on demand); later weeks show
  // the open invoices reaching their mark that week.
  function openWeekFor(side: Side, label: string) {
    const fi = weeks.findIndex((w) => w.label === label)
    if (fi > 0) {
      setModalTarget({ kind: "future", side, week: weeks[fi] })
      return
    }
    if (fi === 0) {
      const weekStart = past?.current?.weekStart
      if (weekStart) setModalTarget({ kind: "past", side, label, weekStart, isCurrent: true })
      else setModalTarget({ kind: "future", side, week: weeks[0] })
      return
    }
    const pw = pastWeeks.find((w) => w.label === label)
    if (pw) setModalTarget({ kind: "past", side, label, weekStart: pw.weekStart, isCurrent: false })
  }

  function openInvoice(recnum: string, side: Side) {
    setSelectedInvoice({ recnum, module: side === "AP" ? "suppliers" : "clients" })
  }

  function handleExport() {
    if (invoices.length === 0) return
    // Balances split into AR In / AP Out columns (the other side left blank)
    // so each column sums independently in the spreadsheet.
    const header = ["Week", "Type", "Client / Vendor", "Invoice", "Job", "Due", "Overdue on", "AR In", "AP Out"]
    const MONEY_COLS = new Set([7, 8])
    const headStyle = (i: number): StyledCell["s"] => ({
      font: { bold: true, sz: 11, color: { rgb: XLSX_INK_SOFT } },
      fill: { fgColor: { rgb: XLSX_HEAD_FILL } },
      border: xlsxCellBorder,
      alignment: { horizontal: MONEY_COLS.has(i) ? "right" : "left", vertical: "center" },
    })
    const bodyStyle = (i: number, stripe: boolean): StyledCell["s"] => ({
      font: { sz: 12, color: { rgb: XLSX_INK } },
      fill: stripe ? { fgColor: { rgb: XLSX_STRIPE } } : undefined,
      border: xlsxCellBorder,
      alignment: { horizontal: MONEY_COLS.has(i) ? "right" : "left", vertical: "center" },
      ...(MONEY_COLS.has(i) ? { numFmt: "#,##0.00" } : {}),
    })
    const rows: SheetRow[] = [header.map((h, i) => ({ v: h, s: headStyle(i) }))]
    invoices.forEach((inv, r) => {
      const stripe = r % 2 === 1
      const cells: (string | number)[] = [
        inv.weekLabel,
        inv.side,
        inv.counterparty,
        inv.invnum,
        inv.job,
        formatDate(inv.due),
        formatDate(inv.mark),
        inv.side === "AR" ? inv.amount : "",
        inv.side === "AP" ? inv.amount : "",
      ]
      rows.push(cells.map((v, i) => ({ v, s: bodyStyle(i, stripe) })))
    })
    const date = new Date().toISOString().slice(0, 10)
    downloadXlsx(rows, `Forecast_Billings_${date}.xlsx`, "Forecast Billings", {
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
    // Deep links predate the side split: default to the side with invoices.
    setModalTarget({ kind: "future", side: weeks[i].ar.length || !weeks[i].ap.length ? "AR" : "AP", week: weeks[i] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks.length])

  return (
    <Page
      title="Forecast Billings"
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
      <MotionList className="mbp-stack">
        <MotionItem>
        <section className="billings-week-section">
          <h2 className="widget-title headline billings-week-section-title">Projected vs. Actual</h2>
          <p className="body-text text-secondary ubf-intro">
            By the week invoices reach 30 days past due.
          </p>
          <div className="ubf-grid">
            {(isLoading || !forecast
              ? [
                  { side: "ar" as const, color: AR_COLOR },
                  { side: "ap" as const, color: AP_COLOR },
                ]
              : panels
            ).map((p) => {
              const meta = p.side === "ar" ? SIDE_META.ar : SIDE_META.ap
              const t = p.side === "ar" ? arTotals : apTotals
              const full = "series" in p ? p : null
              const miss = t.actual - t.projected
              const missPct = t.projected > 0 ? Math.round((Math.abs(miss) / t.projected) * 100) : null
              return (
                <Widget
                  key={p.side}
                  loading={isLoading}
                  noData={!forecast}
                  className="ubf-panel mbp-chart-widget"
                  title={`${meta.code} · ${meta.title}`}
                  actions={
                    full && (
                      <span className="ubf-key">
                        {full.available && (
                          <>
                            <span className="ubf-key-line" style={{ borderTopColor: p.color }} />
                            {meta.verb}
                          </>
                        )}
                        <span className="ubf-key-line ubf-key-line--dashed" style={{ borderTopColor: p.color }} />
                        projected
                      </span>
                    )
                  }
                >
                  {full && (
                    <div className="ubf-panel-body">
                      <div className="ubf-chart">
                        <Chart
                          config={{
                            type: "line",
                            series: full.series,
                            yFormat: (v) => formatMoney(v),
                            enableArea: true,
                            curve: "monotoneX",
                            legend: false,
                            hidePoints: true,
                            // Same gridline density on AR and AP (1/2/5 nice steps).
                            yTickCount: 5,
                            axisBottomTickValues,
                            dashedSeriesIds: ["Projected"],
                            planTooltip: { delta: true, percent: true, actualLabel: p.side === "ar" ? "Received" : "Paid" },
                            shadeFromX: TODAY_LABEL,
                            markers: [
                              {
                                axis: "x",
                                value: TODAY_LABEL,
                                legend: "Today",
                                legendPosition: "top",
                                lineStyle: { stroke: "currentColor", strokeWidth: 1, strokeOpacity: 0.35, strokeDasharray: "3 4" },
                                textStyle: { fill: "currentColor", fontSize: 10, fontWeight: 600 },
                              },
                            ],
                            disableGrowthTooltip: true,
                            // Forward weeks open their card below; past weeks
                            // have no open-invoice list, handleBarClick ignores them.
                            onPointClick: (label) => openWeekFor(meta.code, label),
                          }}
                        />
                      </div>
                      <div className="ubf-facts jcd-facts">
                        {full.available ? (
                          <>
                            <Fact
                              label={`Past ${pastLen} weeks`}
                              value={formatMoney(t.actual)}
                              sub={`${formatMoney(t.projected)} projected`}
                            />
                            <Fact
                              label="Forecast miss"
                              value={`${miss >= 0 ? "+" : "−"}${formatMoney(Math.abs(miss))}`}
                              sub={missPct == null ? "actual minus projected" : `${miss >= 0 ? "+" : "−"}${missPct}% vs projected`}
                            />
                          </>
                        ) : (
                          <Fact label={`Past ${pastLen} weeks`} value="n/a" sub={`${meta.code} payment history is not exposed by Sage`} />
                        )}
                        <Fact
                          label={`Next ${(forecast?.weeks.length ?? 1) - 1} weeks`}
                          value={formatMoney(full.nextTotal)}
                          sub="reaching 30 days past due"
                        />
                      </div>
                    </div>
                  )}
                </Widget>
              )
            })}
          </div>
        </section>
        </MotionItem>

        <MotionItem>
          <Widget
            title="Invoices by week"
            description={searchQuery ? `Open invoices matching “${searchQuery}” across every week.` : undefined}
            loading={isLoading}
            noData={!forecast}
            className="ohr-spending-widget"
            actions={
              <>
                {openWeek != null && !searchQuery && (
                  <button className="widget-link-btn" onClick={() => setOpenWeek(null)} title="Collapse">
                    <X size={12} /> Collapse {weeks[openWeek]?.label}
                  </button>
                )}
                <PeriodSearch onQuery={handleSearchQuery} placeholder="Search all weeks" ariaLabel="Search invoices across all weeks" />
              </>
            }
          >
            <AnimatePresence initial={false}>
              {searchSummary && (
                <motion.div
                  key="summary"
                  className="ohr-search-summary"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ height: { duration: 0.18, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.12 } }}
                >
                  <div className="ohr-search-summary-inner">
                    <span className="ohr-search-summary-text">
                      {searchSummary.count === 0
                        ? "No matching invoices"
                        : `${searchSummary.count} matching ${searchSummary.count === 1 ? "invoice" : "invoices"} across ${searchSummary.weeks} ${searchSummary.weeks === 1 ? "week" : "weeks"}`}
                    </span>
                    <span className="ohr-cost-stats">
                      <span className="jc-head-stat ohr-search-summary-total">
                        <span className="jc-head-stat-label">AR in</span>
                        <span className="jc-head-stat-value num" style={{ color: searchSummary.arTotal ? AR_COLOR : "var(--secondary-text)" }}>{formatMoneyFull(searchSummary.arTotal)}</span>
                      </span>
                      <span className="jc-head-stat ohr-search-summary-total">
                        <span className="jc-head-stat-label">AP out</span>
                        <span className="jc-head-stat-value num" style={{ color: searchSummary.apTotal ? AP_COLOR : "var(--secondary-text)" }}>{formatMoneyFull(searchSummary.apTotal)}</span>
                      </span>
                      <span className="jc-head-stat ohr-search-summary-total">
                        <span className="jc-head-stat-label">Net</span>
                        <span className="jc-head-stat-value num" style={{ color: searchSummary.arTotal - searchSummary.apTotal > 0 ? AR_COLOR : AP_COLOR }}>{formatMoneyFull(searchSummary.arTotal - searchSummary.apTotal)}</span>
                      </span>
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <WeekRows
              weeks={searchWeeks}
              openKey={openWeek}
              openKeys={searchOpenKeys}
              highlight={searchQuery || undefined}
              emptyText={searchQuery ? `No open invoices match “${searchQuery}”.` : "No upcoming invoices."}
              onToggle={(i) => {
                if (searchQuery) {
                  setSearchFolded((curr) => {
                    const next = new Set(curr)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })
                } else {
                  setOpenWeek((curr) => (curr === i ? null : i))
                }
              }}
              onOpenInvoice={openInvoice}
            />
          </Widget>
        </MotionItem>
      </MotionList>

      <WeekInvoicesModal target={modalTarget} onClose={() => setModalTarget(null)} onOpenInvoice={openInvoice} />

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
