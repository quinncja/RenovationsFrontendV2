import type { ReactNode } from "react"
import { DatabaseZap } from "lucide-react"
import { useWidgetData, usePageDisconnected } from "../../../../shared/context/PageContext"
import { StatWidget } from "../../../../shared/components/StatWidget/StatWidget"
import { formatMoneyFull } from "../../../../shared/utils/format"

// Cash in bank + line of credit, as one widget (two cards) styled to match the
// revenue StatWidgets on the home page. The `agingSummary` query returns a CASH
// row (bank balance) and a CreditSpent row (line-of-credit drawn); the `loc`
// query gives the credit limit. Both already ship in PAGE_QUERIES.adminDashboard,
// so this costs no extra fetch.
interface AgingSummaryRow {
  type: string
  amount: number
}
interface LocPayload {
  loc?: number
}

function rowAmount(rows: AgingSummaryRow[] | null | undefined, type: string): number | null {
  if (!Array.isArray(rows)) return null
  const row = rows.find((r) => r.type === type)
  return row ? row.amount : null
}

/** "ADVIA <label>" — the brand reads as a bold lead-in on the stat title. */
function brandTitle(label: string): ReactNode {
  return (
    <>
      <span className="advia-brand">ADVIA</span> {label}
    </>
  )
}

/** Line of Credit, shown as a drawn / available fraction with a status pill:
 *  the remaining headroom, or an "Overdrawn" pill when the draw exceeds the limit. */
function LineOfCreditCard({
  drawn,
  limit,
  loading,
}: {
  drawn: number | null
  limit: number | null
  loading: boolean
}) {
  const disconnected = usePageDisconnected()
  const ready = drawn != null && limit != null
  const over = ready && drawn > limit
  const remaining = ready ? limit - drawn : 0

  return (
    <div className="stat-widget card loc-card">
      <span className="stat-widget-title subheadline">{brandTitle("Line of Credit")}</span>
      {loading ? (
        <div className="stat-widget-skeleton" />
      ) : disconnected ? (
        <span className="stat-widget-disconnected body-text text-secondary">
          <DatabaseZap size={14} />
          Offline
        </span>
      ) : !ready ? (
        <span className="body-text text-secondary">—</span>
      ) : (
        <>
          <span className="stat-widget-value title1 emphasized loc-fraction">
            {formatMoneyFull(drawn)}
            <span className="loc-fraction-denom"> / {formatMoneyFull(limit)}</span>
          </span>
          {over ? (
            <span className="loc-pill loc-pill--over">
              Overdrawn by {formatMoneyFull(drawn - limit)}
            </span>
          ) : (
            <span className="loc-pill loc-pill--ok">
              {formatMoneyFull(remaining)} available to draw
            </span>
          )}
        </>
      )}
    </div>
  )
}

export function BankingWidget() {
  const { data, isLoading } = useWidgetData<{
    agingSummary: AgingSummaryRow[] | null
    loc: LocPayload | null
  }>(["agingSummary", "loc"])

  const cash = rowAmount(data?.agingSummary, "CASH")
  const limit = typeof data?.loc?.loc === "number" ? data.loc.loc : null
  const drawn = rowAmount(data?.agingSummary, "CreditSpent")

  return (
    <div className="banking-pair">
      <StatWidget title={brandTitle("Cash in Bank")} value={cash} loading={isLoading} />
      <LineOfCreditCard drawn={drawn} limit={limit} loading={isLoading} />
    </div>
  )
}
