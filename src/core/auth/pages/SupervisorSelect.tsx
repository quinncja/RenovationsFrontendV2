import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "../AuthProvider"
import { auth } from "../firebase"
import { fetchPageData } from "../../../shared/api/pageApi"
import { selectSupervisor } from "../../../shared/api/mutationApi"
import { stampOnboardedAt } from "../../../modules/dashboard/report/DailyReportContext"
import { EmployeeAvatar } from "../../../shared/components/EmployeeAvatar/EmployeeAvatar"
import { ConfirmModal } from "../../../shared/components/ConfirmModal/ConfirmModal"

// /project-list returns { jobs, clients, supervisors }. We only need the
// supervisors here — one per SAGE employee who supervises a job.
interface Supervisor {
  id: number
  name: string
  jobIds: string[]
}

// Used only in preview mode (?welcome-pm) when the real /project-list request
// can't authenticate (DEV_BYPASS) or returns nothing — so the populated UI is
// visible without a manager account. "Dev User" matches the DEV_BYPASS display
// name so the "Recommended" highlight is demonstrated too.
const PREVIEW_SUPERVISORS: Supervisor[] = [
  { id: 101, name: "Dev User", jobIds: ["2310001", "2310002"] },
  { id: 102, name: "Alex Carpenter", jobIds: ["2310010"] },
  { id: 103, name: "Jordan Rivera", jobIds: [] },
  { id: 104, name: "Sam Donovan", jobIds: ["2310020", "2310021", "2310022"] },
]

function firstToken(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? ""
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/)
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") }
}

/**
 * First-run screen for a project manager: pick which supervisor you are. The
 * choice is tied to the account as the `employeeId` custom claim (backend
 * validates it against the live supervisor list), after which the dashboard is
 * scoped to that supervisor's projects. Gated in by useNeedsSupervisor — only
 * a `manager` with no `employeeId` claim reaches this. Mirrors the old app's
 * UserInitializer, streamlined for the Firebase-claims auth model.
 */
export default function SupervisorSelect({ preview = false }: { preview?: boolean }) {
  const { user } = useAuth()
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [candidate, setCandidate] = useState<Supervisor | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>("")
  const [showNotListed, setShowNotListed] = useState(false)

  // Status updates happen in the async callbacks (not synchronously), so this
  // is safe to call from the mount effect without triggering cascading renders.
  const fetchSupervisors = useCallback(() => {
    fetchPageData({ module: "projects", queries: [], params: {} })
      .then((result) => {
        const list = (result as { supervisors?: Supervisor[] }).supervisors
        const sorted = Array.isArray(list)
          ? [...list].sort((a, b) => a.name.localeCompare(b.name))
          : []
        // In preview, fall back to mock data so the populated UI is visible
        // even when the request is unauthenticated or returns nothing.
        if (sorted.length === 0 && preview) {
          setSupervisors(PREVIEW_SUPERVISORS)
          setStatus("ready")
          return
        }
        setSupervisors(sorted)
        setStatus("ready")
      })
      .catch(() => {
        if (preview) {
          setSupervisors(PREVIEW_SUPERVISORS)
          setStatus("ready")
          return
        }
        setStatus("error")
      })
  }, [preview])

  function retry() {
    setStatus("loading")
    fetchSupervisors()
  }

  useEffect(() => {
    fetchSupervisors()
  }, [fetchSupervisors])

  // Highlight the supervisor whose first name matches the signed-in user's.
  const recommendedFirst = firstToken(user?.displayName)
  const ordered = useMemo(() => {
    if (!recommendedFirst) return supervisors
    return [...supervisors].sort((a, b) => {
      const am = firstToken(a.name) === recommendedFirst ? 0 : 1
      const bm = firstToken(b.name) === recommendedFirst ? 0 : 1
      return am - bm || a.name.localeCompare(b.name)
    })
  }, [supervisors, recommendedFirst])

  async function handleConfirm() {
    if (!candidate) return
    if (preview) {
      // Non-destructive in preview — never POST or touch real claims.
      setCandidate(null)
      setSubmitError("")
      return
    }
    setSubmitting(true)
    setSubmitError("")
    try {
      await selectSupervisor(candidate.id)
      // Onboarding just completed — the daily report first greets tomorrow.
      if (user?.uid) stampOnboardedAt(user.uid)
      // Force-refresh the ID token so AuthProvider's onIdTokenChanged picks up
      // the new employeeId claim → the App gate clears and this unmounts. No
      // manual navigation needed.
      await auth.currentUser?.getIdToken(true)
    } catch {
      setSubmitError("Couldn't save your selection. Please try again.")
      setSubmitting(false)
    }
  }

  async function handleRefresh() {
    await auth.currentUser?.getIdToken(true)
  }

  return (
    <div className="supervisor-select">
      <div className="supervisor-select-card">
        {preview && (
          <div className="supervisor-select-preview-banner">
            Preview mode — selections aren't saved
          </div>
        )}
        <h1 className="supervisor-select-title">Let's set up your account</h1>
        <p className="supervisor-select-subtitle">
          Select your name below to get started. This connects your dashboard to
          the projects you supervise.
        </p>

        {status === "loading" && (
          <div className="supervisor-select-state">
            <span className="wr-dot wr-dot--connecting" />
            <span>Loading supervisors…</span>
          </div>
        )}

        {status === "error" && (
          <div className="supervisor-select-state">
            <p>Couldn't load the supervisor list.</p>
            <button className="button secondary-button" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {status === "ready" && ordered.length === 0 && (
          <div className="supervisor-select-state">
            <p>
              No supervisors are available yet. You'll be able to set up your
              account once you've been assigned a project in SAGE.
            </p>
            <button className="button secondary-button" onClick={handleRefresh}>
              Refresh
            </button>
          </div>
        )}

        {status === "ready" && ordered.length > 0 && (
          <>
            <div className="supervisor-select-grid">
              {ordered.map((s) => {
                const { firstName, lastName } = splitName(s.name)
                const recommended = firstToken(s.name) === recommendedFirst && !!recommendedFirst
                return (
                  <button
                    key={s.id}
                    className={`supervisor-card${recommended ? " supervisor-card--recommended" : ""}`}
                    onClick={() => setCandidate(s)}
                  >
                    {recommended && <span className="supervisor-card-badge">Recommended</span>}
                    <EmployeeAvatar firstName={firstName} lastName={lastName} />
                    <span className="supervisor-card-name">{s.name}</span>
                    <span className="supervisor-card-id">Employee ID: {s.id}</span>
                  </button>
                )
              })}
            </div>

            <button
              className="supervisor-select-notlisted"
              onClick={() => setShowNotListed((v) => !v)}
            >
              My name isn't listed
            </button>
            {showNotListed && (
              <p className="supervisor-select-notlisted-note">
                If you don't see your name, you haven't been assigned a project in
                SAGE yet. Once you have, refresh this page and your name will
                appear. Reach out to an admin if you think this is a mistake.
              </p>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        open={!!candidate}
        title={candidate ? `Are you ${candidate.name}?` : ""}
        message="This connects your account to the projects this supervisor manages. Let an admin know if you need to change it later."
        confirmLabel="Yes, that's me"
        cancelLabel="Cancel"
        loading={submitting}
        error={submitError || undefined}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (submitting) return
          setCandidate(null)
          setSubmitError("")
        }}
      />
    </div>
  )
}
