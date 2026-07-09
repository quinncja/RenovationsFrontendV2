import { useEffect, useState } from "react"
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion"
import type { ReportPayload, ReportMetricKey } from "../reportTypes"
import { addDays, chicagoToday, dayLabel, rangeLabel, windowToRange } from "../chicagoDate"
import { SECTIONS, ZERO_SUMMARY, visibleMetrics, metricsFor, type MetricSection } from "../metricDefs"
import { MetricDrilldownModal } from "../MetricDrilldownModal"
import { MetricTileFace } from "../MetricTile"
import Logo from "../../../../core/components/Logo"

export interface ArrivalDestination {
  path: string
  label: string
}

export interface DailyArrivalProps {
  firstName: string | null
  /** PM payloads show only the Job Activity section (see visibleMetrics). */
  pmScoped: boolean
  /** First-ever sight: the guided, click-through "Introducing the Daily Recap"
   *  walkthrough (IntroArrival). Returning users get the timeline (below). */
  intro: boolean
  payload: ReportPayload | null
  status: "loading" | "ready" | "failed"
  /** Deep-link landing that isn't /dashboard or /jobcost. */
  continueTo: ArrivalDestination | null
  /** Parent navigates + drives the exit via AnimatePresence. */
  onNavigate: (path: string) => void
}

// ─── Copy ────────────────────────────────────────────────────────────────────
// Same derivations the modal uses (DailyReportModal.sinceText), duplicated so
// the arrival screen and the modal can diverge independently later.

// "yesterday" on a normal morning, the weekday name after a gap (Monday shows
// Friday; a Saturday login shows Friday too), with the weekend called out when
// the window spans it.
function sinceText(payload: ReportPayload): string {
  const range = windowToRange(payload.window)
  if (payload.window.includesWeekend) return "Friday and over the weekend"
  if (range.from === addDays(chicagoToday(), -1)) return "yesterday"
  return dayLabel(range.from).split(",")[0] // weekday name
}

// Chicago wall-clock, matching the Chicago-day convention the report windows
// use — a traveler's browser clock shouldn't say "Good evening" at 9am CT.
const CHICAGO_HOUR = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  hour: "numeric",
  hourCycle: "h23",
})
const CHICAGO_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "long",
  month: "long",
  day: "numeric",
})

function greeting(firstName: string | null, now: Date = new Date()): string {
  const hour = Number(CHICAGO_HOUR.format(now))
  const word = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  return firstName ? `${word}, ${firstName}` : word
}

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

/**
 * The full-screen daily arrival. First-ever sight → the guided IntroArrival
 * walkthrough; every day after → the TimelineArrival that builds the whole
 * recap on a fixed timeline. Both dissolve into the already-rendered app when
 * the user picks a destination (parent unmounts inside AnimatePresence).
 */
export function DailyArrival(props: DailyArrivalProps) {
  return props.intro ? <IntroArrival {...props} /> : <TimelineArrival {...props} />
}

// ═══ First-run walkthrough ═══════════════════════════════════════════════════
// A calm, click-through introduction. A hero line settles first, then each
// section of the recap is revealed one at a time and STACKS beneath the last —
// nothing is swapped away. Every reveal animates its own height open, so the
// centered column (margin:auto in a flex root) reflows continuously and always
// stays centered; nothing ever jumps.

// The section headers on the first run are walk-through sentences (styled to
// match the hero subtitle), not the bare titles — admins are walked through both
// logs; a PM, who only has the one section, gets a more concrete line.
// The PM greeting keeps ALL its copy in the hero: the subtitle runs on (ends in
// a comma) into this tail line right beneath it, then the single row of tiles
// reveals below on the arrow click with no lead of its own. Admins still get a
// per-section lead inside each revealed block (sectionLead).
const PM_RECAP_TAIL = "the recap tracks changes on your projects across four metrics."

