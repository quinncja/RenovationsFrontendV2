# Admin Onboarding — Implementation Handoff

**For:** the model building the richer admin onboarding (layout choice → explain sections → "Incl. WIP" toggle → left navbar).
**Prerequisite reading:** `ONBOARDING_REFACTOR_DESIGN.md` (the state-unification refactor this builds on), especially §4.9–§4.12 and §5. This file adds only what that doc doesn't say — the minimum extra facts needed to build admin onboarding *correctly on top of the implemented engine*.

---

## 1. State of the world

- The onboarding engine from the design doc is **implemented and verified but sits UNCOMMITTED in this repo's working tree** (deliberate — do not commit/push without the user's say-so; check `git status` before assuming anything is on `main`).
- The backend half (`UserPreference.onboarding`, `GET /user/preferences`, `PATCH /user/onboarding`) is **deployed to prod** (commit `319911df` in `/Users/quinnsieja/Documents/RD/RenovationsBackend`). Backend is prod-only on a Pi; **a push is a deploy**. No backend changes should be needed for this work — milestones are schemaless.
- Engine files: `src/core/onboarding/{OnboardingProvider.tsx, sequences.ts, markers.ts}`, `src/shared/api/preferencesApi.ts`. Consumers already wired: `App.tsx`, `SupervisorSelect.tsx`, `DashboardLayoutContext.tsx`, `DailyReportContext.tsx`.

## 2. The engine contract (what you extend, what you must not break)

- `useOnboarding()` → `{ phase, step, resolving, onboardedAt, seen(key), acknowledge(key), completeSetup() }`.
- `sequences.ts` currently ships `admin: ["choose-layout"]` **only**. To add tour steps: append keys (e.g. `"tour:sections"`). Any key NOT in `SETUP_DONE` is a coachmark, auto-resolved via `seen(key)`; `acknowledge(key)` advances `step`. Zero engine edits needed for coachmark steps.
- **Terminal rule (§4.12): `onboardedAt` stamped ⇒ `phase === "onboarded"` forever, and `step` is `null`.** This protects established users from re-onboarding — do not weaken it.
- **Blocking surfaces gate on `step`, never on `phase`** (see `App.tsx` for the pattern). Coachmark delivery should key on `step === "tour:x"`.
- `acknowledge()` writes are optimistic-local + background-PATCH, server-union-merged. Milestone keys are free-form strings — no backend work to add one.

## 3. Critical gotchas — read before designing

1. **`completeSetup()` timing is THE trap.** Today `chooseTemplate()` (`DashboardLayoutContext.tsx`) calls `completeSetup()` the moment a template is picked. That stamps `onboardedAt` → terminal rule fires → `step` goes `null` → **any tour steps you append after `choose-layout` will never show.** You must move the `completeSetup()` call to the *end* of the admin sequence (the last tour step's acknowledgment). Two knock-on effects you must then handle:
   - `completeSetup()` currently also sets the provider's internal `hasLayout: true`. If you move it, `chooseTemplate` needs another way to tell the provider the layout now exists (the provider's `hasLayout` is read from the `dashboard-layout:{uid}` localStorage cache only at uid-change; it goes stale mid-session). Add an explicit notify (e.g. a `setupStepDone("choose-layout")` / `notifyLayoutChosen()` on the context) — do NOT have onboarding start writing the layout key; `DashboardLayoutContext` owns it.
   - Managers: `SupervisorSelect` also calls `completeSetup()`. The manager sequence is still `["choose-supervisor"]` alone, so stamping there remains correct. Don't unify the two call sites into one behavior.
