import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "../auth/AuthProvider"
import { effectiveRole } from "../auth/roles"
import { fetchUserPreferences, patchOnboarding, type UserPreferences } from "../../shared/api/preferencesApi"
import { SEQUENCES, SETUP_DONE } from "./sequences"
import {
  hasLayoutCache,
  readMilestones,
  readOnboardedAt,
  stampOnboardedAt,
  writeMilestone,
  writeMilestones,
  writeOnboardedAt,
} from "./markers"

// ─── Shared prefs bootstrap ────────────────────────────────────────────────────
// One GET /user/preferences per page load, shared with DashboardLayoutContext so
// the layout is never fetched twice. The memo also dedupes React StrictMode's
// double mount. It CLEARS on rejection — otherwise one failed fetch would brick
// onboarding resolution (and the layout load) for the rest of the session.
let prefsPromise: Promise<UserPreferences> | null = null

// eslint-disable-next-line react-refresh/only-export-components
export function loadUserPreferencesOnce(): Promise<UserPreferences> {
  if (!prefsPromise) {
    prefsPromise = fetchUserPreferences().catch((error) => {
      prefsPromise = null
      throw error
    })
  }
  return prefsPromise
}

// ─── Public shape ──────────────────────────────────────────────────────────────

export type OnboardingPhase =
  | "loading"
  | "not-applicable"
  | "admin-onboarding"
  | "manager-onboarding"
  | "onboarded"

export interface OnboardingState {
  /** Coarse Tier-1 status. Terminal: onboardedAt stamped ⇒ "onboarded" even with
   *  unseen sequence steps (§4.12). Blocking surfaces gate on `step`, not this. */
  phase: OnboardingPhase
  /** First incomplete step in the active role's sequence (null when onboarded). */
  step: string | null
  /** Bootstrap fetch in flight AND the user is a cold-cache onboarding candidate.
   *  Warm-cache users never see this true. */
  resolving: boolean
  onboardedAt: string | null
  seen(key: string): boolean
  /** Acknowledge a coachmark / milestone — optimistic local write + background push. */
  acknowledge(key: string): void
  /** Stamp onboardedAt on a setup commit (layout chosen / supervisor picked). */
  completeSetup(): void
}

const OnboardingContext = createContext<OnboardingState | null>(null)

// ─── Local-derived data ────────────────────────────────────────────────────────
// Everything the provider can answer synchronously from localStorage at render,
// plus the session-mutable overlay (server merge / acknowledge / completeSetup).

interface OnboardingData {
  onboardedAt: string | null
  milestones: Record<string, string>
  /** dashboard-layout cache present, OR server returned a layout, OR setup done
   *  this session. Drives the admin `choose-layout` gate. */
  hasLayout: boolean
  resolving: boolean
}

/** admin/executive collapse to the admin sequence; manager to its own. */
function sequenceRoleFor(role: string | undefined): "admin" | "manager" | null {
  const eff = effectiveRole(role)
  if (eff === "executive" || eff === "admin") return "admin"
  if (eff === "manager") return "manager"
  return null
}

// Synchronous first-paint read. Keyed by uid so a warm-cache user gets a real
// answer the moment auth resolves — not a pre-auth snapshot captured at mount.
function initData(uid: string | null, role: string | undefined): OnboardingData {
  if (!uid) return { onboardedAt: null, milestones: {}, hasLayout: false, resolving: false }
  const onboardedAt = readOnboardedAt(uid)
  const hasLayout = hasLayoutCache(uid)
  const milestones = readMilestones(uid)
  // `resolving` marks a cold local store: an onboarding-relevant user with no
  // local evidence at all (no onboardedAt, no milestones, and for admins no
  // layout cache) — a cleared browser or a new device. Only they wait on the
  // bootstrap; it's what lets the server union suppress an intro-tour replay
  // (§5.7 #5) instead of the greeting activating with stale local state.
  const seqRole = sequenceRoleFor(role)
  const hasLocalEvidence = onboardedAt != null || Object.keys(milestones).length > 0
  const resolving =
    !hasLocalEvidence && (seqRole === "manager" || (seqRole === "admin" && !hasLayout))
  return { onboardedAt, milestones, hasLayout, resolving }
}

