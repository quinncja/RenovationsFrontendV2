import { createContext, useContext } from "react"

// This module exports NO React components on purpose. The context object's
// identity must survive Fast Refresh — co-locating it with the provider
// component made HMR re-execute this file and mint a fresh context, stranding
// already-mounted consumers on the old one ("must be used within
// DailyReportProvider"). Keep context + hook here; the provider lives in
// DailyReportProvider.tsx.

/** First-run coachmark sequence, shown once the intro arrival lands on the
 *  dashboard home: 0 = idle, 1 = the header clock spotlight, 2 = the Reports
 *  nav-item hint. Each step's dismissal advances to the next (see advanceIntro). */
export type IntroStep = 0 | 1 | 2

export interface DailyReportContextValue {
  /** Open the report on demand (the header clock button). */
  open: () => void
  /** Which intro coachmark is currently showing (0 when none). */
  introStep: IntroStep
  /** Close the current coachmark: step 1 → step 2, step 2 → done. */
  advanceIntro: () => void
}

export const DailyReportContext = createContext<DailyReportContextValue | null>(null)

export function useDailyReport(): DailyReportContextValue {
  const ctx = useContext(DailyReportContext)
  if (!ctx) throw new Error("useDailyReport must be used within DailyReportProvider")
  return ctx
}