2. **A user mid-tour has `phase === "admin-onboarding"`, and `DailyReportContext` suppresses the daily greeting for any non-`onboarded` phase.** With `completeSetup()` moved to the end, a user who picks a layout then closes the tab resumes the tour next session and gets no greeting until done. That's coherent — but decide it consciously, and keep tours short.
3. **Established admins who onboarded before `onboarded-at` existed have NO `onboardedAt` anywhere** (local or server). They have a layout, so today `phase = "onboarded"` via all-steps-done. **The moment you append a tour step, they flip back to `admin-onboarding`** — greeting suppressed, tour shown. If the user wants existing admins to see the new tour, that may be acceptable (confirm with them); if not, ship the content as **incremental milestones** (`seen`/`acknowledge` checked contextually, key NOT in the sequence) — that is exactly what §4.10 designed them for. Default recommendation: sequence steps for genuinely-new admins only; incremental milestones for everyone else.
4. **Do not re-derive "is onboarded" anywhere.** The refactor's whole point. New UI reads `useOnboarding()`; new flags go through `acknowledge`/`seen`; new localStorage keys go in `markers.ts` or nowhere.
5. **Dev/preview realities:** `DEV_BYPASS` (`VITE_DEV_BYPASS_AUTH=true`) yields role `executive`, uid `dev-local`, but prod rejects its token → `fetchUserPreferences()` 401s → the memo clears and `resolving` settles false. Build your preview path like the existing ones: `?welcome` (walkthrough, `Dashboard.tsx`), `?arrival`/`?arrival-intro` (`DailyReportContext.tsx`) — dev-only query params that force the UI and **never stamp/acknowledge**. Follow that convention for the tour (e.g. `?tour`).

## 4. Delivery surfaces & building blocks

