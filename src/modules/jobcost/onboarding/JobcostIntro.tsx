import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { useLocation } from "react-router-dom"
import Logo from "../../../core/components/Logo"
import { useOnboarding } from "../../../core/onboarding/OnboardingProvider"
import { JOBCOST_INTRO } from "../../../core/onboarding/markers"
import { Coachmark } from "../../../core/onboarding/Coachmark"
import { useCoachTarget, type CoachTargetId } from "../../../core/onboarding/coachTargets"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import { useJobcostTourState, getJobcostTourController, publishTourActive, publishTourCardPos } from "./tourBus"

// One-time interactive tour of the redesigned Job Costing board (the
// `jobcost-intro` incremental milestone). It runs ON the live board: a glassy
// welcome overlay covers the page CONTENT (the navbar stays visible and
// crisp — the overlay's left edge tracks the nav's live width), then hands
// off to the Coachmark spotlight and the user performs each taught action
// for real — the cutout passes clicks through, and the tour advances by
// watching the board's state (tourBus):
//
//   welcome → open a property (the Property view IS the pitch; the spotlight
//   GROWS with the card) → its Phase Work / One-Off Work split (summaries
//   stay in focus and clickable) → pin → a closing note on the view toggle
//   ("toggle back to the previous view any time"), where the tour ends.
//
// The tour never leaves the board — no report-page beats. Interactive beats
// carry a quiet "Next" escape hatch that performs the action instead;
// explainer beats advance on a copper Continue. On finish or skip the tour
// restores the pre-tour pins/view (the interactions were a lesson, not a
// decision) — through the board's controller when it's mounted, else
// straight to localStorage — then acknowledges.
//
// Mounted in App.tsx (NOT the lazy Jobcost chunk) so a /jobcost refresh
// paints the cover with the shell. Desktop-only. Opening a real report
// mid-tour counts as graduating (finish, not abort); leaving Job Costing
// any other way aborts without acknowledging, so the tour replays.

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]
const RISE_SPRING = { type: "spring", visualDuration: 0.6, bounce: 0.22 } as const

type CoachStage =
  | "open-card" // the Property-view pitch: click a property open
  | "explore-card" // the opened card: Phase Work / One-Off Work, all live
  | "pin" // pin a property
  | "views-end" // closing note on the toggle; the tour ends here
type Stage = "idle" | "welcome" | CoachStage | "done"

const COACH_ORDER: CoachStage[] = ["open-card", "explore-card", "pin", "views-end"]

interface StepDef {
  target: CoachTargetId
  title?: string
  body: string
  /** Blocking beat: shield the hole (nothing there needs clicking). */
  shielded?: boolean
  /** Freezes the card in place instead of chasing a resizing target. */
  pinCard?: boolean
  /** False: the card fades in fresh instead of gliding from its prior spot —
   *  for a step whose target is unrelated to the one before it. */
  travel?: boolean
  cta: "primary" | "quiet"
  ctaLabel: string
  /** Pause after the watched action lands, so its animation is seen. */
  advanceDelay?: number
}

const STEPS: Record<CoachStage, StepDef> = {
  "open-card": {
    target: "jc-card",
    title: "The new way to job cost",
    body: "The property view combines phases & one offs.\nClick once to expand it, twice to open it.",
    cta: "primary",
    ctaLabel: "Continue",
    advanceDelay: 550,
  },
  "explore-card": {
    target: "jc-card",
    title: "Phases and One-Offs",
    body: "Click either summary to see its respective jobs.",
    pinCard: true,
    cta: "primary",
    ctaLabel: "Continue",
  },
  pin: {
    target: "jc-card-pin",
    title: "Pin to the top",
    body: "Pin a property to keep it at the top of the list.",
    travel: false,
    cta: "primary",
    ctaLabel: "Continue",
    advanceDelay: 1200,
  },
  "views-end": {
    target: "jc-view-seg",
    title: "Switching Views",
    body: "Toggle back to the previous view at any time.",
    shielded: true,
    travel: false,
    cta: "primary",
    ctaLabel: "Done",
  },
}

