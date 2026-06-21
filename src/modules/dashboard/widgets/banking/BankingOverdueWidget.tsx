import { BankingWidget } from "./BankingWidget"
import { OverdueWidget } from "../billings/OverdueWidget"
import useIsMobile from "../../../../shared/hooks/useIsMobile"
import type { DashboardWidgetProps } from "../../config/widgetRegistry"

/**
 * Business Financials "banking" unit: ADVIA Cash + Line of Credit (its own
 * container) beside the Overdue AR/AP positions. They render as two distinct
 * cards but count as a single widget in the layout editor. The Upcoming
 * Billings forecast is now its own separate widget.
 *
 * The two cards always sit side by side. At full width (colSpan 2) each card has
 * room to lay its two stats out in a row (Cash · LOC, AR · AP); at half width
 * the cell is narrower, so each card stacks its stats vertically (the default).
 * On mobile the cell is too narrow for the row layout, so it always stacks.
 */
export function BankingOverdueWidget({ colSpan }: DashboardWidgetProps) {
  const isMobile = useIsMobile()
  const wide = colSpan === 2 && !isMobile
  return (
    <div className={`cash-overdue-pair${wide ? " cash-overdue-pair--wide" : ""}`}>
      <BankingWidget />
      <OverdueWidget />
    </div>
  )
}
