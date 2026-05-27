import { useState, useCallback, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Page from "../../../shared/components/Page"
import { Widget } from "../../../shared/components/Widget/Widget"
import { createChangeOrder, type ChangeOrderData } from "../../../shared/api/mutationApi"
import { fetchPageData } from "../../../shared/api/pageApi"
import { formatMoneyFull } from "../../../shared/utils/format"
import { Upload, ArrowLeft } from "lucide-react"
import { useAuth } from "../../../core/auth/AuthProvider"
import { parseChangeOrderExcel } from "../utils/parseExcel"

interface Project {
  recnum: string
  jobnum: string
  jobnme: string
}

export default function NewChangeOrder() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [coData, setCOData] = useState<Omit<ChangeOrderData, "recnum" | "jobString" | "user"> | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchPageData({ module: "projects", queries: ["homeProjectList"], params: {} })
      .then(result => {
        const list = result.homeProjectList
        if (Array.isArray(list)) setProjects(list)
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleSubmit() {
    if (!coData || !selectedProject) return
    setSubmitting(true)
    setError("")
    try {
      await createChangeOrder({
        ...coData,
        recnum: selectedProject.recnum,
        jobString: `${selectedProject.jobnum} - ${selectedProject.jobnme}`,
        user: user?.displayName || user?.email || "Unknown",
      })
      navigate("/change-orders")
    } catch (err) {
      setError((err as Error).message || "Failed to submit change order")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Page
      title="New Change Order"
      actions={
        <button className="button" onClick={() => navigate("/change-orders")}>
          <ArrowLeft size={16} /> Back
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Step 1: Upload Excel */}
        <Widget title="Step 1: Upload Change Order Excel">
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

        {/* Step 2: Select Project */}
        {coData && (
          <Widget title="Step 2: Select Project">
            <select
              className="form-select"
              value={selectedProject?.recnum || ""}
              onChange={e => {
                const p = projects.find(p => p.recnum === e.target.value)
                setSelectedProject(p || null)
              }}
            >
              <option value="">Select a project...</option>
              {projects.map(p => (
                <option key={p.recnum} value={p.recnum}>
                  {p.jobnum} — {p.jobnme}
                </option>
              ))}
            </select>
          </Widget>
        )}

        {/* Step 3: Review */}
        {coData && selectedProject && (
          <Widget title="Step 3: Review & Submit">
            <div className="stat-grid" style={{ marginBottom: "1rem" }}>
              <div><strong>Name:</strong> {coData.name}</div>
              <div><strong>Total:</strong> {formatMoneyFull(coData.total)}</div>
              <div><strong>Material:</strong> {formatMoneyFull(coData.material)}</div>
              <div><strong>Labor:</strong> {formatMoneyFull(coData.labor)}</div>
              <div><strong>Subs:</strong> {formatMoneyFull(coData.subs)}</div>
              <div><strong>WTPM:</strong> {formatMoneyFull(coData.wtpm)}</div>
            </div>

            {coData.lineItems.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Unit</th>
                    <th style={{ textAlign: "right" }}>Material</th>
                    <th style={{ textAlign: "right" }}>Labor</th>
                    <th style={{ textAlign: "right" }}>Subs</th>
                    <th style={{ textAlign: "right" }}>WTPM</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {coData.lineItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.desc}</td>
                      <td>{item.unit}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(item.material)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(item.labor)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(item.subs)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(item.wtpm)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <button
              className="button primary-button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ marginTop: "1rem" }}
            >
              {submitting ? "Submitting..." : "Submit Change Order"}
            </button>
          </Widget>
        )}
      </div>
    </Page>
  )
}
