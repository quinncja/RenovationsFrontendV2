import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Home } from "lucide-react"
import Logo from "../../../core/components/Logo"
import JobcostIcon from "../../../core/components/JobcostIcon"
import { LAYOUT_TEMPLATES, type LayoutTemplate } from "../config/layoutTemplates"
import { SECTION_REGISTRY } from "../config/sectionRegistry"
import type { SectionId } from "../types/dashboardLayout"

// Full-screen intro (phases 0–3) of the admin onboarding flow — the promoted
// successor to WelcomeWalkthrough. Shares the daily-recap arrival's motion
// vocabulary (height-opening reveals for lines and slots, the bobbing chevron,
// the copper CTA), but phase BODIES swap differently: they crossfade in place
// while the body area tweens its measured height directly old → new. Neither
// simultaneous collapse+open (drags the incoming body up by the outgoing's
// full height) nor chained collapse-then-open (the column visibly deflates and
// reinflates) survived contact with real content — both were tried. The host
// owns the whole-takeover AnimatePresence exit, the phase state, and the
// layout commit.

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

// The spring for the hero card's shrink morph (beat 0 → 1).
const MORPH_SPRING = { type: "spring", visualDuration: 0.65, bounce: 0.12 } as const
// The nav → hero growth uses a near-critically-damped variant: at that scale
// (a 78px card swelling to fill the stage) MORPH_SPRING's bounce reads as
// wobble rather than life.
const GROW_SPRING = { type: "spring", visualDuration: 0.6, bounce: 0.02 } as const

// 0 welcome · 1 getting around (the two main pages) · 2 dashboard sections ·
// 3 layout pick.
export type AdminIntroPhase = 0 | 1 | 2 | 3

export interface AdminIntroScreensProps {
  phase: AdminIntroPhase
  /** Advance 0→1→2→3 (phase 2 spends its first click on its internal beat). */
  onAdvance: () => void
  /** "Skip intro" on phases 0–2 — jumps straight to phase 3 (the required layout pick). */
  onSkip: () => void
  /** Fired by the "Enter the Dashboard" CTA with the selected card. Host owns
   *  the commit; you only report the choice. */
  onPick: (template: LayoutTemplate) => void
}