// Same keys + synthetic StorageEvent as useLocalStorage, so mounted hooks sync.
function writeStored(key: string, value: unknown) {
  try {
    const json = JSON.stringify(value)
    localStorage.setItem(key, json)
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: json }))
  } catch {
    // storage unavailable — the tour's pin simply stands
  }
}

// The pre-tour state restore falls back to localStorage when the board is
// unmounted (a mid-tour report open graduates the tour off-board).
function restoreViaStorage(base: { view: "grouped" | "list"; pins: string[] }) {
  writeStored("jobcostViewMode", base.view === "grouped" ? "grouped" : "list")
  writeStored("jobcostPinnedProperties", base.pins)
}

// Baseline source when the board hasn't mounted/published yet (cold refresh on
// /jobcost: the welcome glass paints from the App shell while the lazy Jobcost
// chunk is still loading). The board's view/pins are localStorage-backed, so
// reading the keys directly gives the same truth — fabricating `{grouped, []}`
// here would let finish() wipe the user's real pins.
function readStoredBaseline(): { view: "grouped" | "list"; pins: string[] } {
  try {
    const view = JSON.parse(localStorage.getItem("jobcostViewMode") ?? '"grouped"')
    const pins = JSON.parse(localStorage.getItem("jobcostPinnedProperties") ?? "[]")
    return {
      view: view === "list" ? "list" : "grouped",
      pins: Array.isArray(pins) ? (pins as string[]) : [],
    }
  } catch {
    return { view: "grouped", pins: [] }
  }
}

