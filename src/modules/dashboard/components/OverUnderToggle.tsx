import useIncludeOverUnder from "../../../shared/hooks/useIncludeOverUnder"
import { useWidgetData } from "../../../shared/context/PageContext"

interface OpenMonthPayload {
  openMonthYear?: number
}

// Single pill (active/inactive state — not a two-button toggle) that sits to
// the left of the dashboard's YearSelector. When active, all financial widgets
// fold the current open period's over/under (work completed, not yet billed)
// into their revenue-derived figures. Disabled when there's no open period to
// fold in (so it can't imply a change it won't make).
export function OverUnderToggle() {
  const [on, setOn] = useIncludeOverUnder()
  const { data, isLoading } = useWidgetData<{ openMonthFinances: OpenMonthPayload | null }>([
    "openMonthFinances",
  ])

  // Only meaningful when an open period actually exists. While loading, leave
  // it enabled (avoids a flicker); once resolved with no open period, disable.
  const hasOpenPeriod = data?.openMonthFinances?.openMonthYear != null
  const disabled = !isLoading && !hasOpenPeriod

  return (
    <button
      type="button"
      className={`over-under-toggle${on ? " over-under-toggle--active" : ""}`}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => setOn(!on)}
      title="Include current period over/under — work completed but not yet billed (WIP)"
    >
      Incl. WIP
    </button>
  )
}
