# Onboarding State Unification — Design & Deliberation

**Status:** Second review complete (Jul 13 2026) — design confirmed with fixes adopted in §4.12; implementation underway per §6.
**Purpose of this doc:** Capture the full investigation and design rationale for centralizing the app's onboarding logic, so a second reviewer (or model) can double-check the reasoning before implementation begins.
**Audience:** Someone familiar with the codebase but *not* with the conversation that produced this. All file paths and code references are concrete so claims can be verified directly.

Repos referenced:
- Frontend: `/Users/quinnsieja/Documents/RD/frontend` (repo `quinncja/RenovationsFrontendV2`)
- Backend: `/Users/quinnsieja/Documents/RD/RenovationsBackend` (Node/Express + Mongoose; **prod-only**, deployed to a Raspberry Pi via git-pull every ~2 min — a push *is* a deploy)

---

## 1. Motivation

Onboarding logic is currently spread across four files that each independently re-derive "is this user onboarded?" from different signals. There is no single owner of onboarding state. Two first-run flows (layout selection and the day-after daily-recap greeting) run independently and are coupled only by a single localStorage marker. The goal is to **centralize onboarding state into one module**, then (in later phases) fix coachmark anchoring and build out a richer onboarding experience.

The user's stated end-goals that shaped the design:
1. One cohesive place for onboarding logic, so editing onboarding-related code is straightforward and doesn't silently break cohesion.
2. Support **future section-by-section onboarding** (explain each home-page section, including newly-released ones).
3. Support a **richer role-scoped onboarding** later — e.g. admin onboarding that explains how sections work, the "Incl. WIP" toggle (top-right), and the left navbar — with the layout/supervisor input being just the *first step* of a broader role sequence.
4. **Server-backed persistence** so clearing browser data / cookies does **not** force a user to redo onboarding.

---

## 2. Current-state investigation (verified against code)

### 2.1 The three flows (it's three, not two)

There are two role-split *setup* flows plus one shared *day-after greeting* flow.

**Flow A — Admin/exec layout walkthrough**
- Files: `src/modules/dashboard/context/DashboardLayoutContext.tsx` (state), `src/modules/dashboard/Dashboard.tsx` → `AdminDashboard` (trigger), `src/modules/dashboard/components/WelcomeWalkthrough.tsx` (UI: template cards + gear hint).
- Trigger: `hasChosenLayout === false`, derived from *no* `dashboard-layout:{uid}` in localStorage **and** `fetchDashboardLayout()` returning 404.
- Flow: `WelcomeWalkthrough` (pick one of 3 templates) → `chooseTemplate()` commits layout locally + saves to server → `GearHintPopover` ("customize via the gear"), dismissed via local `useState` in `Dashboard.tsx`.
- On completion `chooseTemplate()` calls `stampOnboardedAt(uid)`.
- Only admins/execs reach this. Managers get a fixed `EmployeeDetail` home (see `Dashboard.tsx` `isAdmin` branch), never the walkthrough.

**Flow B — Manager supervisor picker**
- Files: `src/App.tsx` gate (`useNeedsSupervisor`), `src/core/auth/pages/SupervisorSelect.tsx`.
- Trigger: role `manager` with no `employeeId` custom claim (`useNeedsSupervisor` = `role === 'manager' && claims['employeeId'] == null`).
- Flow: pick your name → `selectSupervisor()` POST → forced ID-token refresh mints the `employeeId` claim → gate clears, component unmounts.
- On completion `handleConfirm()` calls `stampOnboardedAt(uid)`.

**Flow C — Daily-report arrival + intro coachmarks (the "day after" flow)**
- File: `src/modules/dashboard/report/DailyReportContext.tsx` (`DailyReportProvider`, mounted in `App.tsx`).
- Trigger: a **synchronous** localStorage gate at first render (a lazy `useState` initializer, not an effect), gated on being onboarded **AND** `onboarded-at:{uid} !== today` **AND** `daily-report-seen:{uid} !== today`.
- The **intro variant** (when `daily-report-intro-seen:{uid}` is unset) is effectively onboarding step 2: the full-screen `DailyArrival` plus a coachmark sequence (header-clock spotlight → Reports nav-item hint). After the first time it's just the normal daily recap.
- "Onboarded" is re-derived here: PM → `employeeId` present; admin → `dashboard-layout:{uid}` cache present, with an **async `fetchDashboardLayout()` fallback** for a cold cache (the `pendingLayoutCheck` path).

