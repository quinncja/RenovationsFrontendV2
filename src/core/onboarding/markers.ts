// All onboarding localStorage access lives here — uid-scoped, and every read/
// write wrapped in try/catch because storage can throw (privacy mode / quota),
// in which case onboarding must degrade silently, never crash a render.

import { chicagoToday } from "../../modules/dashboard/report/chicagoDate"

const onboardedAtKey = (uid: string) => `onboarded-at:${uid}`
const milestonesKey = (uid: string) => `onboarding-milestones:${uid}`

// Legacy per-user flag from before milestones were a JSON map: an established
// prod user has `daily-report-intro-seen:{uid}` = "1". It folds into the map as
// the `intro-tour` milestone (see readMilestones). Never deleted — an old cached
// bundle may still read it.
const legacyIntroSeenKey = (uid: string) => `daily-report-intro-seen:${uid}`

/** The milestone key the legacy intro-seen flag maps to. */
export const INTRO_TOUR = "intro-tour"

// The legacy flag records "seen" without a date; fold it in as long-ago so the
// value is a valid ISO date and clearly predates any real acknowledgment.
const LEGACY_SEEN_DATE = new Date(0).toISOString()

// ─── onboardedAt ──────────────────────────────────────────────────────────────

export function readOnboardedAt(uid: string): string | null {
  try {
    return localStorage.getItem(onboardedAtKey(uid))
  } catch {
    return null
  }
}

/** Stamp the day onboarding completed (Chicago date) and return it. The daily
 *  report first auto-opens the day AFTER this — a brand-new user shouldn't be
 *  greeted with "here's what happened yesterday" mid-setup. */
export function stampOnboardedAt(uid: string): string {
  const today = chicagoToday()
  try {
    localStorage.setItem(onboardedAtKey(uid), today)
  } catch {
    // localStorage unavailable — the user just sees the report a day early
  }
  return today
}

/** Persist a value resolved from the server (local was empty) so the next cold
 *  render paints it synchronously. */
export function writeOnboardedAt(uid: string, date: string) {
  try {
    localStorage.setItem(onboardedAtKey(uid), date)
  } catch {
    // non-critical — re-primed from the server again next load
  }
}

// ─── milestones ─────────────────────────────────────────────────────────────

function readRawMilestones(uid: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(milestonesKey(uid))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function readLegacyIntroSeen(uid: string): boolean {
  try {
    return localStorage.getItem(legacyIntroSeenKey(uid)) === "1"
  } catch {
    return false
  }
}

/** The milestone map, with the legacy intro-seen flag folded in (in-memory) when
 *  the map doesn't already carry `intro-tour`. The fold only persists on the next
 *  write (writeMilestones / writeMilestone), never as a side effect of reading. */
export function readMilestones(uid: string): Record<string, string> {
  const map = readRawMilestones(uid)
  if (map[INTRO_TOUR] == null && readLegacyIntroSeen(uid)) {
    map[INTRO_TOUR] = LEGACY_SEEN_DATE
  }
  return map
}

/** Persist the full milestone map (used after the server union-merge). */
export function writeMilestones(uid: string, map: Record<string, string>) {
  try {
    localStorage.setItem(milestonesKey(uid), JSON.stringify(map))
  } catch {
    // non-critical — the server union re-primes it next load
  }
}

/** Acknowledge one milestone (first ack wins locally too) and return the updated
 *  map. Folds any legacy flag in on the way, since it reads through readMilestones. */
export function writeMilestone(uid: string, key: string, isoDate: string): Record<string, string> {
  const map = readMilestones(uid)
  const next = { ...map, [key]: map[key] ?? isoDate }
  writeMilestones(uid, next)
  return next
}

// ─── layout cache (read-only) ─────────────────────────────────────────────────
// The `dashboard-layout:{uid}` key is owned + written by DashboardLayoutContext;
// onboarding only reads its presence as the admin setup-gate signal.

export function hasLayoutCache(uid: string): boolean {
  try {
    return localStorage.getItem(`dashboard-layout:${uid}`) != null
  } catch {
    return false
  }
}
