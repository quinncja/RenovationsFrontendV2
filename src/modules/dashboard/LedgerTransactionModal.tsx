import { useEffect, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { fetchPageData } from "../../shared/api/pageApi"
import { DetailModal, DetailModalContent, type DetailStat, type DetailLine } from "../../shared/components/DetailModal/DetailModal"
import { InvoiceDetailModal } from "../../shared/components/InvoiceDetailModal/InvoiceDetailModal"
import { collapseValue } from "../../shared/components/MonthlyDetailTable/MonthlyDetailTable"
import { formatMoneyFull, formatDate, fullMonth } from "../../shared/utils/format"

export interface LedgerRef {
  /** lgrtrn.recnum */
  recnum: string
  /** The clicked overhead line's net, shown as the headline figure. */
  amount: number
}

type Row = Record<string, unknown>
interface LedgerDetail {
  header: Row | null
  lines: Row[]
}

const str = (v: unknown) => {
  const c = collapseValue(v)
  return c == null ? "" : String(c).trim()
}
const num = (v: unknown) => Number(collapseValue(v) ?? 0)

/**
 * One general-ledger transaction behind an overhead cost line: what it was,
 * who it was to, when it posted, and every account it touched. When an AP
 * invoice posted the entry, "Open AP invoice" stacks the full invoice modal
 * on top.
 */
export function LedgerTransactionModal({ ledger, onClose }: { ledger: LedgerRef | null; onClose: () => void }) {
  const [detail, setDetail] = useState<LedgerDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)

  useEffect(() => {
    if (!ledger) {
      setDetail(null)
      setError(null)
      setInvoiceId(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPageData({ module: "dashboard", queries: ["ledgerTransactionDetail"], params: { ledgerRecnum: ledger.recnum } })
      .then((res) => {
        if (cancelled) return
        const d = res.ledgerTransactionDetail as LedgerDetail | null
        if (!d?.header) setError("Couldn't find this transaction.")
        else setDetail(d)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError("Failed to load this transaction.")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ledger])

  const h = detail?.header
  const trnnum = h ? str(h.trnnum) : ""
  const desc = h ? str(h.dscrpt) : ""
  const vendor = h ? str(h.vendorName) : ""
  const period = h ? num(h.actprd) % 100 : 0
  const postyr = h ? num(h.postyr) : 0
  const apRecnum = h ? str(h.apInvoiceRecnum) : ""
  const apNum = h ? str(h.apInvoiceNum) : ""

  const stats: DetailStat[] = h
    ? [
        ...(str(h.trndte) ? [{ label: "Date", value: formatDate(collapseValue(h.trndte)) }] : []),
        ...(period >= 1 && period <= 12 ? [{ label: "Period", value: `${fullMonth(period)} ${postyr}` }] : []),
        ...(str(h.entdte) ? [{ label: "Entered", value: formatDate(collapseValue(h.entdte)) }] : []),
        ...(str(h.chknum) ? [{ label: "Check #", value: str(h.chknum) }] : []),
      ]
    : []

  const lines: DetailLine[] =
    detail?.lines.map((l) => {
      const account = str(l.accountName) || `Account ${str(l.accountNum)}`
      const lineDesc = str(l.dscrpt)
      const job = str(l.jobnum)
      const meta = [lineDesc, job && job !== "0" ? `Job ${job}` : ""].filter(Boolean).join(" · ")
      return {
        primary: `${account} (${str(l.accountNum)})`,
        meta: meta || null,
        amount: num(l.debit) - num(l.credit),
      }
    }) ?? []

  return (
    <>
      <DetailModal open={!!ledger} onClose={onClose}>
        {loading && <div className="widget-skeleton" style={{ height: "9rem" }} />}
        {!loading && error && <p className="body-text text-secondary">{error}</p>}
        {!loading && !error && h && ledger && (
          <>
            <DetailModalContent
              eyebrow="Ledger transaction"
              title={desc || (trnnum ? `Transaction ${trnnum}` : "Ledger transaction")}
              caption={desc && trnnum ? `#${trnnum}` : null}
              party={vendor || null}
              figure={formatMoneyFull(ledger.amount)}
              stats={stats}
              ledger={
                lines.length
                  ? { heading: "Posted to", lines, emptyText: "No lines." }
                  : null
              }
            />
            {apRecnum && (
              <div className="ledger-modal-actions">
                <button type="button" className="button ledger-modal-link" onClick={() => setInvoiceId(apRecnum)}>
                  Open AP invoice{apNum ? ` #${apNum}` : ""}
                  <ArrowUpRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </DetailModal>
      <InvoiceDetailModal invoiceId={invoiceId} module="suppliers" onClose={() => setInvoiceId(null)} />
    </>
  )
}