### 2.2 The coupling point

`stampOnboardedAt(uid)` (defined in `DailyReportContext.tsx`) writes `onboarded-at:{uid} = chicagoToday()`. Both Flow A (`chooseTemplate`) and Flow B (`SupervisorSelect.handleConfirm`) call it. Flow C reads it so a brand-new user isn't greeted with "here's what happened yesterday" mid-setup — the first greeting is deferred to the next Chicago day.

### 2.3 localStorage markers (all per-uid)

| Key | Written in | Meaning | Onboarding? |
|---|---|---|---|
| `dashboard-layout:{uid}` | `DashboardLayoutContext` | layout JSON; presence ⇒ admin onboarded. **Also server-persisted** via `layoutApi`. | setup gate (derived) |
| `dashboard-section:{uid}` | `DashboardLayoutContext` | home pager position | No |
| `onboarded-at:{uid}` | `DailyReportContext` (`stampOnboardedAt`) | Chicago date onboarding finished | Yes |
| `daily-report-seen:{uid}` | `DailyReportContext` | Chicago date last greeted (per-day dedupe) | No (recurring) |
| `daily-report-intro-seen:{uid}` | `DailyReportContext` | "1" once intro coachmarks done | Yes (→ milestone `intro-tour`) |

### 2.4 The core problem: four independent "is onboarded?" derivations

| Where | Question | Signal |
|---|---|---|
| `App.tsx` (`useNeedsSupervisor`) | manager needs setup? | role + `employeeId` claim |
| `DashboardLayoutContext` | admin needs layout? | `dashboard-layout` cache + `fetchDashboardLayout()` |
| `DailyReportContext` | onboarded (to gate greeting)? | **re-derives both** — `employeeId` for PM; cache + `fetchDashboardLayout()` fallback for admin |
| `SupervisorSelect` / `chooseTemplate` | completing setup | both call `stampOnboardedAt` |

