import { useMemo } from "react"
import { useWidgetData } from "../../../../shared/context/PageContext"
import { buildAgingForecast, type AgingOpenRow } from "../../utils/agingForecast"

// Receivables read as money in (green), payables as money out (red) — the same
// in/out semantics used across the aging views.
export const AR_COLOR = "#22c55e"
export const AP_COLOR = "#ef4444"

// Round a magnitude up to the next "nice" 1/2/5 ×10ⁿ step so the symmetric
// y-axis bounds (and the ticks d3 derives from them) read as clean numbers.
export function niceCeil(v: number): number {
  if (!isFinite(v) || v <= 0) return 0
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * pow
}

export function invoiceLabel(count: number): string {
  return `${count} ${count === 1 ? "invoice" : "invoices"}`
}

/**
 * Shared aging-forecast data source for the Overdue and Upcoming Billings
 * widgets (split from the former UpcomingBillingsWidget). Both read the same
 * `agingSummaryOpen` query from the shared page store and derive the forecast,
 * so calling this from both widgets costs no extra fetch.
 */
export function useAgingForecast() {
  const { data, isLoading } = useWidgetData<{ agingSummaryOpen: AgingOpenRow[] | null }>([
    "agingSummaryOpen",
  ])

  const forecast = useMemo(
    () => buildAgingForecast(data?.agingSummaryOpen, new Date()),
    [data?.agingSummaryOpen]
  )

  return { forecast, isLoading }
}
