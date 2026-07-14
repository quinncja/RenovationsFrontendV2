// Role → ordered onboarding step list — data only; OnboardingProvider is generic
// over it. Only the BLOCKING setup steps ship today: the doc's placeholder
// `tour:*` steps are deliberately omitted (§4.12) — a sequence step that isn't
// already done reopens onboarding for every established user, and the admin tour
// UX is TBD. New explainers for established users ship as incremental milestones
// (contextual, resolved via seen(key)), never by growing a sequence retroactively.
export const SEQUENCES: Record<string, string[]> = {
  admin: ["choose-layout"],
  manager: ["choose-supervisor"],
}

// Context a setup step reads to report "done" — derived from already-durable
// authoritative state (never stored as an onboarding flag).
export interface SetupContext {
  hasLayout: boolean
  hasEmployeeId: boolean
}

// The only role-specific hardcode: how each BLOCKING setup step reports done.
// Any step key NOT here is a coachmark, resolved via seen(key).
export const SETUP_DONE: Record<string, (ctx: SetupContext) => boolean> = {
  "choose-layout": (ctx) => ctx.hasLayout, // layout doc exists
  "choose-supervisor": (ctx) => ctx.hasEmployeeId, // employeeId claim set
}