// Admin section leads only — PMs render their copy in the hero (see PM_RECAP_TAIL),
// so this is never called for the single-section PM report.
function sectionLead(section: MetricSection): string {
  if (section === "operations") {
    return "Split into two sections, the first gives you a look at company-wide project activity."
  }
  return "The second gives you a look at company-wide financial activity."
}

function IntroArrival({ pmScoped, payload, status, onNavigate }: DailyArrivalProps) {
  const reduced = !!useReducedMotion()

  // The walkthrough accumulates: each arrow click reveals the next section
  // beneath the last, then (once all are shown) the destination buttons.
  const [revealCount, setRevealCount] = useState(0)
  const [showCtas, setShowCtas] = useState(false)
  // Clicked to reveal a section before the recap finished loading — the reveal
  // is deferred (a spinner on the arrow) until the data lands, so a section
  // never opens onto a skeleton.
  const [awaiting, setAwaiting] = useState(false)
  // The tile the user drilled into — opens the same item-list modal the report
  // modal / Reports page use (MetricDrilldownModal), stacked above the arrival.
  const [metric, setMetric] = useState<ReportMetricKey | null>(null)

  const ready = status === "ready" && payload !== null
  const failed = status === "failed"
  const range = payload ? windowToRange(payload.window) : null

  // Reveal order: each section (with its tiles), then the FINAL arrow click drops
  // the arrow and shows the closing block — the "click any tile…" hint plus the
  // Go to Dashboard button, together (no extra arrow for the button). A hard
  // failure drops the sections — the arrow goes straight to the closing block
  // with a "couldn't load" note instead.
  const sections = failed ? [] : pmScoped ? SECTIONS.filter((s) => s.key === "operations") : SECTIONS
  const allRevealed = revealCount >= sections.length
  // Tiles are live as soon as a section opens — the first section lead ("… click
  // any tile to explore its details.") explains the affordance up front, so it no
  // longer waits for the closing block.
  const tilesClickable = true

  function advance() {
    if (allRevealed || failed) {
      setShowCtas(true)
      return
    }
    if (!ready) setAwaiting(true) // wait for the recap, then reveal the section
    else setRevealCount((c) => c + 1)
  }

  // Deferred reveal resolves once the recap lands (or fails).
  useEffect(() => {
    if (!awaiting) return
    if (ready) {
      setAwaiting(false)
      setRevealCount((c) => c + 1)
    } else if (failed) {
      setAwaiting(false)
      setShowCtas(true)
    }
  }, [awaiting, ready, failed])

  function tilesFor(section: MetricSection) {
    return visibleMetrics(payload!.summary).filter((m) => m.section === section)
  }

  // For PMs the subtitle runs on into the section lead below it (one sentence
  // across two lines), so it ends in a comma rather than a full stop.
  const subtitleEnd = pmScoped ? "," : "."
  const subtitle = payload
    ? `Designed to show you what happened ${sinceText(payload)}${subtitleEnd}`
    : `Designed to show you what happened yesterday${subtitleEnd}`

  // ── Motion vocabulary ──
  const rise: Variants = {
    hidden: { opacity: 0, y: reduced ? 0 : 14 },
    shown: { opacity: 1, y: 0, transition: { duration: reduced ? 0.25 : 0.55, ease: EASE } },
  }

  // The hero (R logo → "Introducing…" → the explanation) is paced deliberately
  // slower than the section reveals below, and unhurried: each line lands well
  // after the previous has settled. Delays are EXPLICIT per line (custom) rather
  // than staggerChildren — a child's own transition.delay OVERRIDES the
  // stagger-computed one in Framer, which had let the delayed subtitle jump ahead
  // of the title. `sub` sits well after the title's 0.9s + 0.8s settle so the
  // explanation reads as its own beat.
  // logo shares the title's delay so the R and "Introducing the Daily Recap"
  // rise together as one beat.
  const HERO_AT = reduced
    ? { logo: 0, title: 0, sub: 0 }
    : { logo: 0.9, title: 0.9, sub: 2.0 }

  const heroRise: Variants = {
    hidden: { opacity: 0, y: reduced ? 0 : 18 },
    shown: (delay: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0.25 : 0.8, ease: EASE, delay },
    }),
  }

  // A revealed section's contents fill in after its height has mostly opened,
  // so the tiles fade into settled space rather than a still-growing box.
  const blockStagger: Variants = {
    hidden: {},
    shown: {
      transition: {
        when: "beforeChildren",
        delayChildren: reduced ? 0 : 0.3,
        staggerChildren: reduced ? 0 : 0.08,
      },
    },
  }

  return (
    <motion.div
      className="arr-screen"
      role="dialog"
      aria-label="Daily recap"
      // Plain opacity fade — NO self-blur here. The dashboard spotlight scrim is
      // already up (activated at navigate), so it supplies the single continuous
      // blur; the recap simply dissolves behind it into the blurred page.
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeIn" }}
      style={{ willChange: "opacity" }}
    >
      {/* margin:auto centers the column; as sections open their height the
          column grows and re-centers every frame — the source of the "settling
          into the middle" feel. No layout projection, so nothing snaps. */}
      <div className={`arr-intro-shell${pmScoped ? " arr-intro-shell--wide" : ""}`}>
        {/* No staggerChildren — each line carries its own explicit delay via
            custom (see HERO_AT) so ordering can't be flipped by a child delay. */}
        <motion.div className="arr-intro-header" initial="hidden" animate="shown">
          <motion.div className="arr-logo" variants={heroRise} custom={HERO_AT.logo}>
            <Logo size={52} />
          </motion.div>
          <motion.h1 className="arr-greeting" variants={heroRise} custom={HERO_AT.title}>
            Introducing the Daily Recap
          </motion.h1>
          <motion.p className="arr-intro-sub" variants={heroRise} custom={HERO_AT.sub}>
            {subtitle}
            {/* PMs keep all their copy up here: the subtitle ends in a comma and
                this line completes the sentence, so the tiles below reveal with
                no text above them. */}
            {pmScoped && (
              <>
                <br />
                {PM_RECAP_TAIL}
              </>
            )}
          </motion.p>
        </motion.div>

        {/* Revealed sections stack; each opens its own height so the column
            reflows smoothly. They never exit, so no AnimatePresence here. */}
        {sections.slice(0, revealCount).map((section) => (
          <motion.section
            key={section.key}
            className="arr-block"
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            transition={{ height: { duration: reduced ? 0.3 : 0.5, ease: EASE } }}
            style={{ overflow: "hidden", width: "100%" }}
          >
            <div className="arr-block-inner">
              {/* Section header. During the walkthrough it's the guiding sentence;
                  the FINAL arrow click (showCtas) morphs it into the compact recap
                  title the returning-user view uses. No mode="wait" — the sentence
                  collapses WHILE the title grows in its place, so it reads as one
                  smooth morph rather than a shrink-then-grow. */}
              <AnimatePresence>
                {showCtas ? (
                  // Single-section (PM) reports drop the redundant "Job Activity"
                  // title — the lead just collapses away with nothing to replace it.
                  sections.length > 1 ? (
                    <motion.div
                      key="title"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: { duration: reduced ? 0.25 : 0.45, ease: EASE },
                        opacity: { duration: 0.3, delay: reduced ? 0 : 0.12 },
                      }}
                      style={{ overflow: "hidden", width: "100%" }}
                    >
                      <span className="rpt-section-title arr-block-title">{section.title}</span>
                    </motion.div>
                  ) : null
                ) : pmScoped ? (
                  // PMs render their copy in the hero — the revealed block is
                  // tiles only, no lead above them.
                  null
                ) : (
                  <motion.div
                    key="lead"
                    initial={{ opacity: 0, y: reduced ? 0 : 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      height: 0,
                      opacity: 0,
                      transition: {
                        height: { duration: reduced ? 0.25 : 0.4, ease: EASE },
                        opacity: { duration: 0.25 },
                      },
                    }}
                    transition={{ duration: reduced ? 0.25 : 0.55, ease: EASE, delay: reduced ? 0 : 0.3 }}
                    style={{ overflow: "hidden", width: "100%" }}
                  >
                    <p className="arr-block-lead">{sectionLead(section.key)}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* PM-only affordance, in the subtitle's font, revealed WITH the
                  tiles (part of the block) and sitting just above them. Admins get
                  their per-tile hint beneath the tiles instead (.arr-tile-hint).
                  AnimatePresence lets it collapse its own height on exit (final
                  arrow click) instead of vanishing and snapping the tiles up. */}
              <AnimatePresence>
                {pmScoped && payload && !showCtas && (
                  <motion.p
                    key="intro-hint"
                    className="arr-intro-hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{
                      opacity: 0,
                      height: 0,
                      marginBottom: 0,
                      transition: {
                        height: { duration: reduced ? 0.25 : 0.35, ease: EASE },
                        opacity: { duration: 0.2 },
                      },
                    }}
                    transition={{ duration: reduced ? 0.25 : 0.5, ease: EASE }}
                    style={{ overflow: "hidden" }}
                  >
                    Click a tile to view its details.
                  </motion.p>
                )}
              </AnimatePresence>

              {payload && (
                <motion.div
                  className={`arr-grid arr-grid--cols-${tilesFor(section.key).length}`}
                  variants={blockStagger}
                  initial="hidden"
                  animate="shown"
                >
                  {tilesFor(section.key).map((m) => (
                    <motion.button
                      key={m.key}
                      type="button"
                      className={`rpt-tile ${tilesClickable ? "arr-tile-live" : "arr-tile"}`}
                      variants={rise}
                      disabled={!tilesClickable}
                      onClick={() => setMetric(m.key)}
                    >
                      <MetricTileFace metric={m} summary={payload.summary} />
                    </motion.button>
                  ))}
                </motion.div>
              )}

              {/* The tile-click affordance: a quiet line beneath the FIRST section's
                  tiles, landing a beat after they settle. It collapses away once the
                  second section is revealed (revealCount >= 2) — or, for a PM with a
                  single section, on the final arrow click (showCtas). */}
              <AnimatePresence>
                {!showCtas && payload && section.key === "operations" && revealCount < 2 && (
                  <motion.p
                    key="hint"
                    className="arr-tile-hint"
                    initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      height: 0,
                      marginTop: 0,
                      transition: {
                        height: { duration: reduced ? 0.25 : 0.35, ease: EASE },
                        opacity: { duration: 0.2 },
                      },
                    }}
                    transition={{ duration: reduced ? 0.25 : 0.5, ease: EASE, delay: reduced ? 0 : 0.9 }}
                    style={{ overflow: "hidden" }}
                  >
                    {/* Admins get the click prompt here (PMs get it above their
                        tiles instead, plus the "email me" line here). */}
                    {pmScoped ? (
                      <>
                        Want to see something else?{" "}
                        <a className="arr-tile-hint-mail" href="mailto:qsieja@renovationsdelivered.com">
                          Email me
                        </a>
                      </>
                    ) : (
                      "Click a tile to view its details."
                    )}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        ))}

        {/* The advance arrow opens its own height in after the hero; when the
            walkthrough is done it collapses and the buttons open in its place.
            mode="wait" chains the two height animations so the swap is one
            continuous move, never an instant jump. */}
        <div className="arr-foot">
          {/* No mode="wait": the arrow collapses WHILE the buttons grow in, so
              the slot height only ever increases — it never shrinks to zero and
              back. The arrow just fades away as the new content takes over. */}
          <AnimatePresence>
            {showCtas ? (
              <motion.div
                key="ctas"
                className="arr-foot-slot"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { duration: reduced ? 0.25 : 0.45, ease: EASE },
                  opacity: { duration: 0.35, delay: reduced ? 0 : 0.08 },
                }}
                style={{ overflow: "hidden", width: "100%" }}
              >
                <div className="arr-foot-inner">
                  {failed ? (
                    <p className="arr-failed arr-failed--inline">
                      Your recap couldn't load — it'll be waiting for you tomorrow.
                    </p>
                  ) : (
                    <p className="arr-block-lead arr-hint-lead">
                      Presented to you each day upon your first login.
                    </p>
                  )}
                  <div className="arr-ctas">
                    <button
                      type="button"
                      className="primary-button arr-cta"
                      onClick={() => onNavigate("/dashboard")}
                    >
                      Go to Dashboard
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="arrow"
                className="arr-foot-slot"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                // A quick exit with NO delay (the entrance delay below must not
                // leak into it) so it collapses in step with the buttons growing.
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: { height: { duration: 0.3, ease: EASE }, opacity: { duration: 0.18 } },
                }}
                // Held back well past the hero settling (the subtitle lands ~2.8s
                // in) so the explanation gets a clear beat to read before the
                // invite to continue appears. PMs get an extra beat: their
                // "Click a tile…" prompt sits above the tiles and should be read
                // before the advance arrow arrives.
                transition={{
                  height: { duration: reduced ? 0.25 : 0.5, ease: EASE, delay: reduced ? 0.2 : pmScoped ? 5.4 : 3.6 },
                  opacity: { duration: 0.5, delay: reduced ? 0.2 : pmScoped ? 5.4 : 3.6 },
                }}
                style={{ overflow: "hidden", width: "100%" }}
              >
                <div className="arr-foot-inner">
                  <motion.button
                    type="button"
                    className="arr-advance"
                    aria-label={allRevealed ? "Show where to go" : "Continue"}
                    disabled={awaiting}
                    whileHover={reduced || awaiting ? undefined : { scale: 1.06 }}
                    whileTap={reduced || awaiting ? undefined : { scale: 0.94 }}
                    onClick={advance}
                  >
                    <motion.span
                      className="arr-advance-chevron"
                      // A gentle idle bob invites the click; it pauses while a
                      // reveal is deferred (awaiting data) and under reduced motion.
                      animate={reduced || awaiting ? undefined : { y: [0, 3, 0] }}
                      transition={
                        reduced || awaiting
                          ? undefined
                          : { repeat: Infinity, duration: 1.9, ease: "easeInOut" }
                      }
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </motion.span>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* The tile drill-down — the same item-list modal the report modal and
          Reports page use. It portals to <body> and claims a modal layer, so it
          stacks above the arrival (whose z sits just below the modal base). */}
      <MetricDrilldownModal
        metric={metric}
        items={payload?.items ?? []}
        window={range ?? undefined}
        subtitle={range ? rangeLabel(range) : ""}
        backLabel="Dashboard"
        // The intro is a guided walkthrough — a drill-down's "View project"
        // would navigate out from under the still-blocking arrival, so it's
        // inert here (a tooltip explains: finish the recap first).
        blockProjectNav
        onClose={() => setMetric(null)}
      />
    </motion.div>
  )
}

