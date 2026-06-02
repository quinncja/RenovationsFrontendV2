/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from "react"
import { usePageYear } from "../../../shared/context/PageContext"

// Shared "effective year" for the merged Period & Year Summary card. The
// Year half lets the user pick a year independent of the page-level
// YearSelector; the Period half needs to follow that pick so both halves
// of the fused card stay in lockstep. Lives in its own file (not in the
// wrapper component) so the inner widgets can import the hook without
// creating a circular dependency.

interface SummaryYearContextValue {
  year: number
  setYear: (year: number) => void
}

const SummaryYearContext = createContext<SummaryYearContextValue | null>(null)

/** Returns the shared effective year, or null if the widget is rendered
 *  outside the merged-card provider (e.g. CurrentPeriodSummaryWidget used
 *  standalone on BusinessSummaryPage). Consumers fall back to pageYear. */
export function useSummaryYear(): SummaryYearContextValue | null {
  return useContext(SummaryYearContext)
}

export function SummaryYearProvider({ children }: { children: ReactNode }) {
  const pageYear = usePageYear()
  const [year, setYear] = useState(pageYear)

  // Page-level YearSelector wins: snap `year` back to it when it changes.
  // "Adjusting state during render" pattern — preferred over a syncing
  // useEffect because it avoids the extra commit + cascading render.
  const [lastPageYear, setLastPageYear] = useState(pageYear)
  if (lastPageYear !== pageYear) {
    setLastPageYear(pageYear)
    setYear(pageYear)
  }

  return (
    <SummaryYearContext.Provider value={{ year, setYear }}>
      {children}
    </SummaryYearContext.Provider>
  )
}
