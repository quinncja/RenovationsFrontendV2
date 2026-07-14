import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import Logo from "../../../core/components/Logo"
import { LAYOUT_TEMPLATES, type LayoutTemplate } from "../config/layoutTemplates"
import { SECTION_REGISTRY } from "../config/sectionRegistry"
import type { SectionId } from "../types/dashboardLayout"

// Full-screen intro (phases 0–2) of the admin onboarding flow — the promoted
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

// One spring family for every reshaping morph (the hero card's shrink, the
// section stack's handoff into the layout options) so the intro's container
// moves share one physical character.
const MORPH_SPRING = { type: "spring", visualDuration: 0.65, bounce: 0.12 } as const

export type AdminIntroPhase = 0 | 1 | 2

export interface AdminIntroScreensProps {
  phase: AdminIntroPhase
  /** Advance 0→1 and 1→2 (phase 1 spends its first click on its internal beat). */
  onAdvance: () => void
  /** "Skip intro" on phases 0–1 — jumps straight to phase 2 (the required layout pick). */
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

  // Phase 1 runs two beats: 0 — one hero section introduces the concept;
  // 1 — it shrinks into the stack and the traversal demo plays. The arrow's
  // first phase-1 click steps the beat; the next hands the phase back to the host.
  const [beat, setBeat] = useState(0)
  const advance = () => {
    if (phase === 1 && beat === 0) setBeat(1)
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
    // The slow exit is what sells the 1→2 handoff: the section stack must stay
    // visible DISSOLVING inside the morphing box while the option cards
    // materialize in it — die faster and the box travels empty (stretch,
    // vanish, then cards pop). Elements that shouldn't linger (the copy line,
    // the demo controls, the rail) carry their own faster exits.
    exit: { opacity: 0, transition: { duration: reduced ? 0.15 : 0.4 } },
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

  // Phases 1 and 2 share one title — same key, so the header simply holds
  // steady across that boundary instead of swapping.
  const headerText = phase === 0 ? "Welcome" : "Dashboard sections"

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
      // Host drives the whole-takeover exit via AnimatePresence — a plain fade,
      // matching IntroArrival's root.
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeIn" }}
      style={{ willChange: "opacity" }}
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
                transition: { height: { duration: 0.4, ease: EASE }, opacity: { duration: 0.2 } },
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
                exit={phaseIn.exit}
                style={{ width: "100%" }}
              >
                <motion.p className="adm-sub" {...heroRise(HERO_AT.sub)}>
                  Here&apos;s a quick run-through on how your dashboard works.
                </motion.p>
              </motion.div>
            )}

            {phase === 1 && (
              <motion.div
                key="p1"
                className="adm-phase adm-phase--explain"
                {...phaseIn}
                style={{ width: "100%" }}
              >
                <SectionsExplainer beat={beat} reduced={reduced} />
              </motion.div>
            )}

            {phase === 2 && (
              <motion.div
                key="p2"
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
                  Entirely customizable.
                  <br />
                  Pick the order your sections appear in.
                </p>
                <motion.div
                  className="adm-choose-cards"
                  role="radiogroup"
                  aria-label="Layout templates"
                  // Shared element: takes over the demo's section-stack box
                  // (same layoutId) and springs it out into the three-card
                  // row — the sections literally grow into the options. On the
                  // skip path (no demo mounted) there is no source box and
                  // this simply mounts in place.
                  layoutId="sections-into-options"
                  transition={{ layout: reduced ? { duration: 0 } : MORPH_SPRING }}
                >
                  {/* Cards stagger in left to right, materializing INSIDE the
                      morphing box while the old stack dissolves — early enough
                      to overlap it. `layout` + inline borderRadius give them
                      scale correction so they don't smear while the container
                      is mid-spring. */}
                  {LAYOUT_TEMPLATES.map((t, i) => (
                    <motion.button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={picked?.id === t.id}
                      className={`adm-choose-card${picked?.id === t.id ? " adm-choose-card--selected" : ""}`}
                      layout
                      style={{ borderRadius: 16 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={
                        reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: 0.05 + i * 0.08 }
                      }
                      onClick={() => setPicked(t)}
                    >
                      <TemplatePreview template={t} cardIndex={i} reduced={reduced} />
                      <span className="adm-choose-card-name">{t.name}</span>
                      <span className="adm-choose-card-desc">{t.description}</span>
                    </motion.button>
                  ))}
                </motion.div>
                {/* Footnote fades in once the card stagger has landed. */}
                <motion.p
                  className="adm-choose-hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: 0.55 }}
                >
                  This is easy to change later.
                </motion.p>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Persistent footer slot (fixed height, absolute stacking). Phases
            0–1: the bobbing advance arrow. Phase 2: once a card is picked the
            copper "Enter the Dashboard" CTA takes the slot — the same closing
            beat as the daily recap. */}
        <div className="adm-foot">
          <AnimatePresence>
            {phase < 2 ? (
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
      {phase < 2 && (
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

// ═══ Phase 1 — dashboard sections (two beats, one morphing mock) ══════════════
// Beat 0: ONE hero section, near full mock size — "Business Development" with
// dressed-up widgets (real widget titles, ghost figures and revenue curves) —
// introduces what a section is. Beat 1 (arrow click):
// the SAME card shrinks live into the top of the section stack; the widget
// detail dissolves back into plain skeleton blocks as they shrink, so the card
// lands matching its siblings. Then the looping traversal demo plays: arrow
// keys, then the rail waking and opening, then scroll.

function SectionsExplainer({ beat, reduced }: { beat: number; reduced: boolean }) {
  const line =
    beat === 0 ? (
      <>
        Your dashboard is built from sections.
        <br />
        Each one groups a set of related widgets.
      </>
    ) : (
      <>
        One section fills the screen at a time.
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
            key={beat}
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
              transition: { height: { duration: 0.35, ease: EASE }, opacity: { duration: 0.18 } },
            }}
            style={{ overflow: "hidden" }}
          >
            {line}
          </motion.p>
        </AnimatePresence>
      </div>
      <SectionDemo beat={beat} reduced={reduced} />
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
// both the morph handoff and the loop seam are continuous. Order and movement
// counts per the design: arrow keys (3 moves), rail (3 clicks), scroll (2 moves).
const DEMO: DemoFrame[] = [
  // Arrow keys — three presses walk down the stack.
  frame("keys", 0, 950),
  frame("keys", 1, 430, { key: "down" }),
  frame("keys", 1, 820),
  frame("keys", 2, 430, { key: "down" }),
  frame("keys", 2, 820),
  frame("keys", 3, 430, { key: "down" }),
  frame("keys", 3, 950),
  // Rail — the cursor arrives, the rail wakes and OPENS (labels slide out),
  // then three dot clicks jump around the stack.
  frame("rail", 3, 800),
  frame("rail", 3, 1000, { cursorOn: true, cursorRow: 1, railOpen: true }),
  frame("rail", 1, 380, { cursorOn: true, cursorRow: 1, railOpen: true, clickRow: 1 }),
  frame("rail", 1, 850, { cursorOn: true, cursorRow: 1, railOpen: true }),
  frame("rail", 1, 750, { cursorOn: true, cursorRow: 4, railOpen: true }),
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

// The viewport mask fades the peeking half-cards at the edges. It ANIMATES
// between a no-op gradient (beat 0 — the hero must not fade at its edges) and
// the fading one; both strings share the same stop structure so framer can
// interpolate them.
const MASK_FLAT = "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 78%, rgba(0,0,0,1) 100%)"
const MASK_FADE = "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 78%, rgba(0,0,0,0) 100%)"

function SectionDemo({ beat, reduced }: { beat: number; reduced: boolean }) {
  const [frameIndex, setFrameIndex] = useState(0)
  const playing = beat === 1 && !reduced

  // Recursive setTimeout so each frame holds for its own dwell, looping
  // forever. Held until the morph beat begins.
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
  const hero = beat === 0

  // One spring for every morphing dimension (frame width, card height, widget
  // blocks, title size, track travel) so the whole shrink moves as one body.
  const morph = reduced ? { duration: 0 } : MORPH_SPRING

  return (
    <div className="adm-demo-inner" aria-hidden="true">
      <motion.div className="adm-demo-frame" animate={{ width: hero ? HERO_W : STACK_W }} transition={morph}>
        <motion.div
          className="adm-carousel"
          // Shared element: on the 1→2 swap the layout-options grid (same
          // layoutId) takes over this box, so the section stack visibly
          // reshapes into the three option cards. The id is stable across the
          // demo's own re-renders (the track moves by transform, so no layout
          // animations fire during the loop).
          layoutId="sections-into-options"
          style={{ height: VIEW_H }}
          animate={{ maskImage: hero ? MASK_FLAT : MASK_FADE }}
          transition={{
            maskImage: reduced ? { duration: 0 } : { duration: 0.6, ease: EASE },
            layout: reduced ? { duration: 0 } : MORPH_SPRING,
          }}
        >
          <motion.div
            className="adm-carousel-track"
            animate={{ y: hero ? 0 : (VIEW_H - CARD_H) / 2 - f.a * CARD_STEP }}
            transition={morph}
          >
            {/* The hero card — Business Development in dressed-up form: real
                widget titles, ghost figures and revenue curves. On the shrink
                everything morphs NUMERICALLY down to
                stack size while the widget detail dissolves into the shimmer,
                so the card lands as a plain skeleton matching its siblings. */}
            <motion.div
              className="adm-skel-card adm-skel-card--hero"
              animate={{
                height: hero ? VIEW_H : CARD_H,
                opacity: hero || f.a === 0 ? 1 : 0.35,
              }}
              transition={{ height: morph, opacity: { duration: 0.45, ease: EASE } }}
            >
              <motion.span
                className="adm-hero-title"
                animate={{ fontSize: hero ? 13 : 7 }}
                transition={morph}
              >
                Business Development
              </motion.span>
              <div className="adm-skel-grid">
                {HERO_WIDGETS.map((w) => (
                  <motion.span
                    key={w.title}
                    className="adm-skel-block adm-widget"
                    animate={{ height: hero ? 64 : 20 }}
                    transition={morph}
                  >
                    <motion.span
                      className="adm-widget-detail"
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

            {/* The sibling sections — titled like the hero's landed state —
                waiting beneath the fold until the morph. */}
            {SIBLING_TITLES.map((title, idx) => {
              const i = idx + 1
              return (
                <motion.div
                  key={title}
                  className="adm-skel-card"
                  animate={{ opacity: hero ? 0 : i === f.a ? 1 : 0.35 }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  <span className="adm-card-title">{title}</span>
                  <div className="adm-skel-grid">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <span key={j} className="adm-skel-block" />
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
          {!hero && (
            <motion.div
              className="adm-demo-rail"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              // Explicit exit transition: without it the entrance delay above
              // leaks into the exit and the rail lingers over the 1→2 morph.
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

      {/* The input control and its label open beneath the stack with the morph
          (height reveal, recap style) and hold a fixed slot from then on. */}
      <AnimatePresence initial={false}>
        {!hero && (
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
  businessPerformance: 64,
  financialTrends: 84,
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
                // 0.05 + cardIndex * 0.08 — keep these in step).
                { duration: 0.4, ease: EASE, delay: 0.2 + cardIndex * 0.08 + i * 0.05 }
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
