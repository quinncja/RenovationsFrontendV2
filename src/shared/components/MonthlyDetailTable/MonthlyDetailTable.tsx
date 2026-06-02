import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react"
import { fullMonth, formatMoneyFull, formatDate } from "../../utils/format"

// Generic month-grouped GL line-item table — built for the dashboard
// breakdown pages (Gross Revenue / Total Direct Expense / Overhead
// Expense). Outer table is one row per month with the metric total. Each
// row expands to a horizontally-scrolling inner table of every contributing
// `lgrtrn` / `lgtnln` row. `filterMonth` collapses the outer table to one
// month and auto-expands it (used by the chart's click-to-filter UX).

type LineItem = Record<string, unknown>

interface MonthlyDetailTableProps {
  monthlyTotals: { month: number; value: number }[]
  lineItems: LineItem[] | null
  isLoading: boolean
  totalLabel?: string
  /** When set, render only this month, auto-expanded. Hides the rest. */
  filterMonth?: number | null
}

export const NUMERIC_KEYS = new Set(["dbtamt", "crdamt", "net", "amount"])

const DATE_KEY_HINTS = ["dte", "date"]

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/

const HIDDEN_COLUMNS = new Set([
  "_idnum",
  "srcnum",
  "payee1",
  "payee2",
  "addrs1",
  "addrs2",
  "ctynme",
  "state_",
  "usrdf1",
  "usrdf2",
  "arcrec",
  "ntetxt",
  "zipcde",
  "chkamt",
  "active",
  "jobvar",
  "eqpvar",
  "wipvar",
  "ccrclr",
  "ccract",
  "vodrec",
  "amt199",
  "bnkcat",
  "paybch",
  "trnhsh",
  "trnlnk",
  "empnum",
  "crdhsh",
  "pospyi",
  "pospyv",
  "apinte",
  "_idref",
  "insdte",
  "insusr",
  "accountcode",
  "recnum",
  "subact",
  "pchord",
])

/** Display order for known columns. Unknown columns are appended after these. */
const COLUMN_ORDER = [
  "trnnum",
  "trndte",
  "lgrrec",
  "dscrpt",
  "status",
  "lgract",
  "dbtamt",
  "crdamt",
  "net",
  "actprd",
  "postyr",
  "entdte",
  "usrnme",
  "upddte",
  "updte",
  "updusr",
]

const COLUMN_LABELS: Record<string, string> = {
  recnum: "Recnum",
  trnnum: "Trans. #",
  trndte: "Trans. Date",
  pchord: "PO #",
  dscrpt: "Description",
  status: "Status",
  actprd: "Period",
  entdte: "Entered Date",
  vndnum: "Vendor #",
  usrnme: "User",
  lgrrec: "Ledger #",
  postyr: "Year",
  updte: "Updated Date",
  upddte: "Updated Date",
  updusr: "Updated User",
  linnum: "Line #",
  lgract: "Ledger Acc",
  subact: "Sub Acc",
  dbtamt: "Debit Amount",
  crdamt: "Credit Amount",
  net: "Net",
}

export const USERNAME_KEYS = new Set(["usrnme", "updusr"])

export function isHiddenColumn(key: string): boolean {
  return HIDDEN_COLUMNS.has(key.toLowerCase())
}

export function isDateKey(key: string): boolean {
  const k = key.toLowerCase()
  return DATE_KEY_HINTS.some((h) => k.endsWith(h)) || k === "insdte" || k === "postdte"
}

export function labelFor(key: string): string {
  const k = key.toLowerCase()
  return COLUMN_LABELS[k] ?? key
}

/** Stable column order for the breakdown UI and exports. */
export function orderColumns(keys: string[]): string[] {
  const orderIndex = (k: string) => {
    const idx = COLUMN_ORDER.indexOf(k.toLowerCase())
    return idx === -1 ? COLUMN_ORDER.length : idx
  }
  return [...keys].sort((a, b) => {
    const ai = orderIndex(a)
    const bi = orderIndex(b)
    if (ai !== bi) return ai - bi
    return a.localeCompare(b)
  })
}

