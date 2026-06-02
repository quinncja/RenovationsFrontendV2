import { OverdueWidget } from "./OverdueWidget"
import { UpcomingBillingsWidget } from "./UpcomingBillingsWidget"

/**
 * Business Financials "billings" unit: the Overdue AR/AP positions (1/3) beside
 * the Upcoming Billings forecast chart (2/3). They render as two cards but count
 * as a single widget in the layout + editor.
 */
export function BillingsWidget() {
  return (
    <div className="billings-pair">
      <OverdueWidget />
      <UpcomingBillingsWidget />
    </div>
  )
}