// ═══ Returning-user timeline ═════════════════════════════════════════════════
// The original arrival, unchanged: the whole recap builds in on one fixed
// timeline (with the skeleton→data crossfade), for every day after the first.

type Beat = [delay: number, duration: number]

// A plain opacity fade into place — no vertical travel, so the logo, date,
// greeting, subtitle, section titles and tiles all resolve without sliding.
function riseVariants(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0 },
    shown: ([delay, duration]: Beat) => ({
      opacity: 1,
      transition: reduced
        ? { delay: Math.min(delay * 0.3, 0.5), duration: 0.2, ease: "easeOut" }
        : { delay, duration, ease: EASE },
    }),
    settled: { opacity: 1, transition: { duration: 0.1, ease: "easeOut" } },
  }
}

// Timeline anchors (seconds). The whole layout is present from first paint; these
// only stagger each element's fade/rise INTO its already-final slot (no reflow).
// The header rises first (logo → date → greeting → subtitle), then the sections
// fill in sequentially: each section's title leads its tiles by TILE_LEAD, tiles
// stagger TILE_STAGGER apart, and the next section starts after the previous one's
// last tile begins.
// The whole header — logo (R), date, greeting, and subtitle — fades in together
// as one beat; the tiles then fill in after.
const LOGO_AT = 0
const EYEBROW_AT = 0
const GREETING_AT = 0
const SUBTITLE_AT = 0
const TILES_AT = 0
const TILE_LEAD = 0.08
const TILE_STAGGER = 0.07

