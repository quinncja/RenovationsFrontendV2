// Where the Job Costing board's "when" pair (year + phase) starts. The pair
// re-derives from the default-range preference (useJobcostDefaultRange) on
// every real visit to the board; it only survives a round trip through a
// job/property detail page's back button (Jobcost.tsx checks
// `location.state.preserveJobcostWhen`, set by that back button, before
// deciding whether to honor the sessionStorage pick or reset it). For the
// open-phase preference the open accounting period comes from the previous
// fetch's cached getOpenPeriod result — the board refreshes the cache on
// every list fetch — and a cold cache falls back to the calendar, which the
// board corrects once the real period lands (unless the user has already
// touched the controls).

import {
  JOBCOST_DEFAULT_RANGE_FALLBACK,
  JOBCOST_DEFAULT_RANGE_KEY,
  type JobcostDefaultRange,
} from "../../shared/hooks/useJobcostDefaultRange"
import { readSessionStored } from "../../shared/hooks/useSessionStorage"

export interface OpenPeriod {
  postyr: number
  actprd: number
}

export interface JobcostRange {
  /** null = All Time */
  year: number | null
  /** "all" = All Phases; 1–12 otherwise (Sage phases are period months) */
  phase: "all" | number
}

// Session keys for the pair itself (useSessionStorage in Jobcost.tsx). An
// absent key means the control is untouched this session and still rides the
// preference-derived default.
export const JOBCOST_YEAR_SESSION_KEY = "jobcostSessionYear"
export const JOBCOST_PHASE_SESSION_KEY = "jobcostSessionPhase"

const OPEN_PERIOD_CACHE_KEY = "jobcostOpenPeriod"

export function readJobcostDefaultRange(): JobcostDefaultRange {
  try {
    const raw = localStorage.getItem(JOBCOST_DEFAULT_RANGE_KEY)
    if (raw === null) return JOBCOST_DEFAULT_RANGE_FALLBACK
    const parsed = JSON.parse(raw) as unknown
    return parsed === "open-phase" || parsed === "current-month" || parsed === "all-phases"
      ? parsed
      : JOBCOST_DEFAULT_RANGE_FALLBACK
  } catch {
    return JOBCOST_DEFAULT_RANGE_FALLBACK
  }
}

function normalizeOpenPeriod(raw: unknown): OpenPeriod | null {
  if (raw == null || typeof raw !== "object") return null
  const { postyr, actprd } = raw as { postyr?: unknown; actprd?: unknown }
  if (typeof postyr !== "number" || typeof actprd !== "number") return null
  if (!Number.isInteger(actprd) || actprd < 1 || actprd > 12 || postyr < 2000) return null
  return { postyr, actprd }
}

export function readCachedOpenPeriod(): OpenPeriod | null {
  try {
    const raw = localStorage.getItem(OPEN_PERIOD_CACHE_KEY)
    if (raw === null) return null
    return normalizeOpenPeriod(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Validate + cache a getOpenPeriod result. Returns the normalized period, or
 *  null when the backend didn't serve the query (stale deploy) or it errored. */
export function cacheOpenPeriod(raw: unknown): OpenPeriod | null {
  const period = normalizeOpenPeriod(raw)
  if (period) {
    try {
      localStorage.setItem(OPEN_PERIOD_CACHE_KEY, JSON.stringify(period))
    } catch {
      // Best-effort — the calendar fallback still covers the next session.
    }
  }
  return period
}

/** The pair's preference-derived default for a fresh session. The year always
 *  starts on the CURRENT calendar year; the one exception is open-phase when
 *  the open period sits in the previous year (early January before the
 *  December close). Never All Time — that stays a deliberate pick. */
export function resolveDefaultRange(): JobcostRange {
  const setting = readJobcostDefaultRange()
  const now = new Date()
  if (setting === "all-phases") return { year: now.getFullYear(), phase: "all" }
  if (setting === "current-month") return { year: now.getFullYear(), phase: now.getMonth() + 1 }
  const open = readCachedOpenPeriod()
  return open
    ? { year: open.postyr, phase: open.actprd }
    : { year: now.getFullYear(), phase: now.getMonth() + 1 }
}

/** What the board WILL use on mount: this session's picks where present, else
 *  the preference default. The daily-arrival preload must predict the board's
 *  fetch params exactly or its cache key won't match (see pageDataCache). */
export function getJobcostRangeInit(): JobcostRange {
  const fallback = resolveDefaultRange()
  return {
    year: readSessionStored(JOBCOST_YEAR_SESSION_KEY, fallback.year),
    phase: readSessionStored(JOBCOST_PHASE_SESSION_KEY, fallback.phase),
  }
}
