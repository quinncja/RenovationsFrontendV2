import { useState, useEffect, useCallback } from "react"
import Page from "../../shared/components/Page"
import { Widget } from "../../shared/components/Widget/Widget"
import { fetchPageData } from "../../shared/api/pageApi"
import { submitFeedback, deleteFeedback } from "../../shared/api/mutationApi"
import { useAuth } from "../../core/auth/AuthProvider"
import { Trash2, Plus, Bug, Lightbulb } from "lucide-react"
import { formatDate } from "../../shared/utils/format"

interface FeedbackItem {
  _id: string
  type: "Bug" | "Suggestion"
  message: string
  user: string
  date_submitted: string
}

export default function FeedbackPage() {
  const { user } = useAuth()
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [type, setType] = useState<"Bug" | "Suggestion">("Bug")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const loadFeedback = useCallback(() => {
    setLoading(true)
    fetchPageData({ module: "feedback", queries: [], params: {} })
      .then(result => {
        const data = result as unknown
        if (Array.isArray(data)) setFeedback(data)
        else if (data && typeof data === "object") {
          const arr = Object.values(data as Record<string, unknown>).find(Array.isArray)
          if (arr) setFeedback(arr as FeedbackItem[])
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { loadFeedback() }, [loadFeedback])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSubmitting(true)
    try {
      await submitFeedback({
        type,
        message: message.trim(),
        user: user?.displayName || user?.email || "Unknown",
      })
      setMessage("")
      setShowModal(false)
      loadFeedback()
    } catch {
      alert("Failed to submit feedback")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this feedback?")) return
    try {
      await deleteFeedback(id)
      loadFeedback()
    } catch {
      alert("Failed to delete feedback")
    }
  }

  return (
    <Page
      title="Feedback"
      actions={
        <button className="button primary-button" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Feedback
        </button>
      }
    >
      <Widget loading={loading} noData={!loading && feedback.length === 0}>
        <div className="feedback-list">
          {feedback
            .sort((a, b) => new Date(b.date_submitted).getTime() - new Date(a.date_submitted).getTime())
            .map(item => (
              <div key={item._id} className="feedback-card">
                <div className="feedback-card-header">
                  <div className="feedback-type">
                    {item.type === "Bug" ? <Bug size={14} /> : <Lightbulb size={14} />}
                    <span className={`feedback-badge ${item.type.toLowerCase()}`}>{item.type}</span>
                  </div>
                  <button className="button icon-button danger" onClick={() => handleDelete(item._id)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="feedback-message">{item.message}</p>
                <div className="feedback-meta">
                  <span>{item.user}</span>
                  <span>{formatDate(item.date_submitted)}</span>
                </div>
              </div>
            ))}
        </div>
      </Widget>

      {/* Feedback Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h2 className="title2">Submit Feedback</h2>
            <form onSubmit={handleSubmit} className="feedback-form">
              <div className="toggle-group">
                <button
                  type="button"
                  className={`button toggle-button ${type === "Bug" ? "active" : ""}`}
                  onClick={() => setType("Bug")}
                >
                  <Bug size={14} /> Bug
                </button>
                <button
                  type="button"
                  className={`button toggle-button ${type === "Suggestion" ? "active" : ""}`}
                  onClick={() => setType("Suggestion")}
                >
                  <Lightbulb size={14} /> Suggestion
                </button>
              </div>
              <textarea
                placeholder="Describe the issue or suggestion..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={5}
                required
              />
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                <button type="button" className="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="button primary-button" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  )
}
