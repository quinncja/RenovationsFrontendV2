import { useState, useCallback, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import Page from "../../../shared/components/Page"
import { Widget } from "../../../shared/components/Widget/Widget"
import { createChangeOrder, type ChangeOrderData } from "../../../shared/api/mutationApi"
import { fetchPageData } from "../../../shared/api/pageApi"
import { formatMoneyFull } from "../../../shared/utils/format"
import { Upload, ArrowLeft } from "lucide-react"
import { useAuth } from "../../../core/auth/AuthProvider"
import { parseChangeOrderExcel } from "../utils/parseExcel"
import { JobCombobox, type JobOption } from "./JobCombobox"

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

export default function NewChangeOrder() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [jobOptions, setJobOptions] = useState<JobOption[]>([])
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null)
  const [coData, setCOData] = useState<Omit<ChangeOrderData, "recnum" | "jobString" | "user"> | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [missingJob, setMissingJob] = useState(false)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  // /project-list returns { jobs, clients, supervisors }. Flatten jobs →
  // years → phases into one option per OPEN phase (status 4 = "Current"),
  // matching the recnum the backend expects (YY + 4-digit job + 2-digit phase).
  useEffect(() => {
    fetchPageData({ module: "projects", queries: [], params: {} })
      .then(result => {
        const jobs = (result as { jobs?: RawJob[] }).jobs
        if (!Array.isArray(jobs)) return
        const seen = new Set<string>()
        const options: JobOption[] = []
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
              options.push({ recnum, jobName, label: `${jobName} — ${recnum}` })
            }
          }
        }
        options.sort((a, b) => a.label.localeCompare(b.label))
        setJobOptions(options)
      })
      .catch(() => {})
  }, [])

  const handleFile = useCallback(async (file: File) => {
    try {
      const parsed = await parseChangeOrderExcel(file)
      setCOData(parsed)
      setError("")
    } catch (err) {
      setError((err as Error).message || "Failed to parse Excel file")
    }
  }, [])

  // A file handed off from the Change Orders page (via the "+ New" picker
  // or a drag-drop onto the table) arrives in router state — parse it once.
  useEffect(() => {
    const incoming = (location.state as { file?: File } | null)?.file
    if (incoming instanceof File) handleFile(incoming)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-picking the same file
    if (file) handleFile(file)
  }

  async function handleSubmit() {
    if (!coData) return
    if (!selectedJob) {
      setMissingJob(true)
      return
    }
    setSubmitting(true)
    setError("")
    try {
      await createChangeOrder({
        ...coData,
        recnum: selectedJob.recnum,
        jobString: selectedJob.jobName,
        user: user?.displayName || user?.email || "Unknown",
      })
      navigate("/change-orders")
    } catch (err) {
      setError((err as Error).message || "Failed to submit change order")
    } finally {
      setSubmitting(false)
    }
  }

  const subtotal = coData ? coData.material + coData.labor + coData.subs + coData.wtpm : 0
  const markup = coData ? coData.total - subtotal : 0
  const markupPct = subtotal > 0 ? ((markup / subtotal) * 100).toFixed(1) : "0.0"

  return (
    <Page
      title="New Change Order"
      actions={
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button className="button secondary-button" onClick={() => navigate("/change-orders")}>
            <ArrowLeft size={16} /> Back
          </button>
          {coData && (
            <button className="button secondary-button" onClick={() => replaceInputRef.current?.click()}>
              <Upload size={15} /> Replace file
            </button>
          )}
          <input
            ref={replaceInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileInput}
          />
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {!coData ? (
          /* Upload — shown until a file is parsed. */
          <Widget title="Upload Change Order Excel">
            <div
              className={`drop-zone ${dragOver ? "drop-zone-active" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload size={32} />
              <p>Drag & drop an Excel file here, or click to browse</p>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileInput} />
            </div>
            {error && <p className="auth-error" style={{ marginTop: "0.75rem" }}>{error}</p>}
          </Widget>
        ) : (
          <>
            {/* Preview of the parsed change order. */}
            <Widget className="co-preview-widget">
              <div className="co-preview-head">
                <div className="co-preview-head-top">
                  <div className="co-modal-title">
                    <h2 className="title2 emphasized">{coData.name || "Change Order"}</h2>
                    <span className="co-modal-subtitle">
                      {coData.lineItems.length} line item{coData.lineItems.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="co-preview-actions">
                    {(error || missingJob) && (
                      <div className="co-preview-hint">
                        <span className="auth-error">{error || "Please select a job number."}</span>
                      </div>
                    )}
                    <div className="co-preview-actions-row">
                      <JobCombobox
                        id="co-job-select"
                        options={jobOptions}
                        value={selectedJob}
                        onChange={(job) => {
                          setSelectedJob(job)
                          if (job) setMissingJob(false)
                        }}
                        invalid={missingJob}
                        placeholder={jobOptions.length === 0 ? "Loading jobs…" : "Job number (required)…"}
                      />
                      <button
                        className="button primary-button"
                        onClick={handleSubmit}
                        disabled={submitting}
                      >
                        {submitting ? "Submitting…" : "Submit"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="co-modal-totals">
                <div className="co-modal-total">
                  <span className="co-modal-total-label">Cost</span>
                  <span className="co-modal-total-value">{formatMoneyFull(subtotal)}</span>
                </div>
                <div className="co-modal-total">
                  <span className="co-modal-total-label">Markup ({markupPct}%)</span>
                  <span className="co-modal-total-value">{formatMoneyFull(markup)}</span>
                </div>
                <div className="co-modal-total co-modal-total-primary">
                  <span className="co-modal-total-label">Total</span>
                  <span className="co-modal-total-value">{formatMoneyFull(coData.total)}</span>
                </div>
              </div>

              {coData.lineItems.length === 0 ? (
                <p className="table-empty" style={{ padding: "1.25rem" }}>No line items</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Unit</th>
                      <th style={{ textAlign: "right" }}>Labor</th>
                      <th style={{ textAlign: "right" }}>Material</th>
                      <th style={{ textAlign: "right" }}>Subs</th>
                      <th style={{ textAlign: "right" }}>WTPM</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coData.lineItems.map((item, i) => (
                      <tr key={i}>
                        <td>{item.desc}</td>
                        <td>{item.unit}</td>
                        <td style={{ textAlign: "right" }}>{formatMoneyFull(item.labor)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoneyFull(item.material)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoneyFull(item.subs)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoneyFull(item.wtpm)}</td>
                        <td style={{ textAlign: "right" }}>{formatMoneyFull(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="co-modal-foot">
                      <td>Totals</td>
                      <td className="text-secondary">{coData.lineItems.length} item{coData.lineItems.length !== 1 ? "s" : ""}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(coData.labor)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(coData.material)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(coData.subs)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(coData.wtpm)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(subtotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </Widget>
          </>
        )}
      </div>
    </Page>
  )
}
