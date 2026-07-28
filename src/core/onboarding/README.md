# Onboarding — current-state map

The single up-to-date inventory of every onboarding capability: the flows, the
engine, the delivery surfaces, storage, and dev previews. The two older docs are
history, not reference: `ONBOARDING_REFACTOR_DESIGN.md` (repo root) is the
engine's design deliberation — its §2 describes the *pre-refactor* code and is
superseded — and `ADMIN_ONBOARDING_HANDOFF.md` is the admin tour's build spec
and as-built notes. Update THIS file when a flow, milestone, or preview is
added or retired.

## The two tiers

1. **Blocking setup (sequences)** — role-scoped, gates the app until done.
   Completion is *derived from durable state* (a layout doc exists, a claim is
   set), never stored as an onboarding flag. Finishing stamps `onboardedAt`,
   which is terminal: once stamped, `phase` is `"onboarded"` forever.
2. **Incremental milestones** — one-time contextual explainers for established
   users (`seen(key)` / `acknowledge(key)`). Shipping a new key makes it unseen
   for everyone, each user sees it once, no version bookkeeping. These NEVER
   touch `phase`; new explainers always ship this way, never by growing a
   sequence retroactively.

## The flows

**A — Admin/exec setup (`choose-layout`)**
- Desktop: the rich 6-phase tour — `modules/dashboard/onboarding/AdminOnboarding.tsx`
  (host, mounted in `App.tsx`) + `AdminIntroScreens.tsx`, using the `Coachmark`
  cutout for the taught controls. Ends in `completeSetup()`.
- Mobile: the older in-page template picker — `modules/dashboard/components/WelcomeWalkthrough.tsx`
  (+ its `GearHintPopover` step), triggered from `Dashboard.tsx`. Desktop new
  users never see it anymore.
- Done when a dashboard layout exists (`SETUP_DONE["choose-layout"]`).

**B — Manager setup (`choose-supervisor`)**
- `App.tsx` gate → `core/auth/pages/SupervisorSelect.tsx`. Picking a name mints
  the `employeeId` claim via token refresh; done when the claim exists.

**C — Daily arrival, intro variant (the "day after" flow)**
- `modules/dashboard/report/DailyReportContext.tsx` owns the synchronous gate;
  the first arrival after onboarding runs the intro variant (`intro-tour`
  milestone unseen): full-screen `DailyArrival` intro framing, then the
  coachmark pair — header-clock spotlight (`DailyReportCoach`) → Reports
  nav-item hint (`NavReportsHint`, `introStep` 2). Subsequent days are the
  plain recap. Auto-open starts the day AFTER `onboardedAt`.

**D — New-section announcements (incremental milestones)**
- `NavSectionHint.tsx` (this directory): reusable one-time popover anchored to
  a nav item, non-blocking, veils under an open flyout, auto-acknowledged by
  visiting the section it announces. First instance: `section:overhead-report`
  on the Finances group (wired in `core/components/Navbar.tsx`; the page visit
  acknowledge lives in `OverheadReportPage.tsx`).

## Engine surface (`useOnboarding()` — OnboardingProvider.tsx)

- `phase` — `loading | not-applicable | admin-onboarding | manager-onboarding | onboarded`
  (Tier 1 only; terminal once `onboardedAt` is stamped)
- `step` — first incomplete sequence step, else null
- `resolving` — cold-cache candidate waiting on the prefs bootstrap (warm-cache
  users never see it true)
- `onboardedAt` / `completeSetup()` — the terminal stamp
- `seen(key)` / `acknowledge(key)` — milestone read / optimistic ack + push
- Sequences and their done-checks: `sequences.ts`. Milestone key constants
  (`INTRO_TOUR`, `SECTION_OVERHEAD_REPORT`): `markers.ts`.

## Storage & sync (`markers.ts`)

Per-uid localStorage, all wrapped in try/catch: `onboarded-at:{uid}`,
`onboarding-milestones:{uid}` (JSON map key → ISO date), plus the read-only
`dashboard-layout:{uid}` presence check and the legacy
`daily-report-intro-seen:{uid}` fold-in. Server side is
`UserPreference.onboarding` (`GET /user/preferences` once per load, shared with
the layout fetch; `PATCH /user/preferences/onboarding`). Merge rule: milestones
union (local ∪ server, monotonic), `onboardedAt` = local ?? server; local-only
flags are pushed up after merge.

## Delivery building blocks

- `Coachmark.tsx` — blurred backdrop with an animated rounded cutout + anchored
  hint card; blocking (click shield). Targets come from `coachTargets.ts`, a
  callback-ref registry (`registerCoachTarget` / `useCoachTarget`) — never
  `document.querySelector` for new work.
- `NavSectionHint.tsx` — non-blocking nav popover for `section:*` milestones
  (framer entrance/exit, ResizeObserver anchor tracking, `.nav-hint--motion`
  z 150 so full-screen overlays cover it).
- `NavReportsHint.tsx` — the intro's Reports popover (legacy querySelector
  anchor; predates the registry).
- `.nav-button-attention` — copper `coachPulse` ring on the nav item being
  pointed at.

## Dev previews (all DEV-only, none stamp markers)

| Param | Shows |
|---|---|
| `?tour` / `?welcome` (desktop) | Admin onboarding tour |
| `?welcome` (mobile) | WelcomeWalkthrough template picker |
| `?arrival` / `?arrival-intro` | Daily arrival / its intro variant |
| `?report` | Daily report modal (manual-reopen surface) |
| `?overhead-hint` | Finances new-section hint |
| `?idle` | Idle refresh overlay (not onboarding, mirrors the pattern) |

## Shipping the next `section:*` announcement

1. Add the key constant in `markers.ts` (`section:<slug>`).
2. Add a `CoachTargetId` and register the nav element's ref (see the Finances
   group in `Navbar.tsx`).
3. Render `NavSectionHint` from `Navbar.tsx` with the gating chain: has the nav
   item, `veil === "off"`, `introStep === 0`, `phase === "onboarded"`,
   `!resolving`, `!seen(key)` — plus a DEV `?<slug>-hint` preview that never
   stamps.
4. Acknowledge on the section page's mount (visiting = seen).
5. Add the preview to the table above.