export function AdminIntroScreens({ phase, onAdvance, onSkip, onPick }: AdminIntroScreensProps): ReactNode {
  const reduced = !!useReducedMotion()

  // Phase-2 selection: clicking a card marks it; the copper "Enter the
  // Dashboard" CTA (mirroring the recap's "Go to Dashboard") does the commit.
  const [picked, setPicked] = useState<LayoutTemplate | null>(null)

  // Phase 2 runs two beats: 0 — one hero section introduces the concept;
  // 1 — it shrinks into the stack and the traversal demo plays. The arrow's
  // first phase-2 click steps the beat; the next hands the phase back to the host.
  const [beat, setBeat] = useState(0)
  // Advance clicks are rate-limited: a double-click would skip a whole section
  // sight unseen. 1.25s covers the longest transition (the nav→hero click-in
  // choreography runs 1.2s before its morph even starts).
  const lastAdvanceRef = useRef(0)
  const advance = () => {
    const now = performance.now()
    if (now - lastAdvanceRef.current < 1250) return
    lastAdvanceRef.current = now
    if (phase === 2 && beat === 0) setBeat(1)
    else onAdvance()
  }

  // Phase bodies swap by crossfading IN PLACE: the outgoing body pops out of
  // flow (AnimatePresence popLayout) the instant it starts exiting, so the
  // incoming body sits at its final position from its first frame — no riding
  // up under a collapsing sibling, no deflate-and-reinflate. The body area
  // (below) owns the height story: it tweens its measured height directly
  // old → new, one monotone move.
  const phaseIn = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.35, delay: reduced ? 0 : 0.15 } },
    // Exits are FAST: the popped-out ghost overlaps the incoming phase's
    // content in place, and two translucent layers double-exposed there reads
    // as shimmer — the outgoing body must be gone before the incoming content
    // (delays ≥ 0.15s) becomes prominent.
    exit: { opacity: 0, transition: { duration: reduced ? 0.15 : 0.2 } },
  }

  // Measured height of the live phase body. The container animates height only
  // WHILE a phase swap is in flight (~the crossfade window); the rest of the
  // time it follows the content instantly, so in-phase animations (the beat-1
  // shrink morph, the demo-below reveal) keep their own spring/ease physics
  // instead of being chased by a second easing curve.
  const [measureRef, bodyH] = useMeasuredHeight()
  const [swapping, setSwapping] = useState(false)
  const [prevPhase, setPrevPhase] = useState(phase)
  if (prevPhase !== phase) {
    // Render-time state adjustment (the supported prev-props pattern) so the
    // very first post-change frame already eases.
    setPrevPhase(phase)
    setSwapping(true)
  }
  useEffect(() => {
    if (!swapping) return
    const t = window.setTimeout(() => setSwapping(false), 650)
    return () => window.clearTimeout(t)
  }, [swapping, phase])

  // Phases 2 and 3 share one title — same key, so the header simply holds
  // steady across that boundary instead of swapping.
  const headerText = phase === 0 ? "Welcome Aboard" : phase === 1 ? "Getting around" : "The Dashboard"

  // The welcome screen reuses the daily recap's opening sequence verbatim
  // (IntroArrival's HERO_AT): logo and title rise together at 0.9s, the sub
  // line at 2.0s, the advance arrow at 3.6s — same 0.8s rise on EASE.
  const HERO_AT = reduced ? { logo: 0, title: 0, sub: 0, arrow: 0.2 } : { logo: 0.9, title: 0.9, sub: 2.0, arrow: 3.6 }
  const heroRise = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 18 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0.25 : 0.8, ease: EASE, delay },
    },
  })

  return (
    <motion.div
      className="adm-screen"
      role="dialog"
      aria-label="Set up your home page"
      // Host drives the whole-takeover exit via AnimatePresence. Mirrors the
      // daily recap's exit exactly (DailyArrival's root): the screen MELTS —
      // fade + slight scale + blur — while the coachmark's blurred backdrop
      // rises beneath it, so the veil over the dashboard reads as one
      // continuous handoff instead of fade-to-crisp-then-blur.
      exit={{ opacity: 0, scale: 1.015, filter: "blur(14px)" }}
      transition={{ duration: 0.55, ease: "easeIn" }}
      // blur(0px) gives the exit filter an animatable starting value.
      style={{ filter: "blur(0px)", willChange: "opacity, transform, filter" }}
    >
      <div className="adm-shell">
        {/* Persistent chrome — the logo mounts once and rides across all
            phases. The header morphs the recap way: the outgoing title
            collapses its height while the incoming opens beneath it, one
            continuous move in the same slot. */}
        <motion.div className="adm-logo adm-logo--persist" {...heroRise(HERO_AT.logo)}>
          <Logo size={48} />
        </motion.div>

        {/* NOTE: no initial={false} on these AnimatePresences — PresenceContext
            propagates it to the WHOLE subtree on first render, which silently
            killed the welcome hero's own entrance animations. First-mount
            behavior is handled per element instead. */}
        <div className="adm-header">
          <AnimatePresence>
            <motion.h1
              key={headerText}
              className="adm-header-text"
              // The first title ("Welcome") rises on the recap's hero beat,
              // together with the logo; every later title opens its height.
              initial={phase === 0 ? { opacity: 0, y: reduced ? 0 : 18 } : { height: 0, opacity: 0 }}
              animate={{
                height: "auto",
                opacity: 1,
                y: 0,
                transition:
                  phase === 0
                    ? { duration: reduced ? 0.25 : 0.8, ease: EASE, delay: HERO_AT.title }
                    : {
                        height: { duration: reduced ? 0.2 : 0.45, ease: EASE },
                        opacity: { duration: 0.3, delay: reduced ? 0 : 0.12 },
                      },
              }}
              exit={{
                height: 0,
                opacity: 0,
                // Exit height duration MUST equal the enter's: the collapse
                // and open run summed in one slot, and a faster collapse dips
                // the total height mid-swap — everything below bobs up and
                // settles back down.
                transition: { height: { duration: reduced ? 0.2 : 0.45, ease: EASE }, opacity: { duration: 0.2 } },
              }}
              style={{ overflow: "hidden" }}
            >
              {headerText}
            </motion.h1>
          </AnimatePresence>
        </div>

        <motion.div
          className="adm-body-area"
          // Clip while the height is in motion; the CSS pads the clip box out
          // (with compensating negative margins) so card shadows never shear.
          style={{ overflow: "hidden" }}
          animate={bodyH == null ? undefined : { height: bodyH }}
          transition={
            swapping ? { duration: reduced ? 0.2 : 0.5, ease: EASE } : { duration: 0 }
          }
        >
          <div className="adm-body-measure" ref={measureRef}>
            <AnimatePresence mode="popLayout">
            {phase === 0 && (
              // The welcome body is always the FIRST phase: its sub line
              // self-fades on the hero timing; it only fades away when phase 1
              // takes over.
              <motion.div
                key="p0"
                className="adm-phase"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                style={{ width: "100%" }}
              >
                <motion.p className="adm-sub" {...heroRise(HERO_AT.sub)}>
                  Here&apos;s a quick run-through on how our system works.
                </motion.p>
              </motion.div>
            )}

            {(phase === 1 || phase === 2) && (
              // Phases 1 and 2 are ONE continuous scene (same key — the
              // wrapper never remounts across the boundary): the navbar mock's
              // Dashboard preview IS the section stack in miniature, and each
              // advance is a numeric morph of the same elements — mini stack →
              // Business Development hero → traversal stack.
              <motion.div
                key="p12"
                className="adm-phase adm-phase--explain"
                {...phaseIn}
                style={{ width: "100%" }}
              >
                <JourneyExplainer
                  stage={phase === 1 ? "nav" : beat === 0 ? "hero" : "stack"}
                  reduced={reduced}
                />
              </motion.div>
            )}

            {phase === 3 && (
              <motion.div
                key="p3"
                className="adm-phase adm-phase--choose"
                {...phaseIn}
                style={{ width: "100%" }}
              >
                {/* This body is at its final position from frame one (the
                    outgoing phase is popped out of flow), so content simply
                    fades in place: the note rides the wrapper's fade (0.15s),
                    the cards stagger in behind it, each card's preview bars
                    behind their card, the hint last. */}
                <p className="adm-choose-note">
                  Your dashboard is entirely customizable.
                  <br />
                  For now, select a prebuilt layout to get started.
                </p>
                <div className="adm-choose-cards" role="radiogroup" aria-label="Layout templates">
                  {/* Cards stagger in left to right as pure fades — no
                      movement, no scaling. popLayout means this grid is at its
                      final position from frame one; the fades start once the
                      traversal demo's quick fade-out has cleared the spot. */}
                  {LAYOUT_TEMPLATES.map((t, i) => (
                    <motion.button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={picked?.id === t.id}
                      className={`adm-choose-card${picked?.id === t.id ? " adm-choose-card--selected" : ""}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={
                        reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: 0.25 + i * 0.1 }
                      }
                      onClick={() => setPicked(t)}
                    >
                      <TemplatePreview template={t} cardIndex={i} reduced={reduced} />
                      <span className="adm-choose-card-name">{t.name}</span>
                      <span className="adm-choose-card-desc">{t.description}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Persistent footer slot (fixed height, absolute stacking). Phases
            0–2: the bobbing advance arrow. Phase 3: once a card is picked the
            copper "Enter the Dashboard" CTA takes the slot — the same closing
            beat as the daily recap. */}
        <div className="adm-foot">
          <AnimatePresence>
            {phase < 3 ? (
              <motion.div
                key="arrow"
                className="adm-foot-inner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ duration: 0.5, ease: EASE, delay: phase === 0 ? HERO_AT.arrow : 0 }}
              >
                <motion.button
                  type="button"
                  className="adm-advance"
                  aria-label="Continue"
                  whileHover={reduced ? undefined : { scale: 1.06 }}
                  whileTap={reduced ? undefined : { scale: 0.94 }}
                  onClick={advance}
                >
                  <motion.span
                    className="adm-advance-chevron"
                    animate={reduced ? undefined : { y: [0, 3, 0] }}
                    transition={reduced ? undefined : { repeat: Infinity, duration: 1.9, ease: "easeInOut" }}
                  >
                    <ChevronDown />
                  </motion.span>
                </motion.button>
              </motion.div>
            ) : picked ? (
              <motion.div
                key="enter"
                className="adm-foot-inner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ duration: reduced ? 0.2 : 0.45, ease: EASE, delay: 0.15 }}
              >
                <motion.button
                  type="button"
                  className="primary-button arr-cta adm-enter"
                  whileHover={reduced ? undefined : { scale: 1.03 }}
                  whileTap={reduced ? undefined : { scale: 0.97 }}
                  onClick={() => onPick(picked)}
                >
                  Enter the Dashboard
                </motion.button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Skip straight to the required layout pick — offered only while there's
          an intro left to skip. */}
      {phase < 3 && (
        <button type="button" className="adm-skip" onClick={onSkip}>
          Skip intro
        </button>
      )}
    </motion.div>
  )
}

// Observes an element's rendered height. Callback ref so a remount re-attaches
// the observer automatically; null until first measure (the body area renders
// natural height until then).
function useMeasuredHeight(): [(el: HTMLDivElement | null) => void, number | null] {
  const [h, setH] = useState<number | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    roRef.current = ro
    setH(el.offsetHeight)
  }, [])
  return [ref, h]
}

// ═══ Phases 1–2 — one continuous scene ════════════════════════════════════════
// Phase 1 ("Getting around"): the real navbar in miniature — logo, the two
// focal destinations as real labeled rows, shimmer pills below — with a
// scripted cursor hovering the two in a slow loop. The Dashboard preview
// beside it IS the section stack (the traversal mock, in mini); hovering Job
// Costing overlays its cost table. Phase 2 beat 0: the navbar slides shut and
// the mini stack's top card GROWS into the Business Development hero — the
// same numeric-morph language the hero later uses to shrink into the
// traversal stack (beat 1). One component stays mounted across all three
// stages, so every boundary is a morph of the same elements, never a swap.

type JourneyStage = "nav" | "hero" | "stack"

const NAV_HOVER_MS = 1700
// Cursor y per focal row: mock padding (8) + logo row (20) + divider band
// (~14) + row * (20 row + 4 gap), aimed a touch above row center.
const navCursorY = (row: number) => 46 + row * 24

function JourneyExplainer({ stage, reduced }: { stage: JourneyStage; reduced: boolean }) {
  const line =
    stage === "nav" ? (
      <>
        There are two main pages: the Dashboard and Job Costing board.
        <br />
        Both live at the top of the navigation bar, on the left of your screen.
      </>
    ) : stage === "hero" ? (
      <>
        The dashboard is your home page.
        <br />
        It&apos;s built of sections that group together related widgets.
      </>
    ) : (
      <>
        Each section focuses your attention on one part of the business.
        <br />
        Move between them with your arrow keys, the rail, or by scrolling.
      </>
    )

  return (
    <div className="adm-explain">
      {/* The copy swaps the recap way: outgoing line collapses while the
          incoming opens in its place. */}
      <div className="adm-explain-lines">
        <AnimatePresence initial={false}>
          <motion.p
            key={stage}
            className="adm-explain-line"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: {
                height: { duration: reduced ? 0.2 : 0.45, ease: EASE },
                opacity: { duration: 0.3, delay: reduced ? 0 : 0.12 },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              // Same duration as the enter (see the header): a faster
              // collapse dips the summed line height and the demo below bobs.
              transition: { height: { duration: reduced ? 0.2 : 0.45, ease: EASE }, opacity: { duration: 0.18 } },
            }}
            style={{ overflow: "hidden" }}
          >
            {line}
          </motion.p>
        </AnimatePresence>
      </div>
      <JourneyDemo stage={stage} reduced={reduced} />
    </div>
  )
}

// ── The scripted demo ──
// One looping script of full-state frames (no deltas, so a loop restart or a
// re-render can't drift). The modes run in sequence — scroll, arrow keys, rail
// — and the card index flows continuously across mode boundaries AND across
// the loop seam, so the carousel never snaps.

type DemoMode = "scroll" | "keys" | "rail"

const MODE_LABEL: Record<DemoMode, string> = {
  scroll: "By scroll",
  keys: "By arrow keys",
  rail: "By rail",
}

const CAROUSEL_CARDS = 5

interface DemoFrame {
  mode: DemoMode
  /** Card the carousel centers on. */
  a: number
  /** Hold before the next frame (ms). */
  ms: number
  /** Mouse wheel nudge: 1 down, -1 up, 0 resting. */
  wheel: number
  /** Which keycap is depressed. */
  key: "up" | "down" | null
  /** Rail state: open (labels out), cursor presence/row, and the clicked dot. */
  railOpen: boolean
  cursorOn: boolean
  cursorRow: number
  clickRow: number | null
}

const FRAME_REST: Omit<DemoFrame, "mode" | "a" | "ms"> = {
  wheel: 0,
  key: null,
  railOpen: false,
  cursorOn: false,
  cursorRow: 0,
  clickRow: null,
}

function frame(mode: DemoMode, a: number, ms: number, over: Partial<DemoFrame> = {}): DemoFrame {
  return { mode, a, ms, ...FRAME_REST, ...over }
}

// Starts AND ends on card 0 — the hero card the beat-0 mock shrinks into — so
// both the morph handoff and the loop seam are continuous. TWO movements per
// mode: arrow keys (2 presses), rail (2 clicks), scroll (2 nudges); the whole
// script loops forever.
const DEMO: DemoFrame[] = [
  // Arrow keys — two presses walk down the stack.
  frame("keys", 0, 950),
  frame("keys", 1, 430, { key: "down" }),
  frame("keys", 1, 820),
  frame("keys", 2, 430, { key: "down" }),
  frame("keys", 2, 950),
  // Rail — the cursor arrives, the rail wakes and OPENS (labels slide out),
  // then two dot clicks jump around the stack.
  frame("rail", 2, 800),
  frame("rail", 2, 1000, { cursorOn: true, cursorRow: 4, railOpen: true }),
  frame("rail", 4, 380, { cursorOn: true, cursorRow: 4, railOpen: true, clickRow: 4 }),
  frame("rail", 4, 850, { cursorOn: true, cursorRow: 4, railOpen: true }),
  frame("rail", 4, 750, { cursorOn: true, cursorRow: 2, railOpen: true }),
  frame("rail", 2, 380, { cursorOn: true, cursorRow: 2, railOpen: true, clickRow: 2 }),
  frame("rail", 2, 700, { cursorOn: true, cursorRow: 2, railOpen: true }),
  frame("rail", 2, 1000),
  // Scroll — two wheel nudges back to the top.
  frame("scroll", 2, 800),
  frame("scroll", 1, 480, { wheel: -1 }),
  frame("scroll", 1, 800),
  frame("scroll", 0, 480, { wheel: -1 }),
  frame("scroll", 0, 1000),
]

// The demo at rest (beat 0, or reduced motion): hero card, every control idle.
const REST_FRAME: DemoFrame = frame("keys", 0, 0)

// ── The mock's content ──
// The hero is Business Development with its real widget set (matching the
// dashboard); its siblings carry the other section titles so the whole stack
// reads as the actual home page in miniature.
const HERO_WIDGETS: { title: string; kind: "figure" | "chart" }[] = [
  { title: "Current Year Revenue", kind: "figure" },
  { title: "All-Time Revenue", kind: "figure" },
  { title: "Annual Revenue Trend", kind: "chart" },
  { title: "Cumulative Revenue Growth", kind: "chart" },
]
const SIBLING_TITLES = ["Business Performance", "P&L Trends", "Cash & Billing", "Business Relations"]

// ── Geometry ──
// The viewport height is CONSTANT across the morph: the beat-0 hero card fills
// it exactly, then shrinks to CARD_H while the track re-centers — so the page
// never gains or loses height at the moment of the morph.
const CARD_H = 88
const CARD_GAP = 10
const CARD_STEP = CARD_H + CARD_GAP
const VIEW_H = CARD_H * 2 + CARD_GAP * 2 // full card + 2 × (half card + gap)
const HERO_W = 384
const STACK_W = 176

// Nav stage: the slim navbar mock and the two page previews all share ONE
// height, so the row reads as a navbar beside a page. NAV_VIEW_H must equal
// .adm-navmock's natural height (padding + logo + divider + 5 rows + gaps).
const NAV_W = 112
const NAV_GAP = 22
const NAV_FRAME_W = 158
const NAV_VIEW_H = 166
const NAV_CARD_H = 78

// The viewport mask fades the peeking half-cards at the edges. It ANIMATES
// between a no-op gradient (the hero must not fade at its edges), a
// bottom-only fade (nav stage — the mini stack is a page seen from the top),
// and the both-edges fade; all strings share the same stop structure so
// framer can interpolate them.
const MASK_FLAT = "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 78%, rgba(0,0,0,1) 100%)"
const MASK_FADE = "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 78%, rgba(0,0,0,0) 100%)"
const MASK_BOTTOM = "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 78%, rgba(0,0,0,0) 100%)"

function JourneyDemo({ stage, reduced }: { stage: JourneyStage; reduced: boolean }) {
  // The nav → hero boundary is CHOREOGRAPHED, so the demo's visual stage can
  // lag the host's: on the advance click the copy swaps at once (outside this
  // component), while in here the cursor first travels to the Dashboard row,
  // CLICKS it (press dip, then the row turning copper-active — the real
  // navbar's navigation grammar), and only then does the scene morph. Other
  // boundaries follow the host immediately.
  const [visual, setVisual] = useState<JourneyStage>(stage)
  const [pressed, setPressed] = useState(false)
  const [navigated, setNavigated] = useState(false)
  const nav = visual === "nav"
  const hero = visual === "hero"

  // Nav-stage hover loop: the cursor alternates between the two focal rows.
  // Runs only while the HOST is still on the nav phase — the choreography
  // freezes the cursor wherever it takes over.
  const [focus, setFocus] = useState<0 | 1>(0)
  useEffect(() => {
    if (stage !== "nav" || reduced) return
    let r: 0 | 1 = 0
    let timer = 0
    const tick = () => {
      r = r === 0 ? 1 : 0
      setFocus(r)
      timer = window.setTimeout(tick, NAV_HOVER_MS)
    }
    // Let the phase settle and the cursor arrive before the first move.
    timer = window.setTimeout(tick, NAV_HOVER_MS + 500)
    return () => window.clearTimeout(timer)
  }, [stage, reduced])

  // Render-time sync (the supported prev-props pattern): non-choreographed
  // boundaries follow the host immediately; nav→hero holds `visual` back and
  // parks the cursor on the Dashboard row for the click choreography below.
  const choreo = stage === "hero" && visual === "nav" && !reduced
  if (stage !== visual && !choreo) setVisual(stage)
  if (choreo && focus !== 0) setFocus(0)

  // The click choreography itself: an unhurried beat while the copy swaps and
  // the cursor settles on Dashboard (0.8s), press (0.2s), row goes
  // copper-active, morph (1.2s from the advance click).
  useEffect(() => {
    if (!choreo) return
    const t1 = window.setTimeout(() => setPressed(true), 800)
    const t2 = window.setTimeout(() => {
      setPressed(false)
      setNavigated(true)
    }, 1000)
    const t3 = window.setTimeout(() => setVisual("hero"), 1200)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [choreo])

  // Traversal loop (stack stage only). Recursive setTimeout so each frame
  // holds for its own dwell, looping forever.
  const [frameIndex, setFrameIndex] = useState(0)
  const playing = visual === "stack" && !reduced
  useEffect(() => {
    if (!playing) return
    let i = 0
    let timer = 0
    const tick = () => {
      setFrameIndex(i)
      const ms = DEMO[i].ms
      i = (i + 1) % DEMO.length
      timer = window.setTimeout(tick, ms)
    }
    // Let the shrink land before the traversal starts.
    timer = window.setTimeout(tick, 900)
    return () => window.clearTimeout(timer)
  }, [playing])

  const f = playing ? DEMO[frameIndex] : REST_FRAME

  // One spring for every morphing dimension so each stage boundary moves as
  // one body — the growth into the hero damped, the shrink into the stack
  // lively. Per-stage geometry, all numbers:
  const morph = reduced ? { duration: 0 } : hero ? GROW_SPRING : MORPH_SPRING
  const frameW = nav ? NAV_FRAME_W : hero ? HERO_W : STACK_W
  const viewH = nav ? NAV_VIEW_H : VIEW_H
  const heroH = nav ? NAV_CARD_H : hero ? VIEW_H : CARD_H
  const sibH = nav ? NAV_CARD_H : CARD_H
  const titlePx = hero ? 13 : 7
  const heroBlockH = nav ? 14 : hero ? 64 : 20
  const sibBlockH = nav ? 14 : 20
  // Nav/hero anchor the page to its top (card 0 at y 0); the traversal
  // centers the active card.
  const trackY = nav || hero ? 0 : (VIEW_H - CARD_H) / 2 - f.a * CARD_STEP
  const mask = nav ? MASK_BOTTOM : hero ? MASK_FLAT : MASK_FADE

  return (
    <div className="adm-demo-inner" aria-hidden="true">
      <div className="adm-journey">
        {/* The navbar mock slides shut (width + fade) when the scene moves on
            to the hero — the page it pointed at takes the stage. */}
        <motion.div
          className="adm-navmock-wrap"
          initial={false}
          animate={{ width: nav ? NAV_W : 0, marginRight: nav ? NAV_GAP : 0, opacity: nav ? 1 : 0 }}
          transition={{
            width: morph,
            marginRight: morph,
            opacity: { duration: reduced ? 0 : 0.35, ease: EASE },
          }}
        >
          <div className="adm-navmock">
            <div className="adm-navlogo">
              <Logo size={16} />
              <span className="adm-skel-pill" style={{ width: 48 }} />
            </div>
            <div className="adm-navdivider" />
            <div
              className={`adm-navrow adm-navrow--real${
                nav && !reduced && focus === 0 && !navigated ? " adm-navrow--hover" : ""
              }${pressed ? " adm-navrow--pressed" : ""}${navigated ? " adm-navrow--active" : ""}`}
            >
              <Home size={10} />
              <span className="adm-navrow-label">Dashboard</span>
            </div>
            <div className={`adm-navrow adm-navrow--real${nav && !reduced && focus === 1 ? " adm-navrow--hover" : ""}`}>
              <JobcostIcon size={10} />
              <span className="adm-navrow-label">Job Costing</span>
            </div>
            {[40, 32, 46].map((w) => (
              <div key={w} className="adm-navrow">
                <span className="adm-skel-dot" />
                <span className="adm-skel-pill" style={{ width: w }} />
              </div>
            ))}
            {nav && !reduced && (
              <motion.span
                className="adm-cursor adm-navcursor"
                initial={{ x: 22, y: 110, opacity: 0 }}
                animate={{ x: 0, y: navCursorY(focus), opacity: 1, scale: pressed ? 0.82 : 1 }}
                transition={{
                  opacity: { duration: 0.4, ease: EASE, delay: 0.5 },
                  scale: { type: "spring", visualDuration: 0.18, bounce: 0.3 },
                  default: { type: "spring", visualDuration: 0.5, bounce: 0 },
                }}
              >
                <CursorArrow />
              </motion.span>
            )}
          </div>
        </motion.div>

        <div className="adm-journey-stage">
          <motion.div className="adm-demo-frame" initial={false} animate={{ width: frameW }} transition={morph}>
            <motion.div
              className="adm-carousel"
              initial={false}
              animate={{ height: viewH, maskImage: mask }}
              transition={{
                height: morph,
                maskImage: reduced ? { duration: 0 } : { duration: 0.6, ease: EASE },
              }}
            >
              <motion.div className="adm-carousel-track" initial={false} animate={{ y: trackY }} transition={morph}>
                {/* The hero card — Business Development. In the nav stage it's
                    the top card of the mini page; on advance it GROWS into the
                    dressed-up hero (real widget titles, ghost figures, revenue
                    curves); on the next it shrinks into the traversal stack.
                    Every dimension morphs NUMERICALLY between the three. */}
                <motion.div
                  className="adm-skel-card adm-skel-card--hero"
                  initial={false}
                  animate={{
                    height: heroH,
                    opacity: nav || hero || f.a === 0 ? 1 : 0.35,
                  }}
                  transition={{ height: morph, opacity: { duration: 0.45, ease: EASE } }}
                >
                  <motion.span
                    className="adm-hero-title"
                    initial={false}
                    animate={{ fontSize: titlePx }}
                    transition={morph}
                  >
                    Business Development
                  </motion.span>
                  <div className="adm-skel-grid">
                    {HERO_WIDGETS.map((w) => (
                      <motion.span
                        key={w.title}
                        className="adm-skel-block adm-widget"
                        initial={false}
                        animate={{ height: heroBlockH }}
                        transition={morph}
                      >
                        <motion.span
                          className="adm-widget-detail"
                          initial={false}
                          animate={{ opacity: hero ? 1 : 0 }}
                          transition={{ duration: reduced ? 0 : 0.3, ease: EASE }}
                        >
                          <span className="adm-widget-title">{w.title}</span>
                          {w.kind === "figure" ? (
                            <span className="adm-widget-figure">$0,000,000</span>
                          ) : (
                            <RevenueCurve />
                          )}
                        </motion.span>
                      </motion.span>
                    ))}
                  </div>
                </motion.div>

                {/* The sibling sections — titled like the hero's landed state.
                    Present in the nav-stage mini page, hidden while the hero
                    has the stage, back for the traversal. */}
                {SIBLING_TITLES.map((title, idx) => {
                  const i = idx + 1
                  return (
                    <motion.div
                      key={title}
                      className="adm-skel-card"
                      initial={false}
                      animate={{
                        height: sibH,
                        opacity: hero ? 0 : nav ? 0.55 : i === f.a ? 1 : 0.35,
                      }}
                      transition={{ height: morph, opacity: { duration: 0.45, ease: EASE } }}
                    >
                      <span className="adm-card-title">{title}</span>
                      <div className="adm-skel-grid">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <motion.span
                            key={j}
                            className="adm-skel-block"
                            initial={false}
                            animate={{ height: sibBlockH }}
                            transition={morph}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
            </motion.div>

            {/* The rail arrives once the stack exists, just off its right edge —
                where it lives on the real dashboard. */}
            <AnimatePresence>
              {visual === "stack" && (
                <motion.div
                  className="adm-demo-rail"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  // Explicit exit transition: without it the entrance delay above
                  // leaks into the exit and the rail lingers over the morph.
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: 0.45 }}
                >
                  <SectionRail
                    active={f.a}
                    open={f.railOpen}
                    clickRow={f.clickRow}
                    cursorOn={f.cursorOn}
                    cursorRow={f.cursorRow}
                    awake={f.cursorOn}
                    reduced={reduced}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Job Costing's page — a cost table in skeleton, overlaying the mini
              dashboard while its nav row is hovered. Same footprint as the
              mini page, so the swap is a pure crossfade. */}
          <motion.div
            className="adm-navjobcost"
            initial={false}
            animate={{ opacity: nav && !reduced && focus === 1 ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.3, ease: EASE }}
            style={{ width: NAV_FRAME_W, height: NAV_VIEW_H }}
          >
            <span className="adm-card-title">Job Costing</span>
            <div className="adm-navtable">
              {[100, 78, 88, 64, 92, 70].map((w) => (
                <span key={w} className="adm-skel-block adm-navtable-row" style={{ width: `${w}%` }} />
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* The input control and its label open beneath the stack with the morph
          (height reveal, recap style) and hold a fixed slot from then on. */}
      <AnimatePresence initial={false}>
        {visual === "stack" && (
          <motion.div
            key="below"
            className="adm-demo-below"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: {
                height: { duration: reduced ? 0.2 : 0.5, ease: EASE },
                opacity: { duration: 0.35, delay: reduced ? 0 : 0.2 },
              },
            }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div className="adm-demo-control">
              <AnimatePresence mode="wait">
                {f.mode === "scroll" && (
                  <motion.div
                    key="mouse"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                  >
                    <MouseGlyph dir={f.wheel} reduced={reduced} />
                  </motion.div>
                )}
                {f.mode === "keys" && (
                  <motion.div
                    key="keys"
                    className="adm-keys"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                  >
                    <KeyCap dir="up" pressed={f.key === "up"} reduced={reduced} />
                    <KeyCap dir="down" pressed={f.key === "down"} reduced={reduced} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="adm-demo-label-slot">
              <AnimatePresence>
                <motion.span
                  key={f.mode}
                  className="adm-demo-label"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  {MODE_LABEL[f.mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── The input controls ──

function KeyCap({ dir, pressed, reduced }: { dir: "up" | "down"; pressed: boolean; reduced: boolean }) {
  return (
    <motion.div
      className={`adm-keycap${pressed ? " adm-keycap--pressed" : ""}`}
      animate={pressed && !reduced ? { y: 2, scale: 0.94 } : { y: 0, scale: 1 }}
      transition={reduced ? { duration: 0 } : { type: "spring", visualDuration: 0.14, bounce: 0.35 }}
    >
      <KeyChevron dir={dir} />
    </motion.div>
  )
}

function MouseGlyph({ dir, reduced }: { dir: number; reduced: boolean }) {
  const active = dir !== 0 && !reduced
  return (
    <div className="adm-mouse">
      <motion.span
        className="adm-mouse-wheel"
        animate={active ? { y: dir > 0 ? [0, 4, 0] : [0, -4, 0] } : { y: 0 }}
        transition={active ? { duration: 0.4, ease: "easeInOut" } : { duration: 0.2 }}
      />
    </div>
  )
}

// Section rail — the real SectionNav in miniature. At rest it's a faded,
// see-through capsule of dots (copper on the active row); when the scripted
// cursor hovers it, it wakes (fills white) and OPENS — the capsule widens and
// a label slides out to the LEFT of every dot, exactly like the real rail —
// then the cursor clicks dots to jump sections.
function SectionRail({
  active,
  open,
  clickRow,
  cursorOn,
  cursorRow,
  awake,
  reduced,
}: {
  active: number
  open: boolean
  clickRow: number | null
  cursorOn: boolean
  cursorRow: number
  awake: boolean
  reduced: boolean
}) {
  const morph = reduced
    ? { duration: 0 }
    : ({ type: "spring", visualDuration: 0.3, bounce: open ? 0.2 : 0 } as const)
  // Dot centers, from the open card's top: 8px pad + row*20 (12px row + 8 gap) + 6.
  const cursorY = 14 + cursorRow * 20
  return (
    <div className="adm-raildemo">
      <motion.div
        // Right-anchored: the dots stay put on the right (near the cards), and
        // the label expands to their LEFT on open — exactly like the real rail.
        className={`adm-railcard${open ? " adm-railcard--open" : ""}${awake ? " adm-railcard--awake" : ""}`}
        animate={{ width: open ? 92 : 26, borderRadius: open ? 12 : 22 }}
        transition={morph}
      >
        {Array.from({ length: CAROUSEL_CARDS }).map((_, i) => (
          <div key={i} className={`adm-railrow${i === active ? " adm-railrow--active" : ""}`}>
            <AnimatePresence initial={false}>
              {open && (
                <motion.span
                  key="label"
                  className="adm-raillabel"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 52 }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.22, ease: EASE }}
                />
              )}
            </AnimatePresence>
            <span className="adm-raildot">
              {clickRow === i && !reduced && (
                <motion.span
                  className="adm-raildot-pulse"
                  initial={{ opacity: 0.55, scale: 0.5 }}
                  animate={{ opacity: 0, scale: 2.6 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              )}
            </span>
          </div>
        ))}
      </motion.div>
      {cursorOn && (
        <motion.span
          className="adm-cursor"
          initial={{ x: 16, y: 96, opacity: 0 }}
          animate={{ x: 0, y: cursorY - 2, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", visualDuration: 0.5, bounce: 0 }}
        >
          <CursorArrow />
        </motion.span>
      )}
    </div>
  )
}

// The soft rising revenue curve the edit-mode chart widgets show — stroke with
// a light fill beneath, copper at low opacity.
function RevenueCurve() {
  return (
    <svg className="adm-widget-curve" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 27 C 14 25, 20 15, 32 16 S 50 20, 62 12 S 84 2, 100 3 L 100 30 L 0 30 Z"
        fill="var(--primary-color)"
        opacity="0.12"
      />
      <path
        d="M0 27 C 14 25, 20 15, 32 16 S 50 20, 62 12 S 84 2, 100 3"
        fill="none"
        stroke="var(--primary-color)"
        strokeOpacity="0.45"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function KeyChevron({ dir }: { dir: "up" | "down" }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  )
}

function CursorArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 3l14 8-6 1.4L10 19 5 3z"
        fill="currentColor"
        stroke="var(--card-color)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ═══ Phase 2 — template preview ═══════════════════════════════════════════════
// A calm, legible preview: the template's OWN section order, rendered once as
// labeled mini bars that cascade in top-down (no looping reshuffle — the old
// reorder loop read as random churn across three cards). The two lead bars
// carry a soft copper tint, echoing each template's "…first" description.

// Deterministic per-section widths so the bars read as distinct sections.
const BAR_WIDTH: Partial<Record<SectionId, number>> = {
  reports: 72,
  businessDevelopment: 90,
  businessPerformance: 84,
  financialTrends: 60,
  businessFinancials: 58,
  businessRelations: 78,
  estimationPerformance: 70,
}

function TemplatePreview({
  template,
  cardIndex,
  reduced,
}: {
  template: LayoutTemplate
  cardIndex: number
  reduced: boolean
}) {
  return (
    <div className="adm-preview" aria-hidden="true">
      {template.sectionOrder.map((id, i) => (
        <motion.div
          key={id}
          className={`adm-preview-bar${i < 2 ? " adm-preview-bar--lead" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={
            reduced
              ? { duration: 0 }
              : // Rides in just behind its card's fade (cards start at
                // 0.25 + cardIndex * 0.1 — keep these in step).
                { duration: 0.4, ease: EASE, delay: 0.4 + cardIndex * 0.1 + i * 0.05 }
          }
          style={{ width: `${BAR_WIDTH[id] ?? 75}%` }}
        >
          <span className="adm-preview-bar-label">{SECTION_REGISTRY[id].title}</span>
        </motion.div>
      ))}
    </div>
  )
}

function ChevronDown() {
  return (
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
  )
}
