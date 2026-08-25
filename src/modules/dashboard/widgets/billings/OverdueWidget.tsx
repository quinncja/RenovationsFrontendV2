import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { StatPairCard } from "../StatPairCard"
import { InvoiceDetailModal } from "../../../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { useWidgetData } from "../../../../shared/context/PageContext"
import { formatMoneyFull } from "../../../../shared/utils/format"
import {
  buildAgingForecast,
  buildOverdueInvoices,
  type AgingOpenRow,
} from "../../utils/agingForecast"
import { invoiceLabel } from "./billingsShared"
import { InvoiceListModal } from "./InvoiceListModal"

/**
 * Overdue AR/AP positions. Each card is clickable to open a modal listing the
 * invoices in that category.
 */
export function OverdueWidget() {
  const { data, isLoading } = useWidgetData<{ agingSummaryOpen: AgingOpenRow[] | null }>([
    "agingSummaryOpen",
  ])
  const forecast = useMemo(
    () => buildAgingForecast(data?.agingSummaryOpen, new Date()),
    [data?.agingSummaryOpen]
  )
  const [openSide, setOpenSide] = useState<"AR" | "AP" | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<
    { recnum: string; module: "clients" | "suppliers" } | null
  >(null)

  // The clicked side's invoice list — the same mark rule the card totals use.
  const overdueInvoices = useMemo(
    () => (openSide ? buildOverdueInvoices(data?.agingSummaryOpen, new Date(), openSide) : []),
    [data?.agingSummaryOpen, openSide]
  )

  // Net overdue position: receivables (money in) minus payables (money out).
  const net = forecast ? forecast.overdueAR - forecast.overdueAP : 0

  return (
    <>
      <StatPairCard
        title="Overdue Billings"
        loading={isLoading}
        noData={!forecast}
        className="billings-overdue-card"
        top={
          forecast && (
            <button
              type="button"
              className="overdue-line overdue-line--ar"
              onClick={() => setOpenSide("AR")}
              disabled={forecast.overdueARCount === 0}
              title="View overdue AR invoices"
            >
              <span className="overdue-line-head">
                <span className="overdue-line-title">
                  <span className="overdue-line-code overdue-line-code--ar">AR</span>
                </span>
                <span className="overdue-line-dir"><ArrowDown size={13} /> in</span>
              </span>
              <span className="overdue-line-value">{formatMoneyFull(forecast.overdueAR)}</span>
              <span className="overdue-line-sub">{invoiceLabel(forecast.overdueARCount)}</span>
            </button>
          )
        }
        bottom={
          forecast && (
            <button
              type="button"
              className="overdue-line overdue-line--ap"
              onClick={() => setOpenSide("AP")}
              disabled={forecast.overdueAPCount === 0}
              title="View overdue AP invoices"
            >
              <span className="overdue-line-head">
                <span className="overdue-line-title">
                  <span className="overdue-line-code overdue-line-code--ap">AP</span>
                </span>
                <span className="overdue-line-dir"><ArrowUp size={13} /> out</span>
              </span>
              <span className="overdue-line-value">{formatMoneyFull(forecast.overdueAP)}</span>
              <span className="overdue-line-sub">{invoiceLabel(forecast.overdueAPCount)}</span>
            </button>
          )
        }
        footer={
          forecast && (
            <>
              <span className="overdue-net-label">Net overdue position</span>
              <span className={`overdue-net-value${net < 0 ? " overdue-net-value--neg" : ""}`}>
                {formatMoneyFull(net)}
              </span>
            </>
          )
        }
      />

      <InvoiceListModal
        side={openSide}
        title={`Overdue ${openSide ?? ""}`.trim()}
        invoices={overdueInvoices}
        onClose={() => setOpenSide(null)}
        onSelectInvoice={(recnum) =>
          setSelectedInvoice({ recnum, module: openSide === "AP" ? "suppliers" : "clients" })
        }
      />

      {/* Drill-down: the standard invoice modal, layered above the list. */}
      <InvoiceDetailModal
        invoiceId={selectedInvoice?.recnum ?? null}
        module={selectedInvoice?.module ?? "clients"}
        onClose={() => setSelectedInvoice(null)}
      />
    </>
  )
}
