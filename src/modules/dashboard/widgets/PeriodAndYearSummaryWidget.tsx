import { Widget } from "../../../shared/components/Widget/Widget"
import { CurrentPeriodSummaryWidget } from "./CurrentPeriodSummaryWidget"
import { YearSummaryWidget } from "./YearSummaryWidget"
import { OpenPositionWidget } from "./OpenPositionWidget"
import { SummaryYearProvider, useSummaryYear } from "./summaryYearContext"

// One dashboard slot, two cards. The Period Summary / Year Summary pair
// shares the P&L waterfall (Income → COGS → Gross Profit / Margin →
// Overhead → Net) inside one card taking three quarters of the row; the
// Open Position card (total AR / AP right now) is its own card in the last
// quarter. Registering them as one slot means the layout can't split or
// resize them independently.
//
// The SummaryYearProvider gives both columns a shared "effective year" so
// the Year column's selector also drives the Period column. Either column
// falls back to the page year when rendered outside this provider.
//
// The employee-scoped pair (EmployeeDetailPage / GM home) still uses the
// fused `.summary-snapshot-pair` stat-tile look.
export function PeriodAndYearSummaryWidget() {
  // The page normally hosts the provider (so the Margin chart can drive
  // these columns); fall back to a local one when this card is rendered on
  // its own.
  const hosted = useSummaryYear() != null
  const slot = (
    <div className="pys-slot">
      <Widget className="current-period-widget pys-widget">
        <div className="pys-grid">
          <CurrentPeriodSummaryWidget />
          <YearSummaryWidget />
        </div>
      </Widget>
      <OpenPositionWidget />
    </div>
  )

  return hosted ? slot : <SummaryYearProvider>{slot}</SummaryYearProvider>
}
