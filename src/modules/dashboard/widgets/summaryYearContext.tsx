/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from "react"
import { usePageYear } from "../../../shared/context/PageContext"

// Shared "effective year" AND period for the Period & Year Summary card.
// The Year half lets the user pick a year independent of the page-level
// YearSelector, and the Period half needs to follow that pick so both halves
// stay in lockstep. The Margin chart writes to the same state: clicking a
// month bar drives the Period column, clicking a year bar drives the Year
// column — which is why the provider sits at the page level rather than
// inside the summary card. Lives in its own file (not in the wrapper
// component) so the inner widgets can import the hook without a circular
// dependency.

interface SummaryYearContextValue {
  year: number
  setYear: (year: number) => void
  /** The pinned month (1-12), or null to follow the actually-open month. */
  period: number | null
  /** Pins a month for the current effective year; null resets to open. */
  setPeriod: (period: number | null) => void
  /** Jump both at once — the Margin chart's monthly bars, which plot the
   *  PAGE year, so the summary has to move to that year to match. */
  selectMonth: (year: number, period: number) => void
}

const SummaryYearContext = createContext<SummaryYearContextValue | null>(null)

/** Returns the shared year/period, or null if the widget is rendered outside
 *  the provider. Consumers fall back to their own local state. */
export function useSummaryYear(): SummaryYearContextValue | null {
  return useContext(SummaryYearContext)
}

export function SummaryYearProvider({ children }: { children: ReactNode }) {
  const pageYear = usePageYear()
  const [year, setYear] = useState(pageYear)
  // Per-year pins: switching years restores whatever (if anything) the user
  // picked for that year rather than leaking one year's month into another.
  const [periodByYear, setPeriodByYear] = useState<Record<number, number | null>>({})

  // Page-level YearSelector wins: snap `year` back to it when it changes.
  // "Adjusting state during render" pattern — preferred over a syncing
  // useEffect because it avoids the extra commit + cascading render.
  const [lastPageYear, setLastPageYear] = useState(pageYear)
  if (lastPageYear !== pageYear) {
    setLastPageYear(pageYear)
    setYear(pageYear)
  }

  const value: SummaryYearContextValue = {
    year,
    setYear,
    period: periodByYear[year] ?? null,
    setPeriod: (period) => setPeriodByYear((prev) => ({ ...prev, [year]: period })),
    selectMonth: (y, period) => {
      setYear(y)
      setPeriodByYear((prev) => ({ ...prev, [y]: period }))
    },
  }

  return <SummaryYearContext.Provider value={value}>{children}</SummaryYearContext.Provider>
}