Consequences: the admin layout fetch can fire **twice** on load (once in `DashboardLayoutContext`, once in `DailyReportContext`'s fallback); markers are defined in `DailyReportContext` but written from three files; there is no single source of truth.

---

## 3. Coachmark anchoring findings (context for a later phase — NOT part of this refactor)

Investigated because the user was worried that moving buttons would silently break the hints. Finding: the three hints use **three different anchoring strategies with three different fragility levels** — an inconsistency worth fixing, but **deferred to a later phase**. Documented here so the state refactor is known not to touch it.

1. **Clock hint** (`report-hint`, in `DailyReportButton.tsx`) — **co-located, safe.** Rendered as a JSX child inside the button, wrapped in `.rpt-btn-anchor` (`position: relative`); hint is `position: absolute` against that wrapper. Move the button → hint follows. Good pattern.
2. **Gear hint** (`GearHintPopover` in `WelcomeWalkthrough.tsx`, CSS `.gear-hint` in `App.css` ~line 7392) — **decoupled by a magic number, fragile.** The pulse is a `highlight` prop threaded `Dashboard → DashboardHeaderActions → EditModeToggle`; the popover is rendered separately in `Dashboard.tsx` and positioned by hard-coded CSS (`top: 3.75rem; right: 4rem`) that manually matches the gear's location. Move the gear → pulse follows, popover strands. Silent visual break.
3. **Reports-nav hint** (`NavReportsHint.tsx`, mounted in `Navbar.tsx`) — **DOM-query anchored, silently breakable.** Finds its target via `document.querySelector('[data-nav="/reports"]')` + `getBoundingClientRect()`; the pulse is a separate `nav-button-attention` class added in `Navbar.tsx` when `introStep === 2`. If the target is missing it `return null`s — no crash, hint just disappears.

**Deferred fix (future phase):** a single `<Coachmark targetRef>` / `useAnchoredHint` primitive so every hint is defined next to its target and physically tracks it, making cohesion structural rather than conventional.

---

## 4. Design decisions & deliberation

Chronological record of the choices made and *why*, including alternatives rejected.

### 4.1 Two-phase refactor: state first, anchoring later
Agreed to split the work: **(1) unify state ownership** (this doc), **(2) unify anchoring** (later). Rationale: they're independent concerns; state unification is pure plumbing with a clear behavior-preservation contract, while anchoring is a UI primitive change.

### 4.2 New module owns state; delivery stays put
Introduce `core/onboarding` that answers "what onboarding step is this user on?" and owns the markers. The *delivery* surfaces (the walkthrough component, the supervisor page, the daily arrival) stay where they are and become consumers. Rationale: the coupling problem is about *state derivation*, not about where UI lives.

### 4.3 Shared prefs fetch (rejected the double-fetch)
`OnboardingProvider` (root) and `DashboardLayoutProvider` (page-scoped) both need the layout fetch — one for *presence*, one for the *data*.
- **Rejected:** each does its own fetch (perpetuates today's double-fetch).
- **Rejected:** layout provider is source of truth, onboarding reads from it (impossible — onboarding sits above the dashboard route; `DashboardLayoutProvider` only mounts on `/dashboard`, but `DailyReportProvider` needs onboarded-state on every route).
- **Chosen:** a session-memoized `loadUserPreferencesOnce()` returning `{ dashboardLayout, onboarding }`; both consumers share one request. Net fix of a current inefficiency.

### 4.4 Two-tier state model
Onboarding splits into two tiers that are **stored and resolved differently**:
- **Tier 1 — Setup gates:** blocking, role-specific, **derived** from already-durable authoritative state (`employeeId` claim / layout doc). **Never stored as onboarding flags** — duplicating them would create two sources of truth.
- **Tier 2 — Milestones:** non-blocking, additive, **stored** acknowledgment flags (`intro-tour`, `section:*`, future `feature:*`). These are what get server-backed.

### 4.5 Section onboarding generalizes to milestones (no new machinery)
"Explain a newly-released section" is the *same shape* as the intro tour — a discrete "user saw X" flag. So the generic `seen(key)`/`acknowledge(key)` API serves both. A milestone flag simply doesn't exist until acknowledged, so shipping `section:foo` makes `seen("section:foo")` false for **everyone** → each user sees it once, then never again. No version numbers or "new since" bookkeeping.

### 4.6 Server-backing via the existing `UserPreference` doc
Discovered the backend already has a per-user Mongo doc: `@users/schemas/UserPreference.js`, keyed by `uid`, currently `{ uid, dashboardLayout: Mixed, updatedAt }`, served at `GET/PUT /user/dashboard-layout` (`@users/routes/users.routes.js` ~line 207). **We extend this doc — no new table, no new pattern.**

Key realization: **most onboarding is already server-durable today.** Manager-onboarded = `employeeId` claim (Firebase, server-side); admin-onboarded = layout doc exists (server-side). The *only* durability gaps are `onboarded-at` (low stakes — worst case a greeting a day early) and, critically, **`intro-seen`** — clearing the browser currently replays the first-run coachmark tour. That's the specific annoyance server-backing removes.

### 4.7 Union merge for milestones; `??` for the date
Because "seen" is monotonic (only false→true), the local/server merge is a **union**: `seen(x)` is true if local OR server. No conflict resolution needed, and it re-primes a cleared browser from the server. `onboardedAt` is a single value resolved `local ?? server`.

### 4.8 `phase` describes Tier 1 only (dropped `active`/`complete` split)
An earlier draft had phases `active` | `complete`. **Rejected** because "complete" would flip back to "active" every time a new `section:*` milestone shipped — coupling gate state to the open-ended milestone set. **Chosen:** `phase` tracks Tier 1 only, with one terminal state; "is a milestone owed?" is answered by `seen()`, not `phase`.

### 4.9 Role-scoped phases with ordered step sequences
The user wants richer onboarding where the setup input is just step 1 of a broader role sequence (admin: layout → explain sections → explain WIP toggle → explain navbar). So:
- **Rejected:** narrow phase names `needs-supervisor` / `needs-layout` (describe only today's single input).
- **Chosen:** role-scoped phases `admin-onboarding` / `manager-onboarding`, each an **ordered sequence of steps**. Step 1 = the blocking setup input (derived completion); steps 2…n = coachmarks (milestone flags). Phase resolves to `onboarded` when all steps in its sequence are done. `step` (current step key) is exposed so the UI renders the right thing.

### 4.10 Sequence steps vs. incremental milestones
A fixed initial sequence must **not** absorb "new section released later" — that would reopen a completed phase for an established user. So:
- **Sequence steps** (`tour:sections`, `tour:wip`, `tour:navbar`): fixed initial onboarding; gate phase completion.
- **Incremental milestones** (`section:*`, `feature:*`): shown contextually to *anyone* who hasn't seen them; **never** touch `phase`.
- Both use identical `seen()`/`acknowledge()` storage. The only difference is whether a key appears in a role's sequence list.

### 4.11 Both sequences are pluggable and symmetric
`ADMIN_SEQUENCE` and `MANAGER_SEQUENCE` are both just data — a role→step-list map the engine is generic over. `MANAGER_SEQUENCE` shown as `["choose-supervisor"]` only because manager tour steps aren't specced yet, **not** because it's fixed; it grows the same way admin's will. The only role-specific hardcode is how each **blocking setup step** reports "done" (a small per-key lookup, see below). Any step key not in that lookup is treated as a coachmark resolved via `seen(key)`. Adding tour steps to either sequence requires **zero** engine edits.

> **Note from the user:** the eventual admin onboarding will likely take a *different approach* than the specific `tour:*` sequence sketched here. That's fine and expected — the sequence definitions in `sequences.ts` are deliberately pluggable, so the admin (and manager) steps can be redesigned later **without touching the core engine, storage, or consumer wiring.** Only `sequences.ts` (and, for a brand-new *blocking* step, the `SETUP_DONE` lookup) would change.

### 4.12 Terminal phase: `onboardedAt` wins (second-reviewer fix)
The reviewer found a real flaw in the original §5.6 mapping: gating consumers on `phase` breaks once sequences grow.
1. `App.tsx` gating on `phase === "manager-onboarding"` would render `SupervisorSelect` for a manager who *has* picked a supervisor but hasn't finished a future tour step — a full-screen setup page with nothing left to set up.
2. Shipping a new sequence step would flip every established user's phase back to `*-onboarding`, silently regressing anything keyed on "is onboarded" (the daily greeting would be suppressed; the welcome walkthrough could even reappear).

**Fixes adopted:**
- **Terminal phase:** `phase` resolves to `"onboarded"` if `onboardedAt` is stamped **OR** all sequence steps are done. Sequences only ever apply to users who haven't completed initial setup; new explainers for established users ship as **incremental milestones** (§4.10), never by growing a sequence retroactively.
- **Gate on `step`, not `phase`:** blocking delivery surfaces key on the current step (`step === "choose-supervisor"` / `step === "choose-layout"`), so a future coachmark step can never strand a user on a setup screen. `phase` remains for coarse consumers ("is onboarding fully done?"), which the terminal rule makes safe.
- **`phase` gains `"not-applicable"`** for users with no applicable role (WaitingRoom users, unknown roles). Harmless today because the `isInitialized` gate runs first, but the provider must have a defined answer.
- **Sequence lookup uses `effectiveRole()`** (`roles.ts`) so `owner`/`tech` collapse into the admin sequence, in lockstep with `Dashboard.tsx`'s `isAdmin` branch.

---

## 5. Final design

### 5.1 Module layout
```
core/onboarding/
  markers.ts             # all onboarding localStorage access (uid-scoped, storage-safe try/catch)
  sequences.ts           # role → ordered step list (the pluggable part) + SETUP_DONE lookup
  OnboardingProvider.tsx # provider + useOnboarding(); owns the prefs bootstrap + merge
```
Mounted in `main.tsx`: `AuthProvider → OnboardingProvider → Router` (above both the `App.tsx` setup gate and `DailyReportProvider`).

### 5.2 Sequences (pluggable)
```ts
// sequences.ts — data only; engine is generic over this
const SEQUENCES = {
  admin:   ["choose-layout",     "tour:sections", "tour:wip", "tour:navbar"], // placeholder; admin UX TBD
  manager: ["choose-supervisor", /* future manager tour steps */],
}

// The only role-specific hardcode: how each *blocking setup* step reports done.
// Any key NOT here is a coachmark, resolved via seen(key).
const SETUP_DONE = {
  "choose-layout":     (ctx) => ctx.hasLayout,      // layout doc exists
  "choose-supervisor": (ctx) => ctx.hasEmployeeId,  // employeeId claim set
}
```
`step` = the first step in the active role's sequence whose completion check is false.

### 5.3 API surface
```ts
interface OnboardingState {
  phase: "loading" | "not-applicable" | "admin-onboarding" | "manager-onboarding" | "onboarded"
  step: string | null          // current step key in the active sequence (null when onboarded)
  resolving: boolean           // bootstrap fetch in flight (cold-cache gating)
  onboardedAt: string | null
  seen(key: string): boolean
  acknowledge(key: string): void   // completing a coachmark step advances `step`
  completeSetup(): void            // stamp onboardedAt (on layout/supervisor commit)
}
```
- `phase` is **terminal** (§4.12): `onboardedAt` stamped ⇒ `"onboarded"`, regardless of unseen sequence steps.
- Blocking surfaces gate on `step`, not `phase` (§4.12).
- The provider mounts **before auth resolves** (unlike today's `DailyReportProvider`, which App.tsx mounts post-auth), so it must derive its value synchronously **during render** from claims + localStorage — not in a mount-time lazy initializer or effects — for the warm-path synchronous gate to survive.

### 5.4 Storage & sync (two-tier)

| What | Stored? | Server source | Resolve rule |
|---|---|---|---|
| Setup gates (step 1) | No | `employeeId` claim / layout doc | read authoritative server value (cache locally for fast paint) |
| Coachmark steps + incremental milestones | Yes | `UserPreference.onboarding.milestones` | **union** (local OR server) |
| `onboardedAt` | Yes | `UserPreference.onboarding.onboardedAt` | `local ?? server` |

- **Read:** one memoized `GET /user/preferences` → `{ dashboardLayout, onboarding }` per load. Warm localStorage paints synchronously (as today); cold cache waits on `resolving`. Union-merge server ∪ local, then write the union back to localStorage (re-primes a cleared browser). The memo must **clear on rejection** — otherwise one failed fetch bricks onboarding resolution for the whole session.
- **Write:** optimistic localStorage + background `PATCH /user/onboarding` (best-effort, mirrors `saveDashboardLayout`). On load, also push any locally-seen-but-server-missing flags up → eventual durability even if a prior PATCH failed.

### 5.5 Backend delta
- `UserPreference` schema: add `onboarding: { type: mongoose.Schema.Types.Mixed, default: null }` (additive, backward-compatible). Frontend owns the shape: `{ onboardedAt: string|null, milestones: { [key]: isoDate } }`.
- Routes (`@users/routes/users.routes.js`): add `GET /user/preferences` (returns `{ dashboardLayout, onboarding }`) and `PATCH /user/onboarding` (merge milestones / set onboardedAt). Existing `GET/PUT /user/dashboard-layout` stay for compatibility.
- **Deploy backend FIRST** (Pi git-pull ~2 min; push = deploy), then frontend. Schema change is additive so old frontend + new backend is safe.

### 5.6 Consumer migration map

| File | Today | After |
|---|---|---|
| `src/main.tsx` | `AuthProvider → Router` | wrap `OnboardingProvider` between them |
| `src/App.tsx` | `useNeedsSupervisor()` gate | `step === "choose-supervisor"` (gate on step, NOT phase — §4.12). `useIsInitialized`/`WaitingRoom` untouched (role provisioning ≠ onboarding) |
| `DashboardLayoutContext.tsx` | `hasChosenLayout` from cache+fetch; `stampOnboardedAt` | reads onboarding for gate/`isOnboarded`; layout data via shared prefs bootstrap; `completeSetup()` |
| `SupervisorSelect.tsx` | `stampOnboardedAt(uid)` | `onboarding.completeSetup()` |
| `DailyReportContext.tsx` | own marker reads + admin layout probe + `pendingLayoutCheck` state machine | reads `phase`/`resolving`/`onboardedAt`/`seen("intro-tour")`; `acknowledge("intro-tour")`; keeps `daily-report-seen` + `?arrival` dev forcing |

Markers moving into `markers.ts`: `onboarded-at`, `daily-report-intro-seen` (→ milestone `intro-tour`).
Staying put: `daily-report-seen` (recurring, daily-recap concern), `dashboard-section` (not onboarding).

### 5.7 Behavior-preservation checklist
1. Warm cache → arrival still paints synchronously (first paint, `isOnboarded` sync-true).
2. Cold-admin new device → app renders, late overlay (old `pendingLayoutCheck` → now `resolving`).
3. Just-onboarded today → no greeting until tomorrow (`onboardedAt === today`).
4. First greeting → intro variant + coachmarks (`!seen("intro-tour")`).
5. **New capability:** cleared browser for an established user → server union re-primes → **no repeat tour**.
6. StrictMode double-mount → memoized fetch dedupes; real double-greet blocked by `daily-report-seen`.
7. Dev previews (`?arrival`, `?welcome`, `?welcome-pm`, `?report`) → untouched (delivery-layer concerns).
8. **Known accepted change:** today `DashboardLayoutContext` refetches the layout on every dashboard mount (picking up cross-device edits mid-session); the once-per-load memo drops that to reload-only. Deliberate, not a regression.

---

## 6. Implementation order (each step independently verifiable)
1. **Backend** — `UserPreference.onboarding` field + `GET /user/preferences` + `PATCH /user/onboarding`; deploy to Pi.
2. **`core/onboarding`** — `markers.ts`, `sequences.ts`, `OnboardingProvider.tsx`, memoized prefs bootstrap + union merge (no consumers wired yet).
3. **Rewire consumers one at a time**, verifying behavior after each: `App.tsx` → `SupervisorSelect.tsx` → `DashboardLayoutContext.tsx` → `DailyReportContext.tsx`.

---

## 7. Deferred / explicit non-goals
- **Coachmark anchoring** cleanup (§3) — separate later phase; a shared anchored-hint primitive.
- **Final admin/manager onboarding UX** — this refactor only makes the sequences pluggable; step definitions in `sequences.ts` get redesigned later with zero core changes.

---

## 8. Review asks for the second reviewer
Please sanity-check specifically:
1. **Synchronous-gate preservation.** `DailyReportContext`'s first-paint gate is a lazy `useState` initializer reading localStorage *synchronously*. Does routing "is admin onboarded?" through `OnboardingProvider` still allow a synchronous first-paint decision for warm-cache users, with `resolving` covering only the cold-cache case? (Design intent: yes — verify no hidden async is introduced on the warm path.)
2. **Provider placement.** `OnboardingProvider` between `AuthProvider` and `Router` in `main.tsx`. Confirm it has `useAuth()` access there and sits above *both* the `App.tsx` manager gate and `DailyReportProvider`. (Note: `App` is a layout-route element inside `Router`; the manager gate returns `SupervisorSelect` *instead of* the `DailyReportProvider` subtree, so onboarding must be above the whole `App` route.)
3. **Union merge correctness.** Confirm monotonic "seen" flags make union the right merge and that writing the union back to localStorage is safe (no way for a flag to incorrectly resurrect after an intentional reset — note: there is currently no "reset onboarding" feature; if one is added later, union+localStorage-reprime would fight it and need a tombstone).
4. **Double-fetch elimination.** Verify `loadUserPreferencesOnce()` actually removes the current two `fetchDashboardLayout()` calls and that `DashboardLayoutContext` can get its layout *data* from the shared payload without losing its edit/save semantics.
5. **Deploy safety.** Confirm the additive `onboarding` field + new routes are backward-compatible with the currently-deployed frontend (old frontend ignores unknown fields / never calls new routes).
6. **Anything that breaks the behavior-preservation checklist (§5.7).**
