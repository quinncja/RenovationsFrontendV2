import { YearSelector } from "../../../shared/components/YearSelector/YearSelector"
import { DailyReportButton } from "../report/DailyReportButton"
import { OverUnderToggle } from "./OverUnderToggle"
import { EditModeToggle } from "./EditModeToggle"

type Props = {
  year: number
  onYearChange: (y: number) => void
  gearHint: boolean
  onGearActivate: () => void
}

/**
 * The dashboard header's action cluster (clock · Incl. WIP · year · gear).
 *
 * The first-run coachmark no longer mocks this header — DailyReportButton lifts
 * the real clock above the blur itself (see DailyReportCoach) — so this is just
 * the live cluster.
 */
export function DashboardHeaderActions(props: Props) {
  return (
    <>
      <DailyReportButton />
      <OverUnderToggle />
      <YearSelector value={props.year} onChange={props.onYearChange} />
      <EditModeToggle highlight={props.gearHint} onActivate={props.onGearActivate} />
    </>
  )
}