function TimelineArrival({
  firstName,
  pmScoped,
  payload,
  status,
  continueTo,
  onNavigate,
}: DailyArrivalProps) {
  const reduced = !!useReducedMotion()
  const [skipped, setSkipped] = useState(false)
  // CTAs stay inert until their entrance completes — while invisible they'd
  // otherwise swallow an early "tap anywhere to fast-forward" press and
  // navigate before the user ever saw the buttons.
  const [ctasLive, setCtasLive] = useState(false)
  // The tile the user drilled into — opens the same item-list modal the intro
  // walkthrough and the Reports page use (MetricDrilldownModal).
  const [metric, setMetric] = useState<ReportMetricKey | null>(null)
  const mode = skipped ? "settled" : "shown"
  const rise = riseVariants(reduced)

  const range = payload ? windowToRange(payload.window) : null

  // Grid positions come from pmScoped (payload not landed yet); once the summary
  // exists it is the authority on which metrics are visible. Either way the full
  // grid is laid out from first paint, so the column never reflows.
  const defs = payload ? visibleMetrics(payload.summary) : metricsFor(pmScoped)

  // Flatten the section structure into per-element delays. Every section starts
  // on the same beat (TILES_AT) so their rows fill in TOGETHER — each row only
  // staggers left-to-right across its own columns; the rows don't stagger
  // relative to one another (column i of every row lands at the same time).
  const sections = SECTIONS.map((s) => ({
    ...s,
    tiles: defs.filter((m) => m.section === s.key),
  }))
    .filter((s) => s.tiles.length > 0)
    .map((s) => {
      const titleDelay = TILES_AT
      const tileDelays = s.tiles.map((_, i) => titleDelay + TILE_LEAD + i * TILE_STAGGER)
      return { ...s, titleDelay, tileDelays }
    })

  // Before the payload lands we can't know the window (yesterday vs. Friday vs.
  // over the weekend), so we fall back to the common "yesterday" wording — same
  // sentence, so the normal case shows no swap; it only refines to "Friday"/"the
  // weekend" on the days the window actually reaches back.
  const subtitle = payload
    ? `Here's what happened ${sinceText(payload)}.`
    : "Here's what happened yesterday."

  return (
    <motion.div
      className="arr-screen"
      role="dialog"
      aria-label="Daily recap"
      initial="hidden"
      animate={mode}
      exit={{ opacity: 0, scale: 1.015, filter: "blur(14px)" }}
      transition={{ duration: 0.55, ease: "easeIn" }}
      // blur(0px) gives the exit filter an animatable starting value.
      style={{ filter: "blur(0px)", willChange: "opacity, transform, filter" }}
      onPointerDown={(e) => {
        // Fast-forward: any press that isn't a button jumps to the settled state.
        if ((e.target as HTMLElement).closest("button")) return
        setSkipped(true)
      }}
    >
      <div className={`arr-content${pmScoped ? " arr-content--wide" : ""}`}>
        <motion.div className="arr-logo" variants={rise} custom={[LOGO_AT, 0.6] satisfies Beat}>
          <Logo size={52} />
        </motion.div>

        <motion.span className="arr-eyebrow" variants={rise} custom={[EYEBROW_AT, 0.6] satisfies Beat}>
          {CHICAGO_DATE.format(new Date())}
        </motion.span>

        <motion.h1 className="arr-greeting" variants={rise} custom={[GREETING_AT, 0.6] satisfies Beat}>
          {greeting(firstName)}
        </motion.h1>

        <motion.p className="arr-intro-sub arr-subtitle" variants={rise} custom={[SUBTITLE_AT, 0.6] satisfies Beat}>
          {subtitle}
        </motion.p>

        {/* The whole grid is laid out from first paint (its metrics are known
            from `defs` before the payload lands), so the column is full-height and
            centered up front — nothing above ever reflows. Each tile rises into
            its already-final slot; until the data lands it holds its real height
            with invisible placeholder lines (NOT a shimmering skeleton), then the
            values crossfade in without moving anything. */}
        {status !== "failed" && (
          <motion.div className="arr-sections" initial="hidden" animate={mode}>
            {sections.map((section) => (
              <div key={section.key} className="arr-section">
                {sections.length > 1 && (
                  <motion.span
                    className="rpt-section-title"
                    variants={rise}
                    custom={[section.titleDelay, 0.6] satisfies Beat}
                  >
                    {section.title}
                  </motion.span>
                )}
                <div className={`arr-grid arr-grid--cols-${section.tiles.length}`}>
                  {section.tiles.map((m, i) => (
                    // Clickable once the data's here — opens the metric's
                    // drill-down; inert (and affordance-free) while loading.
                    <motion.button
                      key={m.key}
                      type="button"
                      className={`rpt-tile ${payload ? "arr-tile-live" : "arr-tile"}`}
                      variants={rise}
                      custom={[section.tileDelays[i], 0.5] satisfies Beat}
                      disabled={!payload}
                      onClick={() => setMetric(m.key)}
                    >
                      {/* Rendered from the real summary when it's here, the zero
                          summary before — same structure either way, so the tile
                          is its final height from first paint. The figures start
                          invisible and fade in only once the data lands (never
                          showing the placeholder zeros). */}
                      <motion.div
                        className="arr-tile-body"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: payload ? 1 : 0 }}
                        transition={{ duration: reduced ? 0.2 : 0.45, ease: "easeOut" }}
                      >
                        <MetricTileFace metric={m} summary={payload?.summary ?? ZERO_SUMMARY} />
                      </motion.div>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {status === "failed" && (
          <motion.p
            className="arr-failed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
          >
            Your recap couldn't load — it'll be waiting for you tomorrow.
          </motion.p>
        )}

        {/* CTAs fade in early, independent of the tiles finishing — the user
            shouldn't have to wait out the sequence to leave. */}
        <motion.div
          className="arr-cta-block"
          // Fades in the same way the intro walkthrough reveals its CTA: a plain
          // opacity fade (no y / scale / blur). Explicit initial/animate so it
          // opts out of the shared timeline variants.
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: reduced ? 0 : 0.08, ease: EASE }}
          style={{ pointerEvents: ctasLive ? "auto" : "none" }}
          onAnimationComplete={() => setCtasLive(true)}
        >
          <div className="arr-ctas">
            <button
              type="button"
              className="primary-button arr-cta"
              onClick={() => onNavigate("/dashboard")}
            >
              Go to Dashboard
            </button>
            <button
              type="button"
              className="arr-cta arr-cta--secondary"
              onClick={() => onNavigate("/jobcost")}
            >
              Go to Job Costing
            </button>
            {continueTo && (
              <button
                type="button"
                className="arr-cta--text"
                onClick={() => onNavigate(continueTo.path)}
              >
                Continue to {continueTo.label} →
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* Tile drill-down — the same item-list modal the intro walkthrough and
          Reports page use. It portals to <body> and stacks above the arrival. */}
      <MetricDrilldownModal
        metric={metric}
        items={payload?.items ?? []}
        window={range ?? undefined}
        subtitle={range ? rangeLabel(range) : ""}
        backLabel="Dashboard"
        onClose={() => setMetric(null)}
      />
    </motion.div>
  )
}