/**
 * Owns onboarding state for the whole app. Mounted in main.tsx between
 * AuthProvider and Router — ABOVE both the App.tsx setup gate and
 * DailyReportProvider. It mounts before auth resolves, so it derives its value
 * synchronously during render from claims + localStorage (a warm-cache user must
 * get an answer the instant consumers render); the bootstrap fetch only backs the
 * cold-cache case, covered by `resolving`.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, claims, loading } = useAuth()
  const uid = user?.uid ?? null
  const role = claims["role"] as string | undefined
  const hasEmployeeId = claims["employeeId"] != null

  // Re-derive the local base whenever the signed-in uid changes (null → value
  // when auth resolves, or on account switch). Setting state during render is the
  // supported "reset on prop change" pattern — it runs before commit, so the very
  // first render with a real uid already reflects that user's localStorage.
  const [syncedUid, setSyncedUid] = useState<string | null>(uid)
  const [data, setData] = useState<OnboardingData>(() => initData(uid, role))
  if (uid !== syncedUid) {
    setSyncedUid(uid)
    setData(initData(uid, role))
  }

  // Bootstrap: pull the shared prefs payload, union-merge server ∪ local, resolve
  // onboardedAt (local ?? server), then push any local-only flags up. Runs once
  // per uid; the module memo dedupes StrictMode's double mount.
  useEffect(() => {
    if (!uid) return
    let cancelled = false

    loadUserPreferencesOnce()
      .then((prefs) => {
        if (cancelled) return

        const localMilestones = readMilestones(uid)
        const serverMilestones = prefs.onboarding?.milestones ?? {}
        // Union — "seen" is monotonic, so local OR server; keep the local value
        // where both have a key. Write it back to re-prime a cleared browser.
        const union = { ...serverMilestones, ...localMilestones }
        writeMilestones(uid, union)

        const localOnboardedAt = readOnboardedAt(uid)
        const serverOnboardedAt = prefs.onboarding?.onboardedAt ?? null
        const onboardedAt = localOnboardedAt ?? serverOnboardedAt
        if (!localOnboardedAt && serverOnboardedAt) writeOnboardedAt(uid, serverOnboardedAt)

        const serverHasLayout = prefs.dashboardLayout != null
        setData((d) => ({
          onboardedAt,
          milestones: union,
          hasLayout: d.hasLayout || serverHasLayout,
          resolving: false,
        }))

        // Push-up: local flags / onboardedAt the server lacks (diff first — no
        // PATCH if there's nothing to push). Best-effort durability even if a
        // prior PATCH failed.
        const pushMilestones: Record<string, string> = {}
        for (const [key, value] of Object.entries(localMilestones)) {
          if (serverMilestones[key] == null) pushMilestones[key] = value
        }
        const pushOnboardedAt = localOnboardedAt && !serverOnboardedAt ? localOnboardedAt : undefined
        const hasMilestonePush = Object.keys(pushMilestones).length > 0
        if (hasMilestonePush || pushOnboardedAt) {
          patchOnboarding({
            ...(hasMilestonePush ? { milestones: pushMilestones } : {}),
            ...(pushOnboardedAt ? { onboardedAt: pushOnboardedAt } : {}),
          }).catch(() => {
            // best-effort — retried next load from the same local diff
          })
        }
      })
      .catch(() => {
        if (cancelled) return
        // Fetch failed — a cold-cache candidate must stop waiting (can't confirm
        // onboarding, so treat as not a candidate rather than hang on resolving).
        setData((d) => (d.resolving ? { ...d, resolving: false } : d))
      })

    return () => {
      cancelled = true
    }
  }, [uid])

  const seen = useCallback((key: string) => data.milestones[key] != null, [data.milestones])

  const acknowledge = useCallback(
    (key: string) => {
      if (!uid) return
      const iso = new Date().toISOString()
      const next = writeMilestone(uid, key, iso)
      setData((d) => ({ ...d, milestones: next }))
      patchOnboarding({ milestones: { [key]: iso } }).catch(() => {
        // best-effort — the local flag re-pushes on next load if this fails
      })
    },
    [uid]
  )

  const completeSetup = useCallback(() => {
    if (!uid) return
    const date = stampOnboardedAt(uid)
    // Stamp + mark setup done so `phase` flips to "onboarded" this render (the
    // terminal rule), regardless of the layout fetch's timing.
    setData((d) => ({ ...d, onboardedAt: date, hasLayout: true, resolving: false }))
    patchOnboarding({ onboardedAt: date }).catch(() => {
      // best-effort — re-pushed on next load if this fails
    })
  }, [uid])

  // ── Derive phase + step ──────────────────────────────────────────────────────
  const seqRole = sequenceRoleFor(role)
  const sequence = seqRole ? SEQUENCES[seqRole] : null

  let phase: OnboardingPhase
  let step: string | null = null
  if (loading) {
    phase = "loading"
  } else if (!uid || !sequence) {
    phase = "not-applicable"
  } else {
    const ctx = { hasLayout: data.hasLayout, hasEmployeeId }
    const stepDone = (key: string) => {
      const setupCheck = SETUP_DONE[key]
      return setupCheck ? setupCheck(ctx) : data.milestones[key] != null
    }
    const firstIncomplete = sequence.find((key) => !stepDone(key)) ?? null
    // Terminal (§4.12): onboardedAt wins outright; otherwise onboarded once every
    // sequence step is done.
    if (data.onboardedAt != null || firstIncomplete === null) {
      phase = "onboarded"
    } else {
      phase = seqRole === "admin" ? "admin-onboarding" : "manager-onboarding"
      step = firstIncomplete
    }
  }

  return (
    <OnboardingContext.Provider
      value={{
        phase,
        step,
        resolving: data.resolving,
        onboardedAt: data.onboardedAt,
        seen,
        acknowledge,
        completeSetup,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOnboarding(): OnboardingState {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider")
  return ctx
}
