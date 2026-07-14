import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AnimatePresence } from "framer-motion"
import { useAuth } from "../../../core/auth/AuthProvider"
import { effectiveRole, isGeneralManager, ALL_JOBS_DETAIL_ID, type AppRole } from "../../../core/auth/roles"
import { useOnboarding } from "../../../core/onboarding/OnboardingProvider"
import { deriveBackLabel } from "../../jobcost/useJobcostNav"
import type { ReportPayload } from "./reportTypes"
import { chicagoToday } from "./chicagoDate"
import { fetchDailyReport, type ReportSource } from "./useReportData"
import { DailyReportModal } from "./DailyReportModal"
import { DailyReportCoach } from "./DailyReportCoach"
import { DailyArrival, type ArrivalDestination } from "./arrival/DailyArrival"
import { preloadEntryPages } from "./arrival/preload"

// ─── Per-user markers ────────────────────────────────────────────────────────
// This one recurring, daily-recap marker stays local (it's a per-day dedupe, not
// an onboarding flag) — onboarding markers (`onboarded-at`, the `intro-tour`
// milestone) now live in core/onboarding and are read via useOnboarding().
// Plain string (not JSON), read/written imperatively, not through useLocalStorage.

const seenKey = (uid: string) => `daily-report-seen:${uid}`

