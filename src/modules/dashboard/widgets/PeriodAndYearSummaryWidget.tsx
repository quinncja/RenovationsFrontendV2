import { CurrentPeriodSummaryWidget } from "./CurrentPeriodSummaryWidget"
import { YearSummaryWidget } from "./YearSummaryWidget"
import { SummaryYearProvider } from "./summaryYearContext"

// Layout wrapper: Period Summary and Year Summary share a data shape
// (Margin / Income / COGS / Gross Profit) and are visually bridged into a
// single snapshot unit. Exposing them as a single registry entry means the
// dashboard layout treats the pair as one slot — they can't be reordered
// apart, resized independently, or lose their visual bridge.
//
// `.summary-snapshot-pair` is the generic seam class shared with the
// EmployeeDetailPage's employee-scoped summary pair, so both contexts get
// the fused two-card look from one CSS rule.
//
// The SummaryYearProvider gives both halves a shared "effective year" so
// the Year half's per-widget year selector also drives the Period half.
// Without it the two halves would diverge: the Year half would refetch for
// the picked year while the Period half kept reading the page year. Either
// inner widget falls back to the page year when rendered outside this
// provider (e.g. CurrentPeriodSummaryWidget standalone on BusinessSummary).
export function PeriodAndYearSummaryWidget() {
  return (
    <SummaryYearProvider>
      <div className="summary-snapshot-pair">
        <CurrentPeriodSummaryWidget />
        <YearSummaryWidget />
      </div>
    </SummaryYearProvider>
  )
}
