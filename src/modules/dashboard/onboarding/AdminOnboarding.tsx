import { useState, type ReactNode } from "react"
import { AnimatePresence } from "framer-motion"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../../../core/auth/AuthProvider"
import { useOnboarding } from "../../../core/onboarding/OnboardingProvider"
import { Coachmark } from "../../../core/onboarding/Coachmark"
import { useCoachTarget } from "../../../core/onboarding/coachTargets"
import useIsMobile from "../../../shared/hooks/useIsMobile"
import {
  getLiveChooseTemplate,
  commitTemplateChoice,
} from "../context/DashboardLayoutContext"
import type { LayoutTemplate } from "../config/layoutTemplates"
import { AdminIntroScreens } from "./AdminIntroScreens"

// App-level host for the rich admin first-run tour (phases 0–3 full-screen
// takeover → phase 4, a single coachmark over the live dashboard highlighting
// the layout editor). It owns the whole flow in in-session state.
//
// LATCH INVARIANT: activation is read from onboarding ONCE, to engage. After
// that the flow runs off internal `stage` and NEVER consults `phase`/`step`
// again. Picking a layout (phase 3) calls chooseTemplate → completeSetup, which
// flips `phase` to "onboarded" and `step` to null IN THE SAME RENDER (§6.4.2
// hazard 1); a live phase/step condition would kill the host at the 2→3
// boundary and phases 3–5 would never run. The `!resolving` guard on engage is
// mandatory (§6.4.2 hazard 2): a cold-store established admin sits at
// step === "choose-layout" until prefs land — engaging without it flashes the
// Welcome takeover at them.

export type NavbarVeil = "off" | "veiled" | "unveiling"

type Stage = "idle" | 0 | 1 | 2 | 3 | 4 | "done"

const COACH_CONTENT = {
  title: "To edit your dashboard",
  body: "Rearrange or resize any section from here",
  cta: "Got it",
}

export function useAdminOnboardingTour(): { navbarVeil: NavbarVeil; tour: ReactNode } {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const { step, resolving, completeSetup } = useOnboarding()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const location = useLocation()

  // Dev-only preview (`?tour`, or `?welcome` — the historical first-run preview
  // param, which on desktop now means THIS flow): engage at stage 0 without ever
  // committing/stamping (mirrors the `?arrival` never-stamp convention). Still
  // desktop-only — the mobile bail below sends it to "done".
  const [preview] = useState(() => {
    if (!import.meta.env.DEV) return false
    const params = new URLSearchParams(window.location.search)
    return params.has("tour") || params.has("welcome")
  })
  const [stage, setStage] = useState<Stage>(preview ? 0 : "idle")

  // Engage-latch, set DURING render (the supported reset-on-change pattern —
  // see OnboardingProvider's uid sync) so the takeover is up before the first
  // post-resolve paint, never a frame after. Idempotent via the "idle" guard, so
  // StrictMode and later renders are no-ops once engaged. Reads onboarding state
  // ONLY here; see the module invariant.
  if (stage === "idle" && !isMobile && !resolving && step === "choose-layout") {
    setStage(0)
  }

  // Desktop-only flow: if the viewport goes mobile mid-tour, bail (the taught
  // controls are all discoverable on mobile).
  if (isMobile && typeof stage === "number") {
    setStage("done")
  }

  // Intro advance (phases 0→1→2→3).
  const onAdvance = () => setStage((s) => (s === 0 ? 1 : s === 1 ? 2 : 3))
  const onSkip = () => setStage(3)

  const onPick = (template: LayoutTemplate) => {
    if (!preview) {
      // Live path: the mounted provider commits AND stamps completeSetup itself.
      // Standalone path (admin not on a dashboard route): commit here, then stamp
      // here — commitTemplateChoice deliberately does not.
      const live = getLiveChooseTemplate()
      if (live) live(template)
      else if (uid) {
        commitTemplateChoice(uid, template)
        completeSetup()
      }
    }
    setStage(4)
    // Phase 4 anchors on /dashboard (the gear lives there via
    // DashboardHeaderActions). Deep-link admins got phases 0–3 anywhere; move
    // them onto the dashboard now (§6.4.2 hazard 3). This is also the "fade into
    // the real dashboard" intent.
    if (location.pathname !== "/dashboard") navigate("/dashboard")
  }

  const onCoachAdvance = () => setStage("done")

  // Coach target — anchored only on /dashboard, else null (Coachmark shows a
  // backdrop-only blur until the target registers).
  const editGear = useCoachTarget("edit-gear")
  const onDashboard = location.pathname === "/dashboard"

  const coachActive = stage === 4
  const coachTarget = coachActive && onDashboard ? editGear : null

  // The navbar unveils DURING the coachmark (it used to wait for the retired
  // Job Costing stage): the 0.9s fade plays behind the backdrop, and by "done"
  // the navbar is already fully present — no snap when the tour ends.
  const navbarVeil: NavbarVeil =
    typeof stage === "number" && stage <= 3 ? "veiled" : stage === 4 ? "unveiling" : "off"

  const tour = (
    <>
      <AnimatePresence>
        {typeof stage === "number" && stage <= 3 && (
          <AdminIntroScreens
            phase={stage as 0 | 1 | 2 | 3}
            onAdvance={onAdvance}
            onSkip={onSkip}
            onPick={onPick}
          />
        )}
      </AnimatePresence>
      <Coachmark
        active={coachActive}
        target={coachTarget}
        title={COACH_CONTENT.title}
        body={COACH_CONTENT.body}
        ctaLabel={COACH_CONTENT.cta}
        onAdvance={onCoachAdvance}
      />
    </>
  )

  return { navbarVeil, tour }
}