// The synchronous gate reads localStorage during render — a throwing storage
// (privacy mode) must degrade to "no greeting", never a render crash.
function readMarker(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** First-run coachmark sequence, shown once the intro arrival lands on the
 *  dashboard home: 0 = idle, 1 = the header clock spotlight, 2 = the Reports
 *  nav-item hint. Each step's dismissal advances to the next (see advanceIntro). */
export type IntroStep = 0 | 1 | 2

interface DailyReportContextValue {
  /** Open the report on demand (the header clock button). */
  open: () => void
  /** Which intro coachmark is currently showing (0 when none). */
  introStep: IntroStep
  /** Close the current coachmark: step 1 → step 2, step 2 → done. */
  advanceIntro: () => void
}

const DailyReportContext = createContext<DailyReportContextValue | null>(null)

export function useDailyReport(): DailyReportContextValue {
  const ctx = useContext(DailyReportContext)
  if (!ctx) throw new Error("useDailyReport must be used within DailyReportProvider")
  return ctx
}

/** Which report the user gets: admin tier + GM company-wide, managers job-scoped.
 *  A manager without an employeeId claim isn't scoped yet — no report. A general
 *  manager has no employeeId by design and sees every job, so gets the company-
 *  wide report like an admin. */
function reportSource(role: AppRole | undefined, employeeId: unknown): ReportSource | null {
  const eff = effectiveRole(role)
  if (eff === "executive" || eff === "admin" || role === "generalManager") return "admin"
  if (role === "manager" && employeeId != null) return "pm"
  return null
}

// ─── Arrival state ───────────────────────────────────────────────────────────

interface ArrivalState {
  /** The full-screen arrival is on screen (or entering). */
  active: boolean
  /** Gate passed synchronously — children were never mounted; the arrival IS
   *  the app until navigation reveals them. Cleared when navigation starts. */
  blocking: boolean
  /** User with no local onboarding evidence (cleared browser / new device):
   *  render the app normally and confirm onboarding over the wire; a
   *  confirmation activates the arrival late, as an overlay on the
   *  already-rendered app. */
  pendingLayoutCheck: boolean
  intro: boolean
  /** Dev preview (`?arrival` / `?arrival-intro`) — never stamp markers. */
  forced: boolean
  status: "loading" | "ready" | "failed"
  payload: ReportPayload | null
  continueTo: ArrivalDestination | null
}

const INERT_ARRIVAL: ArrivalState = {
  active: false,
  blocking: false,
  pendingLayoutCheck: false,
  intro: false,
  forced: false,
  status: "loading",
  payload: null,
  continueTo: null,
}

/** Deep-link landings get a "Continue to …" option; the arrival's own CTA
 *  destinations (dashboard home + jobcost list) would be redundant as one. */
function deriveContinueTo(pathname: string, search: string): ArrivalDestination | null {
  if (pathname === "/" || pathname.startsWith("/dashboard") || pathname === "/jobcost") return null
  return { path: pathname + search, label: deriveBackLabel(pathname) }
}

// The report fetch must win the wire, but the entry-page preloads shouldn't
// contend with it on the Pi backend — hold them back briefly.
const PRELOAD_DELAY_MS = 400
// A recap that hasn't landed by now isn't coming in time to be a greeting.
const REPORT_TIMEOUT_MS = 8000

/**
 * App-wide host for the daily greeting: once per Chicago calendar day the
 * full-screen DailyArrival takes over the user's first session — when the
 * gate passes synchronously it renders INSTEAD of the app, so the report
 * query is the first request on the wire and the destination pages preload
 * behind it. The header clock button re-opens the compact modal on demand.
 * Gated off for users who haven't finished onboarding, and until the day
 * after they do.
 */
export function DailyReportProvider({ children }: { children: ReactNode }) {
  const { user, claims } = useAuth()
  // Destructured so the stable members can be listed in hook deps directly (a
  // whole-object dep would re-run every render — the provider value isn't memoized).
  const { seen, onboardedAt, phase, resolving, acknowledge } = useOnboarding()
  const location = useLocation()
  const navigate = useNavigate()
  const source = reportSource(claims["role"] as AppRole | undefined, claims["employeeId"])

  const uid = user?.uid ?? null
  const firstName = user?.displayName?.trim().split(/\s+/)[0] ?? null
  // Dashboard.tsx's manager branch passes Number(claims["employeeId"]) as
  // detailId — the preload must derive it identically or its cache key misses.
  // A GM's home is the same per-employee view scoped to the all-jobs sentinel,
  // so warm that (managerHome) rather than the admin grid it never renders.
  const employeeId =
    source === "pm"
      ? Number(claims["employeeId"])
      : isGeneralManager(claims["role"] as string | undefined)
        ? ALL_JOBS_DETAIL_ID
        : null

  // ── Arrival gate — synchronous, at first render ────────────────────────
  // App.tsx only mounts this provider after auth resolves, so uid/claims are
  // settled here: a lazy initializer (not an effect) lets the passing case
  // withhold the app entirely and put the arrival up as the first paint.
  const [arrival, setArrival] = useState<ArrivalState>(() => {
    if (!uid || !source) return INERT_ARRIVAL

    // Dev-only previews, mirroring `?welcome` / `?idle`: `?arrival` forces the
    // daily arrival, `?arrival-intro` its intro variant — gating skipped and
    // markers never stamped. The old `?intro` modal preview was retired in its
    // favor (the intro framing lives on the arrival now); `?report` still
    // previews the modal, which is only a manual-reopen surface today.
    const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
    const forcedIntro = params?.has("arrival-intro") ?? false
    const forced = forcedIntro || (params?.has("arrival") ?? false)

    const today = chicagoToday()
    if (!forced) {
      if (readMarker(seenKey(uid)) === today) return INERT_ARRIVAL
      // Onboarded the same day → first greeting tomorrow.
      if (onboardedAt === today) return INERT_ARRIVAL
    }

    const base: ArrivalState = {
      ...INERT_ARRIVAL,
      intro: forcedIntro || (!forced && !seen("intro-tour")),
      forced,
      continueTo: deriveContinueTo(location.pathname, location.search),
    }

    if (forced) return { ...base, active: true, blocking: true }

    // Onboarding gate, delegated to the central provider. App.tsx mounts this
    // provider only after auth resolves, so `phase` is settled apart from the
    // cold-local case: `resolving` (no local onboarding evidence — cleared
    // browser or new device) defers to the async fallback below; anyone not yet
    // onboarded gets no greeting.
    if (resolving) return { ...base, pendingLayoutCheck: true }
    if (phase !== "onboarded") return INERT_ARRIVAL
    return { ...base, active: true, blocking: true }
  })

  // ── Async cold-store fallback ──────────────────────────────────────────
  // The synchronous gate couldn't tell if a cold-local user (cleared browser /
  // new device) is onboarded, so it parked the arrival on `pendingLayoutCheck`
  // and deferred to the onboarding provider's bootstrap. When that settles
  // (`resolving` flips false), activate the arrival as a late overlay if
  // onboarded, else drop it. `intro` and the onboarded-today deferral are
  // re-derived HERE, not taken from the initializer — the server union just
  // landed, and it's exactly what suppresses an intro-tour replay for an
  // established user on a fresh browser. The bootstrap is a shared, memoized
  // fetch, so StrictMode's double mount can't double-fetch here.
  useEffect(() => {
    if (!arrival.pendingLayoutCheck || resolving) return
    const greet = phase === "onboarded" && onboardedAt !== chicagoToday()
    setArrival((a) =>
      a.pendingLayoutCheck
        ? greet
          ? { ...a, pendingLayoutCheck: false, active: true, intro: !seen("intro-tour") }
          : { ...a, pendingLayoutCheck: false }
        : a
    )
  }, [arrival.pendingLayoutCheck, resolving, phase, onboardedAt, seen])

  // ── Report fetch + entry-page preloads, on activation ──────────────────
  useEffect(() => {
    if (!arrival.active || !source) return

    let settled = false
    const ctrl = new AbortController()

    // Dispatched before anything else is scheduled — the arrival blocks the
    // app's own queries, so this is the first request on the wire.
    fetchDailyReport(source, ctrl.signal)
      .then((report) => {
        if (settled) return // late success after the timeout is ignored
        settled = true
        clearTimeout(timeoutTimer)
        if (!report) {
          setArrival((a) => ({ ...a, status: "failed" }))
          return
        }
        setArrival((a) => ({ ...a, status: "ready", payload: report }))
        // Stamp the once-per-day marker only on success — a failure leaves it
        // unstamped so the next session (or tomorrow) retries. Another tab may
        // have stamped it mid-fetch; re-writing the same day is harmless and
        // the arrival stays up regardless — it's already on screen.
        if (!arrival.forced && uid) {
          try {
            localStorage.setItem(seenKey(uid), chicagoToday())
          } catch {
            // marker lost → worst case a second greeting today
          }
        }
      })
      .catch(() => {
        if (settled) return
        settled = true
        clearTimeout(timeoutTimer)
        setArrival((a) => ({ ...a, status: "failed" }))
      })

    const timeoutTimer = setTimeout(() => {
      settled = true
      setArrival((a) => ({ ...a, status: "failed" }))
    }, REPORT_TIMEOUT_MS)
    const preloadTimer = setTimeout(() => preloadEntryPages(source, employeeId), PRELOAD_DELAY_MS)

    return () => {
      settled = true // an abort rejection must not flip status to "failed"
      ctrl.abort()
      clearTimeout(timeoutTimer)
      clearTimeout(preloadTimer)
    }
  }, [arrival.active, arrival.forced, source, uid, employeeId])

  // ── Arrival navigation ─────────────────────────────────────────────────
  const navTargetRef = useRef<string | null>(null)
  const [introStep, setIntroStep] = useState<IntroStep>(0)

  const handleArrivalNavigate = useCallback(
    (path: string) => {
      navTargetRef.current = path
      if (!arrival.forced && uid) {
        try {
          // Choosing a destination acknowledges the greeting — stamp the day
          // even if the recap never landed, so a later session today doesn't
          // replay the takeover. (Idempotent with the on-success stamp; a
          // failed recap still retries tomorrow — the marker is per-day.)
          localStorage.setItem(seenKey(uid), chicagoToday())
        } catch {
          // markers lost → worst case a repeat greeting
        }
        // Finishing the intro variant acknowledges the intro-tour milestone
        // (server-backed, so a cleared browser won't replay it).
        if (arrival.intro) acknowledge("intro-tour")
      }
      navigate(path)
      // The intro coachmark sequence: arm step 1 NOW so the blurred layer
      // (DailyReportCoach) rises over the dashboard as the arrival fades out to
      // reveal it, and the real header clock lifts above the blur to teach it —
      // "the dashboard loads in with a blur applied over it". Closing it advances
      // to step 2 (the Reports nav-item hint).
      if (arrival.intro && path === "/dashboard") setIntroStep(1)
      // Reveal children and start the exit in the same commit: the arrival fades
      // out (opacity) to reveal the page it navigated to.
      setArrival((a) => ({ ...a, active: false, blocking: false }))
    },
    [arrival.forced, uid, navigate, arrival.intro, acknowledge]
  )

  const handleArrivalExited = useCallback(() => {
    navTargetRef.current = null
    setArrival(INERT_ARRIVAL)
  }, [])

  // ── External navigation out from under the arrival ─────────────────────
  // The arrival covers the app, but its drill-down modals can still navigate —
  // e.g. the timeline (returning-user) recap lets a tile → invoice → "View
  // project" jump to /jobcost/:id. That fires router navigate() directly, not
  // our CTA path, so the URL moves while the arrival sits frozen on top. Treat
  // any such move as an acknowledgment: stamp the seen markers and fade the
  // arrival off to reveal the page it landed on (same as choosing a CTA). The
  // intro variant blocks "View project" outright, so this only fires for the
  // timeline variant in practice.
  const coveredPathRef = useRef(location.pathname)
  useEffect(() => {
    if (!arrival.active) {
      coveredPathRef.current = location.pathname
      return
    }
    // Our own CTA drove this navigation — handleArrivalNavigate already began
    // the dismissal; don't double-handle it.
    if (navTargetRef.current !== null) return
    if (location.pathname === coveredPathRef.current) return

    // A drill-down navigated underneath the arrival. Acknowledge + fade off.
    if (!arrival.forced && uid) {
      try {
        localStorage.setItem(seenKey(uid), chicagoToday())
      } catch {
        // markers lost → worst case a repeat greeting
      }
      if (arrival.intro) acknowledge("intro-tour")
    }
    setArrival((a) => ({ ...a, active: false, blocking: false }))
  }, [location.pathname, arrival.active, arrival.forced, arrival.intro, uid, acknowledge])

  // ── Manual open (clock button) ─────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(false)

  const openManually = useCallback(() => {
    if (!source) return
    setOpen(true)
    setLoading(true)
    fetchDailyReport(source)
      .then((report) => setPayload(report))
      .catch(() => setPayload(null))
      .finally(() => setLoading(false))
  }, [source])

  // Dev-only modal preview: `?report` opens the manual-reopen surface via the
  // same flow the clock button uses — no markers involved.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (new URLSearchParams(window.location.search).has("report")) openManually()
  }, [openManually])

  const handleClose = useCallback(() => setOpen(false), [])

  // Closing a coachmark steps the sequence forward: the clock (1) hands off to
  // the Reports nav hint (2), which finishes the sequence (0).
  const advanceIntro = useCallback(() => setIntroStep((s) => (s === 1 ? 2 : 0)), [])

  // Reaching the Reports page is the sequence's whole point — end it there.
  useEffect(() => {
    if (introStep !== 0 && location.pathname === "/reports") setIntroStep(0)
  }, [introStep, location.pathname])

  // While the synchronous gate holds, the arrival replaces the app outright —
  // Navbar, trackers, and page queries all wait until the user picks a
  // destination. The overlay case (async fallback, or mid-exit) renders both.
  const withholdChildren = arrival.active && arrival.blocking

  return (
    <DailyReportContext.Provider value={{ open: openManually, introStep, advanceIntro }}>
      {!withholdChildren && children}
      <AnimatePresence onExitComplete={handleArrivalExited}>
        {arrival.active && (
          <DailyArrival
            firstName={firstName}
            pmScoped={source === "pm"}
            intro={arrival.intro}
            payload={arrival.payload}
            status={arrival.status}
            continueTo={arrival.continueTo}
            onNavigate={handleArrivalNavigate}
          />
        )}
      </AnimatePresence>
      <DailyReportModal
        open={open}
        payload={payload}
        loading={loading}
        pmScoped={source === "pm"}
        onClose={handleClose}
      />
      <DailyReportCoach active={introStep !== 0} />
    </DailyReportContext.Provider>
  )
}
