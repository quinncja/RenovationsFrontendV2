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
  nav-item hint (`NavSectionHint` targeting `nav-reports`, `introStep` 2). Subsequent days are the
  plain recap. Auto-open starts the day AFTER `onboardedAt`.

**D — Job Costing interactive tour (incremental milestone `jobcost-intro`)**
- `modules/jobcost/onboarding/JobcostIntro.tsx`, mounted in `App.tsx` (NOT the
  lazy Jobcost chunk — a /jobcost refresh must paint the cover with the
  shell, and the host must survive the mid-tour route change); engages on the
  `/jobcost` route; while onboarding state resolves it holds the (empty)
  welcome glass rather than flashing the board. A frosted welcome overlay
  covers the page CONTENT only (`.jct-welcome` — its left edge rides the
  navbar's LIVE width via the `navbar` coach target + ResizeObserver, so the
  nav stays crisp open or closed), then hands off to the `Coachmark` in its
  `variant="tour"` dress (lighter backdrop, spring card entrances) and the
  user performs each taught action for real (interactive cutout, no shield):
  open a property — the Property-view pitch, with the cutout GROWING live
  with the card — → the Phase Work / One-Off Work split (both summaries stay
  in focus and clickable) → pin → the year + phase filters (shielded beat:
  they default to the current phase, changeable any time in Settings —
  `useJobcostDefaultRange`) → a closing note on the view toggle (the previous
  board lives on as the Project view), where the tour ends. It
  never leaves the board: no report-page beats, no double-click/View
  teaching. Interactive beats carry a quiet "Next" escape hatch that
  performs the action instead. The board publishes state / registers a
  controller via `modules/jobcost/onboarding/tourBus.ts`. On finish or skip
  the tour RESTORES pre-tour pins/view (through the controller when the
  board is mounted, else straight to localStorage), then acknowledges.
  Opening a real property report mid-tour counts as graduating (finish);
  leaving Job Costing any other way aborts without acknowledging and the
  tour replays next visit. Mobile never engages (the taught surfaces are
  desktop-only), so mobile-only users keep the milestone unseen until a
  desktop visit.

**E — New-section announcements (incremental milestones)**
- Registry-driven: `sectionAnnouncements.ts` (this directory) lists every
  shipped announcement oldest → newest; `Navbar.tsx` renders at most ONE —
  the newest unseen entry — via `NavSectionHint.tsx` (one-time popover,
  non-blocking, veils under an open flyout). Older unseen entries are silently
  acknowledged while a newer one shows (superseded — a user who missed several
  releases gets one hint, never a queue), and visiting the announced section
  acknowledges it too. An entry can anchor to a nav GROUP (`navGroup`) or a
  leaf nav item (`navPath`), and can defer to an older hint via `requiresSeen`
  (until that milestone is seen, the entry isn't eligible — the older hint
  shows and nothing is retired). Instances: `section:overhead-report` on the
  Finances group (page-visit acknowledge in `OverheadReportPage.tsx`);
  `section:jobcost-redesign` on the Job Cost item (requires the overhead hint
  seen first; page-visit acknowledge in `Jobcost.tsx`).

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
  hint card; blocking (click shield) by default, or `interactive` (the hole
  passes clicks to the real control and the CTA is a quiet "Next" escape
  hatch — the Job Costing tour's mode). Targets come from `coachTargets.ts`,
  a callback-ref registry (`registerCoachTarget` / `useCoachTarget`, plus
  `coachTargetRef` for owners that swap instances) — never
  `document.querySelector` for new work.
- `NavSectionHint.tsx` — non-blocking nav popover for `section:*` milestones
  (framer entrance/exit, ResizeObserver anchor tracking, `.nav-hint--motion`
  z 150 so full-screen overlays cover it).
- The intro's Reports popover is `NavSectionHint` targeting `nav-reports`
  (registered in Navbar.tsx's `reportsRef`), rendered inline in Navbar.tsx —
  no longer a standalone component (formerly `NavReportsHint.tsx`, which
  predated the registry and used `document.querySelector`).
- `.nav-button-attention` — copper `coachPulse` ring on the nav item being
  pointed at.

## Observability

Owner/tech can inspect any user's onboarding state in the Users page's advanced
modal view: an "Onboarding" checklist (initial setup + every milestone, with
seen dates) fed by `GET /users/:uid/onboarding` (analytics-admin gated). The
checklist unions `MILESTONE_LABEL` in `UserActivityModal.tsx` with the record's
actual keys — add a label there when shipping a new milestone so it reads
nicely.

## Dev previews (all DEV-only, none stamp markers)

| Param | Shows |
|---|---|
| `?tour` / `?welcome` (desktop) | Admin onboarding tour |
| `?welcome` (mobile) | WelcomeWalkthrough template picker |
| `?arrival` / `?arrival-intro` | Daily arrival / its intro variant |
| `?report` | Daily report modal (manual-reopen surface) |
| `?overhead-hint` | Finances new-section hint |
| `?jobcost-hint` | Job Cost redesign nav hint |
| `?jobcost-intro` (on `/jobcost`, desktop) | Job Costing redesign intro |
| `?idle` | Idle refresh overlay (not onboarding, mirrors the pattern) |

## Shipping the next `section:*` announcement

1. Add the key constant in `markers.ts` (`section:<slug>`).
2. Add a `CoachTargetId` in `coachTargets.ts` for the nav anchor (new anchors
   only — announcements on an already-registered group reuse its id).
3. APPEND an entry to `SECTION_ANNOUNCEMENTS` in `sectionAnnouncements.ts`
   (order is age — newest last; the Navbar shows only the newest unseen entry
   and retires the rest). Gating, pulse, preview, and target registration all
   follow from the registry.
4. Acknowledge on the section page's mount (visiting = seen).
5. Add a `MILESTONE_LABEL` entry in `UserActivityModal.tsx` (Observability)
   and the preview param to the table above.
