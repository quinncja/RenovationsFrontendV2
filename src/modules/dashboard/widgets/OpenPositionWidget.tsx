import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { Widget } from "../../../shared/components/Widget/Widget"
import { InvoiceDetailModal } from "../../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { SkelText } from "../../../shared/components/SkelText"
import { invoiceLabel } from "./billings/billingsShared"
import { useWidgetData } from "../../../shared/context/PageContext"
import { formatMoneyFull } from "../../../shared/utils/format"
import { buildOpenInvoices, type AgingOpenRow } from "../utils/agingForecast"
import { InvoiceListModal } from "./billings/InvoiceListModal"

// Total open AR / AP right now — every open, non-void invoice on the books
// (`agingSummaryOpen` is already filtered to status < 4 and a non-zero
// balance, so approved and in-review billings both count), not just the
// overdue slice the Overdue Billings card shows. Net position is AR - AP:
// money owed to us less money we owe.
//
// Dressed as the Period & Year Summary columns beside it: warm card, the
// eyebrow on that warm ground, and one white sheet holding the content —
// AR block, seam, AP block, seam, and a closing net row that lands on the
// same line as those cards' Net Profit. The AR/AP blocks keep the Overdue
// Billings card's stat voice and its click-through to the invoice list and
// on into the invoice detail.

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

interface OpenPosition {
  ar: number
  ap: number
  arCount: number
  apCount: number
  net: number
}

function sumOpenPosition(rows: AgingOpenRow[] | null | undefined): OpenPosition {
  let ar = 0
  let ap = 0
  let arCount = 0
  let apCount = 0
  for (const r of rows ?? []) {
    const bal = toNumber(r.invbal)
    if (bal === 0) continue
    // `type` is the backend's aging bucket, prefixed "AR-" / "AP-".
    const side = String(r.type ?? "").slice(0, 2)
    if (side === "AR") {
      ar += bal
      arCount++
    } else if (side === "AP") {
      ap += bal
      apCount++
    }
  }
  return { ar, ap, arCount, apCount, net: ar - ap }
}

export function OpenPositionWidget() {
  const { data, isLoading } = useWidgetData<{ agingSummaryOpen: AgingOpenRow[] | null }>([
    "agingSummaryOpen",
  ])
  const rows = data?.agingSummaryOpen ?? null
  const pos = useMemo(() => sumOpenPosition(rows), [rows])
  const [openSide, setOpenSide] = useState<"AR" | "AP" | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<
    { recnum: string; module: "clients" | "suppliers" } | null
  >(null)

  // The clicked side's invoice list — every open invoice, so it reconciles
  // with the card total above it.
  const invoices = useMemo(
    () => (openSide ? buildOpenInvoices(rows, new Date(), openSide) : []),
    [rows, openSide]
  )

  return (
    <>
      <Widget className="current-period-widget pys-widget pys-position-widget">
        <div className="pys-col">
          <div className="pys-eyebrow">
            <span className="pys-title widget-title headline">Open Position</span>
          </div>
          <div className="pys-sheet">
            <div className="pys-band">
              <button
                type="button"
                className="overdue-line overdue-line--ar"
                onClick={() => setOpenSide("AR")}
                disabled={pos.arCount === 0}
                title="View open AR invoices"
              >
                <span className="overdue-line-head">
                  <span className="overdue-line-title">
                    <span className="overdue-line-code overdue-line-code--ar">AR</span>
                  </span>
                  <span className="overdue-line-dir"><ArrowDown size={13} /> in</span>
                </span>
                <span className="overdue-line-value">
                  {isLoading ? <SkelText ch={9} /> : formatMoneyFull(pos.ar)}
                </span>
                <span className="overdue-line-sub">{invoiceLabel(pos.arCount)}</span>
              </button>
            </div>
            <div className="pys-seam" />
            <div className="pys-band">
              <button
                type="button"
                className="overdue-line overdue-line--ap"
                onClick={() => setOpenSide("AP")}
                disabled={pos.apCount === 0}
                title="View open AP invoices"
              >
                <span className="overdue-line-head">
                  <span className="overdue-line-title">
                    <span className="overdue-line-code overdue-line-code--ap">AP</span>
                  </span>
                  <span className="overdue-line-dir"><ArrowUp size={13} /> out</span>
                </span>
                <span className="overdue-line-value">
                  {isLoading ? <SkelText ch={9} /> : formatMoneyFull(pos.ap)}
                </span>
                <span className="overdue-line-sub">{invoiceLabel(pos.apCount)}</span>
              </button>
            </div>
            <div className="pys-seam" />
            {/* Same row markup as the summary cards' Net Profit, so the two
                closing figures sit on one line across the row. */}
            <div className="pys-band pys-band-final">
              <div className="pys-row pys-row-operand">
                <span className="pys-label">Net Position</span>
                <span
                  className="pys-value"
                  style={!isLoading && pos.net < 0 ? { color: "#ef4444" } : undefined}
                >
                  {isLoading ? <SkelText ch={9} /> : formatMoneyFull(pos.net)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Widget>

      <InvoiceListModal
        side={openSide}
        title={`Open ${openSide ?? ""}`.trim()}
        invoices={invoices}
        // Not all of these are overdue, so the age column reads as days past
        // due, with not-yet-due invoices counting down instead.
        ageColumnLabel="Past due"
        ageLabel={(inv) => (inv.daysOverdue >= 0 ? `${inv.daysOverdue}d` : `in ${-inv.daysOverdue}d`)}
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