export function transformUsername(raw: unknown): string {
  if (typeof raw !== "string") return ""
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const afterSlash = trimmed.includes("\\") ? trimmed.split("\\").pop() ?? trimmed : trimmed
  const beforeDot = afterSlash.includes(".") ? afterSlash.split(".")[0] : afterSlash
  return beforeDot
}

/** mssql returns duplicate-named columns (e.g. lgrtrn.recnum + lgtnln.recnum) as
 *  arrays. Collapse to a single value when all entries are identical, otherwise
 *  join them so nothing is silently lost. */
export function collapseValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  if (value.length === 0) return null
  const first = value[0]
  const allEqual = value.every((v) => v === first || (v == null && first == null))
  if (allEqual) return first
  return value.map((v) => (v == null ? "" : String(v))).join(" / ")
}

export function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value)
}

function formatCell(key: string, value: unknown): string {
  const v = collapseValue(value)
  if (v === null || v === undefined) return "—"
  if (USERNAME_KEYS.has(key.toLowerCase())) {
    const u = transformUsername(v)
    return u || "—"
  }
  if (NUMERIC_KEYS.has(key.toLowerCase()) && typeof v === "number") return formatMoneyFull(v)
  // Detect by key OR by ISO-date value pattern so timestamped fields like
  // UPDDTE = "2026-02-08T19:56:57.660Z" still get formatted.
  if (
    (isDateKey(key) || isIsoDateString(v)) &&
    (typeof v === "string" || typeof v === "number" || v instanceof Date)
  ) {
    return formatDate(v)
  }
  if (typeof v === "string") return v.trim() || "—"
  if (typeof v === "number") return String(v)
  if (v instanceof Date) return formatDate(v)
  return String(v)
}

/** Returns a comparable value for sorting — usernames are normalized, dates
 *  parsed where possible, others fall through to numeric/string compare. */
function sortValue(key: string, value: unknown): number | string {
  const v = collapseValue(value)
  if (v === null || v === undefined) return ""
  if (USERNAME_KEYS.has(key.toLowerCase())) return transformUsername(v).toLowerCase()
  if (typeof v === "number") return v
  if (isDateKey(key) || isIsoDateString(v)) {
    if (typeof v === "number") return v
    if (typeof v === "string") {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (m) return Number(m[1] + m[2] + m[3])
      const t = Date.parse(v)
      if (!Number.isNaN(t)) return t
    }
    if (v instanceof Date) return v.getTime()
  }
  if (typeof v === "string") return v.toLowerCase()
  return String(v).toLowerCase()
}

type SortDir = "asc" | "desc"

