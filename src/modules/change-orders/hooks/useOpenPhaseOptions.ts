import { useState, useEffect } from "react"
import { fetchPageData } from "../../../shared/api/pageApi"

// One selectable open phase, flattened for the wizard's project picker.
export interface JobOption {
  recnum: string
  jobName: string
  label: string
}

// Shape of the /project-list response (cleanProjectList): projects, each
// with years, each with phases. We only need a few fields per phase.
interface RawPhase {
  num: string
  name?: string
  /** Full original job name (actrec.jobnme), already includes the phase. */
  fullName?: string
  status: number
  jobNum: string
  yearNum: string
}
interface RawYear {
  phases?: RawPhase[]
}
interface RawJob {
  name: string
  years?: RawYear[]
}

/** Every OPEN phase (status 4 = "Current") as a flat, sorted option list,
 *  keyed by the recnum the backend expects (YY + 4-digit job + 2-digit phase). */
export function useOpenPhaseOptions(enabled: boolean): { options: JobOption[]; loading: boolean } {
  const [options, setOptions] = useState<JobOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || options.length > 0) return
    setLoading(true)
    fetchPageData({ module: "projects", queries: [], params: {} })
      .then((result) => {
        const jobs = (result as { jobs?: RawJob[] }).jobs
        if (!Array.isArray(jobs)) return
        const seen = new Set<string>()
        const next: JobOption[] = []
        for (const job of jobs) {
          for (const year of job.years ?? []) {
            for (const phase of year.phases ?? []) {
              if (phase.status !== 4) continue
              const recnum =
                phase.jobNum.length === 4
                  ? `${phase.yearNum}${phase.jobNum}${phase.num}`
                  : phase.jobNum
              if (seen.has(recnum)) continue
              seen.add(recnum)
              // Prefer the full job name (includes the phase); fall back to
              // base name + phase label if the backend hasn't shipped it yet.
              const jobName = phase.fullName || `${job.name} ${phase.name || `P${phase.num}`}`
              next.push({ recnum, jobName, label: `${jobName} — ${recnum}` })
            }
          }
        }
        next.sort((a, b) => a.label.localeCompare(b.label))
        setOptions(next)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return { options, loading }
}