- **Step 1 UI (exists):** `WelcomeWalkthrough.tsx` (template cards) + `GearHintPopover`, hosted in `Dashboard.tsx` → `AdminDashboard` (gates on `hasChosenLayout` from the layout context — fine to leave as-is).
- **Coachmark overlay (reuse):** `src/modules/dashboard/report/DailyReportCoach.tsx` — full-screen blur layer; the target element lifts above it via z-index (see `DailyReportButton.tsx` / `DashboardHeaderActions.tsx` comments). This is the intro-tour's look; the admin tour should feel like the same system.
- **Anchoring warning (design doc §3):** three hint-anchoring strategies exist with different fragility. The only safe pattern is co-location (`DailyReportButton`'s `.rpt-btn-anchor` wrapper). `GearHintPopover` is positioned by hard-coded CSS (`App.css` ~7392, `top: 3.75rem`) and `NavReportsHint` by `document.querySelector` — **do not copy those two.** If the tour needs several anchored hints, build the deferred `<Coachmark targetRef>` primitive first; it was explicitly scoped as the next phase.
- **Tour content targets:** dashboard sections (`SectionPager`/section list from the layout context); the "Incl. WIP" pill = `OverUnderToggle.tsx`, rendered top-right via `DashboardHeaderActions.tsx`; the left navbar = `core/components/Navbar.tsx` (desktop only — `useIsMobile(768)` swaps it for `MobileNav`; decide what the tour does on mobile before building).
- **Don't collide with the intro-tour:** the day-after arrival already runs its own coachmarks (clock → Reports nav, milestone `intro-tour`, driven by `introStep` in `DailyReportContext`). The admin tour runs day 0 (pre-`onboardedAt`), the intro-tour day 1+ — they can't overlap in time, but keep their visual/z-index systems from clashing and don't reuse the `intro-tour` key.

## 5. Design language & verification

- Copper accent is reserved for *meaning* (active state), not decoration; neutral surfaces, contained rounded pills. The nav-group flyout is the reference implementation. Comments in this codebase state constraints, not narration — match that bar.
- Verify with `npx tsc -b` and `npm run build` (must be clean; lint is red repo-wide and not part of the build — just don't add new errors). Trace your changes against the behavior-preservation checklist in `ONBOARDING_REFACTOR_DESIGN.md` §5.7, which now includes item 8.
- Full end-to-end against prod needs a real Firebase login (dev-bypass 401s) — flag manual smoke steps for the user rather than claiming e2e verification you can't perform.

---

# 6. Build spec — the rich admin onboarding (EXECUTE THIS)

**Status:** designed and decided with the user (Jul 13 2026). §1–5 above are still-valid grounding; this section is the concrete plan to implement. Where it conflicts with §3.1's "move `completeSetup()` to the end" advice, **this section wins** — see §6.2.

## 6.1 What we're building

A paced, high-end first-run experience for a **brand-new admin/exec** (owner/tech/executive/admin — anyone who hits the layout picker). It reuses the Daily Recap intro's animation language so it feels like the same product. Five phases:

- **Phase 0 — Welcome** (full-screen takeover, navbar hidden): R logo → "Welcome" → "Let's set up the home page for your dashboard."
- **Phase 1 — How the home page works** (full-screen): copy explaining that sections compartmentalize related data and you move between them by **scrolling, the arrow keys, or the section rail on the right**; alongside it a **looping "skeleton traversal" animation** — a stacked column of section-card skeletons with a focus highlight gliding up/down the stack, mimicking the editor's skeleton render. Labeled **"Next"** button.
- **Phase 2 — Choose a layout** (full-screen): "To get started, choose a layout that suits you." The 3 cards (Operations / Procurement / Financial) each contain an **animated preview stack** — mini section skeletons that reorder to match that template's `sectionOrder`. Picking one commits the layout.
- **Phase 3 — Editor** (fade into the *real* dashboard, blur retained): top-right **gear** lifts above the blur with a tooltip about rearranging/resizing sections.
- **Phase 4 — WIP** (continuous blur): the **"Incl. WIP" pill** (`OverUnderToggle`) lifts with a tooltip explaining it folds open-period WIP into the revenue figures.
- **Phase 5 — Navbar + Job Costing**: the reserved navbar **fades in** (opacity 0→1, forced open), blur wraps it, tooltip anchors the **Job Costing** nav item. Acknowledging ends the tour.

Plus: a quiet **5-dot progress indicator**, a **"Skip intro"** on phases 0–1 that jumps to the layout pick (the one required step), `useReducedMotion` honored throughout, and **one unbroken blur** across phases 3–5 (never flashing off between steps).

## 6.2 Locked decisions (do not re-litigate)

1. **New admins only.** Existing admins already have a layout and are stamped `onboardedAt`, so §4.12's terminal rule means they never see this. We are NOT backfilling the editor/WIP/navbar explainers to established admins.
2. **Defer mobile.** Ship desktop-only. On mobile (`useIsMobile(768)`), leave today's `WelcomeWalkthrough` + immediate `completeSetup()` path **completely unchanged**. The new host activates `!isMobile` only.
3. **Layout cards use the animated preview stack** (mini reordering skeletons), not a static list.
4. **Keep `SEQUENCES.admin = ["choose-layout"]` UNTOUCHED — this is the key refinement.** The editor/WIP/navbar steps are NOT sequence steps and NOT persisted milestones. They run off the `AdminOnboarding` host's **in-session state**, triggered the instant a desktop admin picks a layout. This sidesteps §3.1's `completeSetup()`-timing trap entirely (no sequence edits, no moved `completeSetup()`, no established-admin flip-back), and honors "new admins only."
   - `chooseTemplate()` **keeps calling `completeSetup()` as it does today** (stamps `onboardedAt`). Mobile admins and any interrupted desktop admin are therefore correctly onboarded — no "stuck, greeting suppressed forever" hole.
   - **Accepted trade (mirror of §3.2):** a new admin who closes the tab mid-coach does NOT resume the coach next session — they're already onboarded and the taught controls are all discoverable. Correct trade for new-admins-only; it's why this beats reopening the sequence.

## 6.3 Reuse map — the exact animation kit (from `src/modules/dashboard/report/arrival/DailyArrival.tsx`, `IntroArrival`)

- `EASE = [0.25, 0.46, 0.45, 0.94]` — the shared cubic-bezier; use it everywhere.
- `heroRise` variants + `HERO_AT` explicit per-line delays (logo+title together at 0.9s, subtitle at 2.0s) — for the Phase 0 hero (R `Logo` from `src/core/components/Logo.tsx`).
- `rise` + `blockStagger` — for staggered content reveals.
- Height-opening reveals (`initial={{height:0}} animate={{height:"auto"}}`) — for stacking content without jumps.
- The `arr-advance` bobbing chevron button — reuse as the advance affordance; Phase 1 gets a labeled "Next" per the user.
- `.arr-screen` full-screen dialog shell + its exit (opacity/scale/blur).
- **Blur handoff** = `src/modules/dashboard/report/DailyReportCoach.tsx` pattern: a full-screen blur/dim layer; the taught element lifts above it via z-index (see `.rpt-btn-anchor--coach` / `.nav-button-attention` for how the daily intro lifts the real clock / Reports item). Phases 3–5 replicate this over the live dashboard.
- Use the **`motion` skill** to tune the skeleton-loop and card-reorder springs against `EASE`.

## 6.4 Architecture / files to build & touch

1. **`<Coachmark targetRef>` anchored-hint primitive** (NEW) — the deferred §3/§7 piece. Phases 3–5 have three different real targets (gear, WIP pill, nav item); co-location alone (the only currently-safe pattern) can't serve all three, so build this first. It tracks a `ref`'d element's rect and renders a positioned hint + backdrop cutout. **Do NOT copy `GearHintPopover`'s hardcoded CSS or `NavReportsHint`'s `querySelector`** (§3, both fragile).
2. **`AdminOnboarding` host** (NEW) — mount in `src/App.tsx` as a sibling of `DailyReportProvider` (see the `{!isMobile && <Navbar />}` / `<Outlet />` block). Owns: the phase-0–2 full-screen takeover, the in-session coach state for phases 3–5 (over the live dashboard), navbar visibility, and which element is currently lifted above the blur. Reads `useOnboarding()`.
   - **Activation must LATCH — do not gate on a live `phase` check.** Picking a layout calls `chooseTemplate()` → `completeSetup()` → terminal rule flips `phase` to `"onboarded"` in that same render; a live `phase === "admin-onboarding"` condition would kill the host at the exact 2→3 boundary and phases 3–5 would never run. Correct shape: **engage** when `!isMobile && !resolving && step === "choose-layout"`, then run phases 3–5 off internal state until the flow completes or is skipped, ignoring `phase` thereafter.
   - The `!resolving` guard is mandatory: a cold-store *established* admin (cleared browser / new device) sits at `phase === "admin-onboarding"`, `step === "choose-layout"` for the few hundred ms until the prefs fetch lands — without the guard they get a flash of the Welcome takeover. This is the host's equivalent of `AdminDashboard`'s existing `!isLoading` gate.
   - **Phases 3–5 are route-dependent:** the gear and WIP pill exist only on `/dashboard` (via `DashboardHeaderActions`), and only outside edit mode. The takeover is route-independent (the host sits in App.tsx), so a new admin landing on a deep link still gets phases 0–2 anywhere — but on the layout pick the host must `navigate("/dashboard")` (which is also the "fade into the real dashboard" intent), and treat "on `/dashboard`, not editing" as the precondition for anchoring phases 3–5.
   - Navbar visibility needs `App.tsx` cooperation — the navbar renders there, outside the host. "Host owns navbar visibility" means App reads onboarding-active state (context value or prop) and applies the opacity; the host can't reach it otherwise. "Forced open" is free: `navbarOpen` (`Navbar.tsx`, `useLocalStorage`) already defaults `true` for a fresh user — don't fight a stored value.
   - Dev-bypass note: `dev-local` with no cached layout satisfies the entry condition (the 401 settles `resolving` false, phase stays `admin-onboarding`), so the takeover WILL appear in plain dev runs. That's a free preview, not a bug — don't "fix" it.
3. **Phase 0–2 screens** (NEW) — Welcome; the skeleton-traversal loop (reuse the `widget-skeleton` class); the animated-preview-stack layout cards built from `LAYOUT_TEMPLATES[].sectionOrder` (`config/layoutTemplates.ts`) × section titles in `SECTION_REGISTRY` (`config/sectionRegistry.ts`). Picking a card calls `chooseTemplate()`.
4. **`src/modules/dashboard/components/SectionPager.tsx`** — wire **arrow-key (up/down) traversal** so the Phase-1 copy is truthful (scroll-snap + right-rail `SectionNav` dots already work; arrow keys are NOT currently wired). Move via the existing `setActiveSectionIndex`.
5. **`src/modules/dashboard/Dashboard.tsx`** — on **desktop**, suppress the in-page `WelcomeWalkthrough` (the host owns layout choice now); leave the **mobile** path (`WelcomeWalkthrough` + `chooseTemplate`→`completeSetup`) intact. Suppressing it orphans `AdminDashboard`'s `handleChosen` path (`gearHint`, `cameFromWelcome` fade) on desktop — that's correct (the host's Phase 3 replaces the gear hint); leave that code intact for mobile rather than "cleaning it up."
6. **Coach phases 3–5** — gear (top-right, rendered via `DashboardHeaderActions.tsx` / `EditModeToggle`), WIP pill (`OverUnderToggle.tsx`), navbar (`core/components/Navbar.tsx`, Job Costing item = the `data-nav="/jobcost"` button, label "Job Costing"). `data-nav` is *identification only* — the Coachmark must still receive a real React ref (expose one from `Navbar`, or add a ref-registration callback); do NOT resolve the target via `querySelector` (§3 / §6.4.1). Navbar stays mounted (space reserved) at `opacity:0` for the whole flow, fades to 1 at Phase 5, forced open (`navbarOpen` defaults true for a new admin).
7. **`?tour` dev preview** — dev-only query param that forces the flow and **never stamps/acknowledges**, mirroring `?welcome` (`Dashboard.tsx`) and `?arrival` (`DailyReportContext.tsx`). **The Phase-2 pick action must take a preview guard:** `chooseTemplate()` persists the layout, stamps `onboardedAt`, AND PATCHes prod — in preview, skip the commit entirely (the same non-destructive plumbing as `WelcomeWalkthrough`'s `preview` prop) and just advance the flow.

## 6.5 Copy (draft — refine for tone, keep truthful)

- **Welcome:** "Welcome" / "Let's set up the home page for your dashboard."
- **Sections:** "Your home page is built from sections that group related data together. Move between them by scrolling, using the arrow keys, or the rail on the right."
- **Editor tooltip:** "Your dashboard, your way — rearrange or resize any section from here, anytime."
- **WIP tooltip:** explain "Incl. WIP" folds open-period work-in-progress into the revenue figures.
- **Job Costing tooltip:** "Every project's live cost detail — budgets, change orders, and margins — lives here." (be specific, not "job costing lives here").

## 6.6 Verify

- `npx tsc -b` and `npm run build` must be clean (lint is red repo-wide, not part of the build — just don't add new errors).
- Preview each phase via `?tour`. Full e2e needs a real Firebase login (dev-bypass 401s) — flag manual smoke steps for the user rather than claiming e2e you can't perform.
- Re-check the §5.7 behavior-preservation checklist — especially that the **mobile** and **established-admin** paths are byte-for-byte unchanged, and that `chooseTemplate()` still stamps `onboardedAt`.
- Explicitly exercise the three §6.4.2 hazards: (1) phases 3–5 still run after the layout pick flips `phase` to `"onboarded"` (the latch works); (2) no takeover flash for a cold-store established admin — simulate by clearing localStorage for a uid whose server prefs exist, or temporarily forcing `resolving`; (3) a new admin landing on a deep link gets phases 0–2 there and is navigated to `/dashboard` for 3–5.
- Design language (§5): copper reserved for meaning, neutral surfaces, contained rounded pills; the nav-group flyout is the reference. Comments state constraints, not narration.

---

# 7. As built — continuation handoff (Jul 13 2026)

**§6 is implemented IN FULL and verified.** Everything below is what a successor model needs to keep editing it. All work is frontend-only and sits **UNCOMMITTED** in this working tree alongside the engine (§1 still applies: do not commit/push without the user's say-so). Backend untouched — nothing to deploy.

## 7.1 File map

**New:**
- `src/modules/dashboard/onboarding/AdminOnboarding.tsx` — the host: `useAdminOnboardingTour()` (called in App.tsx) returns `{ navbarVeil, tour }`. Owns the whole flow as `stage: "idle" | 0–5 | "done"` plus a `preview` flag. Also exports `NavbarVeil`.
- `src/modules/dashboard/onboarding/AdminIntroScreens.tsx` — phases 0–2 takeover (`.adm-*` classes, z-190 shell mirroring `.arr-screen`). Props: `{ phase: 0|1|2, onAdvance, onSkip, onPick(template) }`. Phase 1 is `HomePageExplainer` — TWO in-component beats (§7.5), not sequence/host stages: beat 0 = sections + rail, beat 1 = widget→page drill-down + navbar; the shared `HomePageMock` persists across both (`NavSkeleton`, `SectionRailDemo`, scripted `CursorArrow`; FADE_MIN 0.3 = SectionPager's floor). Phase 2 is `TemplatePreview` (reorder loop, pause 2600ms, spring visualDuration 0.55 / bounce 0.18, hover pauses).
- `src/core/onboarding/Coachmark.tsx` — generic anchored coachmark (z-500 layer): ONE persistent backdrop (`.rpt-coach` look) with a rounded **clip-path cutout** over `target`, rAF rect tracking (≤2px snaps, larger deltas animate 0.5s EASE), invisible click shield + `coachPulse` ring over the hole, auto-flip hint card, optional progress dots. `target=null` while `active` = backdrop only, cutout collapsed. Props: `{ target, active, title?, body, ctaLabel?="Got it", onAdvance, progress? }`.
- `src/core/onboarding/coachTargets.ts` — module registry: `registerCoachTarget(id, el)` / `useCoachTarget(id)` (`useSyncExternalStore`). Ids: `"edit-gear" | "wip-toggle" | "nav-jobcost"`.

**Edited:** `App.tsx` (hook + `<Navbar veil>` + `{tour}` after `<Outlet/>`), `Dashboard.tsx` (`showWelcome` mobile-gated; `forceWelcome` mobile-gated — see 7.3), `Navbar.tsx` (`veil` prop → `navbar--tour`/`navbar--veiled`; `jobcostRef` on the `/jobcost` leaf), `EditModeToggle.tsx` / `OverUnderToggle.tsx` (ref registration), `DashboardLayoutContext.tsx` (`getLiveChooseTemplate()` + `commitTemplateChoice(userId, template)`; `chooseTemplate` itself untouched).

**CSS:** all new styles live at the END of `App.css` under three labeled anchors — `coachmark-css` (`.coach-*`), `admin-intro-css` (`.adm-*`), `admin-host-css` (`.navbar--tour/--veiled`). Keep additions inside the matching anchor.

## 7.2 Invariants a future edit must not break

1. **The latch.** Engagement (`stage "idle" → 0`) is the ONLY read of onboarding state: `!isMobile && !resolving && step === "choose-layout"`, set **during render** (reset-on-change pattern — deliberately not an effect: engages pre-paint and satisfies `react-hooks/set-state-in-effect`). After engaging, never consult `phase`/`step` — the pick flips them in the same render (§6.4.2).
2. **Commit duality.** `onPick`: live provider mounted → `getLiveChooseTemplate()(t)` (commits + stamps itself); else `commitTemplateChoice(uid, t)` + `completeSetup()` (the standalone deliberately does not stamp). Then `navigate("/dashboard")` only if not already there.
3. **Coachmark geometry.** Card placement math assumes the card is exactly 280px INCLUDING padding — `.coach-card` carries `box-sizing: border-box` for that reason (was a real clipped-at-viewport bug). The cutout needs `clip-path: path(evenodd, …)` — Chrome 121+/recent FF; older browsers degrade to blur-with-no-hole, tour still functional.
4. **Targets are refs, never `querySelector`** (§3). The registry assumes one live element per id (all three are singletons today); if a target ever renders twice concurrently, harden `registerCoachTarget` to compare elements on unregister.
5. **Mobile + established-admin paths stay byte-for-byte.** Mobile: old `WelcomeWalkthrough` + `chooseTemplate`→`completeSetup`, host bails via the render-time `isMobile` check. Established admins: never engage (resolving guard + terminal rule).
6. **Dots continuity:** 5 dots span the post-welcome flow — `.adm-progress` renders indexes 0–1 (phases 1–2), Coachmark's `progress` renders 2–4 (stages 3–5). Keep them visually identical (6px, neutral border, copper active).
7. §6.4.4 (arrow keys) was ALREADY implemented in `SectionPager.tsx` before this build — don't re-add.

## 7.3 Dev preview

`?tour` or `?welcome` (DEV, desktop): forces the flow from stage 0, never commits/stamps (the `preview` flag guards `onPick`). `Dashboard.tsx`'s `forceWelcome` is **mobile-gated** — necessary, not cosmetic: on desktop the forced in-page walkthrough would hide `DashboardHeaderActions`, so the gear/WIP targets would never register and coach stages 3–4 would strand on a blank blur. At mobile widths `?welcome` still previews the legacy walkthrough.

Headless smoke recipe (works, used to verify): `env VITE_DEV_BYPASS_AUTH=true npm run dev` (must be `env`-prefixed process env — plain inline assignment did not reach Vite here; `.env` ships `false`), then Playwright against `http://localhost:5173/dashboard?tour`. Selectors: `.adm-advance` (phase-0 chevron, appears ~4.1s), `.adm-next-btn`, `.adm-skip`, `.adm-choose-card`, `.gear-hint-dismiss` (coach CTA, all three stages). Expected console noise: 401s (prod rejects the bypass token).

## 7.4 Verification state

Done: `npx tsc -b`, `npm run build`, eslint on all new/edited files — clean (repo-wide lint noise is pre-existing; the one Navbar error predates this work). Full headless click-through of all six phases + the skip path + `?welcome`, screenshot-checked per phase, zero page errors. Hazard traces (§6.6 1–3) verified in code review.

**Still owed (needs a real Firebase login on a FRESH admin account — dev-bypass can't do it):** tour runs once end-to-end against prod, layout persists server-side, greeting suppressed day 0 and arrives day 1, established admins see nothing, and a cold-store established admin gets no takeover flash in a real browser.

## 7.6 Phases 0–2 refinements (Jul 14 2026, round 2) — screenshot-verified

Follow-ups on §7.5, all verified via `?tour` (Playwright/system Chrome):
- **Centered like the recap.** `.adm-shell` is back to `margin:auto` content-height centering (dropped the full-height pin); logo + Welcome + subtitle + arrow sit as one **vertically-centered** block. Chrome still persists (logo/arrow/header mount once); it just isn't pinned top/bottom anymore.
- Phase-0 subtitle → "Here's a quick run-through on how your dashboard works."
- **Navbar beat REMOVED.** Phase 1 is now **two** beats (A sections, B traversal); `sectionBeat: 0|1`, `advance` gates on `< 1`. Deleted `MockNav`, `showNav`, `.adm-mock-nav`/`.adm-mocknav*`, and `BEAT_BODY[2]`.
- **Demo reordered + ~15% faster, still looping:** order is now **rail → keys → rail → scroll → keys → repeat** (see the `DEMO` array's section comments). Arrow-key presses have short dwells between them (~430–620ms); the rest trimmed ~15%.
- **Rail labels now render to the LEFT of the dots** (matching the real SectionNav — the earlier left-anchored "labels-right" was wrong). Rail is **right-anchored** again (`.adm-raildemo` fixed 92px lane, `.adm-railcard{margin-left:auto}`, `.adm-railrow{justify-content:flex-end}`, label-before-dot in JSX, `.adm-cursor{right:2px}`). Consequence the user accepted: the resting capsule floats ~85px right of the cards — the room left-expanding labels need without overlapping the cards (can't be both hugging AND labels-left; ~85px is the geometric minimum, and it reads intentionally since hover fills the gap). Faded-until-hover (`--awake`) unchanged.

## 7.5 Phases 0–2 rework (Jul 14 2026) — persistent chrome + looping demo

Reshaped into a **daily-recap-style persistent-chrome screen**, screenshot-verified via `?tour` (Playwright driving system Chrome; six phase captures, zero page errors). Supersedes all earlier §7.5 notes.

**Persistent chrome (in `AdminIntroScreens`, OUTSIDE the per-phase `AnimatePresence`):** the R `Logo` (top) and the copper bobbing arrow (bottom, `.adm-foot`) mount ONCE and carry across phases 0→1 without remounting; the arrow fades out on phase 2 (cards are the affordance there). The header (`.adm-header-text`) is a single element whose TEXT crossfades (`key={headerText}` AnimatePresence): **"Welcome" → "Dashboard sections" → "Pick your layout"**. `.adm-shell` is full-height (`min-height:100%`) with `.adm-body-area { flex:1 }`, so logo/header pin top and the arrow pins bottom while the middle swaps — chrome stays put as phases change.

**Phase 1 = three beats the arrow steps through** (internal `sectionBeat: 0|1|2` in `AdminIntroScreens`; `advance()` steps A→B→C then calls host `onAdvance`). `SectionsExplainer` swaps only the body line (`BEAT_BODY`) and drives `HomePageMock`:
- **A — sections exist:** skeleton reveals top-down (`reveal`, `REVEAL_STAGGER` 0.24s/card; wrapper carries entrance, inner `.adm-skel-card` carries active/dim — a focus change never restarts the reveal). No rail, no nav.
- **B — traversal:** rail fades in on the RIGHT (`showRail`); the **slow, LOOPING** input demo runs (`play`).
- **C — navbar:** `MockNav` fades in on the LEFT (`showNav`) — introduced *after* the sections, its own beat.

**The demo LOOPS and is deliberately slow** (`DEMO` array + recursive `setTimeout` in `HomePageMock`; ~1.5–2.1s dwells, cycles forever — NOT one-shot; the earlier "finite, no loop" is reverted per the user). Cycle: keys ▼▼▲ → mouse scroll ▼▼ → cursor onto the rail (hover wakes it) + move + click a dot → leave. `MouseGlyph` takes a signed `dir` (up/down scroll).

**Rail (`SectionRail`)** is **LEFT-anchored now** (`.adm-raildemo{display:inline-block}`, `.adm-railrow{justify-content:flex-start}`, dots-first in JSX): the closed 26px capsule hugs the cards and grows RIGHTWARD on open — the old fixed-132px right-anchored lane pushed the capsule ~106px off (the "way far off" bug). It's **faded at rest, filled white on hover** via `.adm-railcard--awake` (= `cursorOn`; CSS-transitioned bg/opacity/shadow, mirroring the real rail's rest→hover). `.adm-mock-nav`/`.adm-mock-rail` are absolute (`right:100%`/`left:100%` of the fixed-width `.adm-mock-frame`), opacity-only animation so their `translateY(-50%)` centering holds.

**Phase 2** dropped its own `<h2>` (header chrome shows "Pick your layout") and the earlier fixed-left `Phase2Navbar` (removed — the nav now lives in beat C). Just `.adm-choose-note` + the cards.

- Reduced motion: everything settled at once, no demo/keys/cursor, nav/rail shown statically per beat.
- Dots unchanged — phase 1's three beats share progress dot 0; 5-dot system (§7.2.6) + coach indices untouched.
- CSS under `admin-intro-css`: chrome (`.adm-header`/`.adm-header-text`/`.adm-body-area`/`.adm-logo--persist`, reworked `.adm-shell`/`.adm-foot`), `.adm-mock-nav`/`.adm-mocknav*`, rewritten `.adm-raildemo`/`.adm-railcard`(+`--awake`)/`.adm-railrow`; removed `.adm-explain-title`/`.adm-next-btn`/`.adm-navskel*`/`.adm-p2nav*`/`.adm-choose-heading`. `tsc -b`, `npm run build`, eslint all clean.
- **Terminology (still open, per user Jul 13):** "the dashboard" = the home page; the app as a whole wants a coined product name (would land on the Welcome header). TBD — don't hardcode until picked.