export function MonthlyDetailTable({
  monthlyTotals,
  lineItems,
  isLoading,
  totalLabel = "Total",
  filterMonth = null,
}: MonthlyDetailTableProps) {
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set())
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Reset sort when the filter changes (different month context).
  useEffect(() => {
    setSortKey(null)
    setSortDir("asc")
  }, [filterMonth])

  const itemsByMonth = useMemo(() => {
    const map = new Map<number, LineItem[]>()
    if (!lineItems) return map
    for (const row of lineItems) {
      const m = Number(row.month)
      if (!Number.isFinite(m)) continue
      const arr = map.get(m) ?? []
      arr.push(row)
      map.set(m, arr)
    }
    return map
  }, [lineItems])

  const columns = useMemo(() => {
    if (!lineItems || lineItems.length === 0) return []
    const seen = new Set<string>()
    for (const row of lineItems) {
      for (const key of Object.keys(row)) seen.add(key)
    }
    seen.delete("month")
    const visible = Array.from(seen).filter((k) => !isHiddenColumn(k))
    const orderIndex = (k: string) => {
      const idx = COLUMN_ORDER.indexOf(k.toLowerCase())
      return idx === -1 ? COLUMN_ORDER.length : idx
    }
    return visible.sort((a, b) => {
      const ai = orderIndex(a)
      const bi = orderIndex(b)
      if (ai !== bi) return ai - bi
      return a.localeCompare(b)
    })
  }, [lineItems])

  const sortedMonths = useMemo(() => {
    const all = [...monthlyTotals].sort((a, b) => a.month - b.month)
    if (filterMonth != null) return all.filter((r) => r.month === filterMonth)
    return all
  }, [monthlyTotals, filterMonth])

  function toggleMonth(month: number) {
    if (filterMonth != null) return
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  function handleSort(key: string) {
    // Three-state cycle on the same key: asc → desc → unsorted → asc …
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc")
      } else {
        setSortKey(null)
        setSortDir("asc")
      }
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  function sortItems(items: LineItem[]): LineItem[] {
    if (!sortKey) return items
    const key = sortKey
    const dir = sortDir === "asc" ? 1 : -1
    return [...items].sort((a, b) => {
      const av = sortValue(key, a[key])
      const bv = sortValue(key, b[key])
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }

  if (sortedMonths.length === 0) {
    return <div className="mdt-empty">No data for the selected period.</div>
  }

  return (
    <table className="jc-cost-table mdt-table">
      <thead>
        <tr>
          <th className="jc-cost-th mdt-month-col">Month</th>
          <th className="jc-cost-th mdt-total-col">{totalLabel}</th>
        </tr>
      </thead>
      <tbody>
        {sortedMonths.flatMap((row) => {
          const isExpanded = filterMonth != null ? true : expandedMonths.has(row.month)
          const monthItems = sortItems(itemsByMonth.get(row.month) ?? [])
          return [
            <tr
              key={`m-${row.month}`}
              className={`jc-group-row${isExpanded ? " expanded" : ""}`}
              onClick={() => toggleMonth(row.month)}
              role={filterMonth != null ? undefined : "button"}
              tabIndex={filterMonth != null ? undefined : 0}
              onKeyDown={(e) => e.key === "Enter" && toggleMonth(row.month)}
            >
              <td className="mdt-month-col">
                {filterMonth == null && (
                  <span className="jc-group-chevron">
                    {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                )}
                {fullMonth(row.month)}
              </td>
              <td className="mdt-total-col">{formatMoneyFull(row.value)}</td>
            </tr>,
            ...(isExpanded
              ? [
                  <tr key={`m-${row.month}-items`} className="jc-txn-container-row mdt-items-row">
                    <td colSpan={2} className="mdt-items-cell">
                      {lineItems === null && isLoading ? (
                        <div className="mdt-loading">Loading line items…</div>
                      ) : columns.length === 0 ? (
                        <div className="mdt-loading">No line items.</div>
                      ) : monthItems.length === 0 ? (
                        <div className="mdt-loading">No line items for this month.</div>
                      ) : (
                        <div className="mdt-scroll">
                          <table className="jc-txn-table mdt-line-table">
                            <thead>
                              <tr>
                                {columns.map((col) => {
                                  const active = sortKey === col
                                  const Icon = active
                                    ? sortDir === "asc"
                                      ? ChevronUp
                                      : ChevronDown
                                    : ChevronsUpDown
                                  return (
                                    <th key={col} className="jc-txn-th">
                                      <button
                                        type="button"
                                        className={`mdt-sort-btn${active ? " active" : ""}`}
                                        onClick={() => handleSort(col)}
                                      >
                                        {labelFor(col)}
                                        <Icon size={11} />
                                      </button>
                                    </th>
                                  )
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {monthItems.map((item, i) => (
                                <tr key={i} className="jc-txn-row">
                                  {columns.map((col) => (
                                    <td key={col}>{formatCell(col, item[col])}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>,
                ]
              : []),
          ]
        })}
      </tbody>
    </table>
  )
}