export function JobcostIntro() {
  const { phase, resolving, seen, acknowledge } = useOnboarding()
  const isMobile = useIsMobile()
  const reduced = !!useReducedMotion()
  const location = useLocation()
  const boardState = useJobcostTourState()

  const onBoard = location.pathname === "/jobcost"
  const onPropertyPage = location.pathname.startsWith("/jobcost/property/")

  // Dev-only preview (`?jobcost-intro`) forces the flow and never
  // acknowledges — the `?arrival` / `?tour` convention.
  const [preview] = useState(() => {
    if (!import.meta.env.DEV) return false
    return new URLSearchParams(window.location.search).has("jobcost-intro")
  })
  const [stage, setStage] = useState<Stage>(preview ? "welcome" : "idle")

  // Engage-latch, set during render (the admin host's reset-on-change
  // pattern): read onboarding state once, then run on internal stage only.
  // The `!resolving` guard keeps a cold-store user who already acknowledged
  // server-side from getting a takeover flash; the phase guard keeps this
  // out of the blocking setup flows.
  if (
    stage === "idle" &&
    onBoard &&
    !isMobile &&
    !resolving &&
    (phase === "onboarded" || phase === "not-applicable") &&
    !seen(JOBCOST_INTRO)
  ) {
    setStage("welcome")
  }
  // Crossing under 768px mid-tour (tablet rotation) bails out — restore the
  // pre-tour state too, or the forced grouped flip / lesson-pin would stick.
  // Effect, not render-phase: restore writes localStorage + dispatches.
  useEffect(() => {
    if (isMobile && stage !== "idle" && stage !== "done") {
      restoreBaseline()
      setStage("done")
    }
  }, [isMobile, stage])

  // Onboarding state not settled yet, but this user may be owed the intro:
  // hold the (empty) welcome glass so the board never reads first.
  const pending =
    stage === "idle" &&
    onBoard &&
    !isMobile &&
    !seen(JOBCOST_INTRO) &&
    (phase === "loading" || resolving)

  const isCoach = (COACH_ORDER as string[]).includes(stage as string)

  // Lets the board block a navigate-away (opening a property report) while a
  // coach beat is running, instead of the tour silently graduating under it.
  useEffect(() => {
    publishTourActive(isCoach)
    return () => publishTourActive(false)
  }, [isCoach])
  useEffect(() => () => publishTourCardPos(null), [])

  const step = isCoach ? STEPS[stage as CoachStage] : null
  // The last real step's content, held so the Coachmark can play its exit
  // fade (active → false) instead of unmounting abruptly at the end.
  const lastStepRef = useRef<StepDef | null>(null)
  if (step) lastStepRef.current = step
  const shownStep = step ?? lastStepRef.current

  // Pre-tour board state, restored on finish/skip. Captured when the welcome
  // glass hands off to the first coach step (the board publishes its
  // localStorage-backed view/pins on mount, before data lands).
  const baselineRef = useRef<{ view: "grouped" | "list"; pins: string[] } | null>(null)

  const restoreBaseline = () => {
    const base = baselineRef.current
    if (!base) return
    baselineRef.current = null
    const ctrl = getJobcostTourController()
    if (ctrl) ctrl.restore(base)
    else restoreViaStorage(base)
  }

  const finish = () => {
    restoreBaseline()
    if (!preview) acknowledge(JOBCOST_INTRO)
    setStage("done")
  }

  const beginCoach = () => {
    // The board publishes its localStorage-backed view/pins on mount; until
    // then (welcome clicked before the lazy chunk lands) read the same keys
    // directly — never fabricate an empty baseline.
    const base = boardState
      ? { view: boardState.view, pins: boardState.pins }
      : readStoredBaseline()
    baselineRef.current = base
    // The tour teaches from the Property view; a list-preferring returner is
    // flipped there for the lesson and restored at the end. With the board
    // not yet mounted, flip the stored key so it MOUNTS grouped.
    if (base.view === "list") {
      const ctrl = getJobcostTourController()
      if (ctrl) ctrl.setView("grouped")
      else writeStored("jobcostViewMode", "grouped")
    }
    setStage("open-card")
  }

  // ── Route tolerance ──────────────────────────────────────────────────────
  // Opening a real report mid-tour — property page or a job's full report —
  // is graduating, not escaping: finish (restore + acknowledge) rather than
  // nag with a replay. Leaving Job Costing any other way aborts without
  // acknowledging, but still restores the pre-tour view/pins so the forced
  // grouped flip and any lesson-pin don't poison the replay's baseline.
  useEffect(() => {
    if (stage === "welcome" && !onBoard) {
      setStage("idle")
      return
    }
    if (!isCoach) return
    if (onPropertyPage || location.pathname.startsWith("/jobcost/")) finish()
    else if (!onBoard) {
      restoreBaseline()
      setStage("idle")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // ── Advance on the watched action ────────────────────────────────────────
  useEffect(() => {
    if (!isCoach || boardState == null) return
    const s = stage as CoachStage
    const base = baselineRef.current
    const satisfied =
      s === "open-card"
        ? boardState.openGroupKey != null
        : s === "pin"
          ? base != null && JSON.stringify(boardState.pins) !== JSON.stringify(base.pins)
          : false
    if (!satisfied) return
    const next: Stage = s === "open-card" ? "explore-card" : "views-end"
    const t = window.setTimeout(() => setStage(next), reduced ? 250 : (STEPS[s].advanceDelay ?? 400))
    return () => window.clearTimeout(t)
  }, [isCoach, stage, boardState, reduced])

  // A board with nothing on it has nothing to teach: once data settles empty,
  // let the tour go quietly.
  useEffect(() => {
    if (!isCoach) return
    if (boardState != null && !boardState.loading && boardState.groupCount === 0) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoach, boardState])

  // ── Targets ──────────────────────────────────────────────────────────────
  const navEl = useCoachTarget("navbar")
  const segEl = useCoachTarget("jc-view-seg")
  const cardEl = useCoachTarget("jc-card")
  const pinEl = useCoachTarget("jc-card-pin")
  const targetFor: Record<CoachTargetId, HTMLElement | null> = {
    "edit-gear": null,
    "wip-toggle": null,
    "nav-jobcost": null,
    "nav-finances": null,
    navbar: null,
    "jc-view-seg": segEl,
    "jc-card": cardEl,
    "jc-card-pin": pinEl,
  }
  const target = step ? targetFor[step.target] : null

  // The welcome glass covers the page CONTENT only — its left edge rides the
  // navbar's LIVE width (the nav hover-expands with a 0.3s transition, and a
  // ResizeObserver fires through every frame of it).
  const [navW, setNavW] = useState<number | null>(null)
  useEffect(() => {
    if (!navEl) return
    const measure = () => setNavW(navEl.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(navEl)
    return () => ro.disconnect()
  }, [navEl])

  // Bring an offscreen target into view on step entry.
  useEffect(() => {
    if (!target) return
    const r = target.getBoundingClientRect()
    if (r.top < 70 || r.bottom > window.innerHeight - 40) {
      target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" })
    }
  }, [target, reduced])

  // The card's CTA: explainer beats advance, interactive beats' quiet "Next"
  // performs the taught action for the user so nobody is ever stuck.
  const advance = () => {
    const s = stage as CoachStage
    if (s === "open-card") getJobcostTourController()?.openFirstGroup() // advances via the watched state
    else if (s === "explore-card") setStage("pin")
    else if (s === "pin") setStage("views-end")
    else if (s === "views-end") finish()
  }

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 16, scale: reduced ? 1 : 0.98 },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: reduced
        ? { duration: 0.25, delay: 0 }
        : { default: { ...RISE_SPRING, delay }, opacity: { duration: 0.45, ease: EASE, delay } },
    },
  })

  return (
    <>
      {/* Welcome glass: covers the page CONTENT only — the navbar stays
          crisp on its left. The board glows through the frost beneath. */}
      <AnimatePresence>
        {(stage === "welcome" || pending) && (
          <motion.div
            key="welcome"
            className="jct-welcome"
            style={navW != null ? { left: navW + 1 } : undefined}
            role="dialog"
            aria-label="Welcome to Job Costing"
            initial={{ opacity: preview ? 0 : 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0.2 : 0.4, ease: "easeIn" } }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {stage === "welcome" && (
              <div className="jct-welcome-inner">
                <motion.div className="jct-welcome-logo" {...rise(0.15)}>
                  <Logo size={44} />
                </motion.div>
                <motion.h1 className="jct-welcome-title" {...rise(0.15)}>
                  Welcome to Job Costing
                </motion.h1>
                <motion.p className="jct-welcome-line" {...rise(0.5)}>
                  Here&apos;s a quick tour of what&apos;s new.
                </motion.p>
                <motion.div {...rise(0.9)}>
                  <motion.button
                    type="button"
                    className="primary-button arr-cta"
                    whileHover={reduced ? undefined : { scale: 1.04 }}
                    whileTap={reduced ? undefined : { scale: 0.96 }}
                    onClick={beginCoach}
                  >
                    Continue
                  </motion.button>
                </motion.div>
                <button type="button" className="adm-skip" onClick={finish}>
                  Skip intro
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {shownStep && (
        <Coachmark
          // Stays mounted at the end so the backdrop fades out under its own
          // exit instead of popping off.
          active={isCoach}
          target={step ? target : null}
          title={shownStep.title}
          body={shownStep.body}
          interactive={!shownStep.shielded}
          ctaStyle={shownStep.cta}
          ctaLabel={shownStep.ctaLabel}
          contentKey={String(stage)}
          variant="tour"
          pinCard={shownStep.pinCard}
          travel={shownStep.travel ?? true}
          onAdvance={advance}
          onPos={publishTourCardPos}
        />
      )}
    </>
  )
}
