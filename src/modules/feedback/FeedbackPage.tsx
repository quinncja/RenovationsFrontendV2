import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import Page from "../../shared/components/Page"
import { Widget } from "../../shared/components/Widget/Widget"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { fetchPageData } from "../../shared/api/pageApi"
import { submitFeedback, deleteFeedback } from "../../shared/api/mutationApi"
import { useAuth } from "../../core/auth/AuthProvider"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { Trash2, Plus, Bug, Lightbulb, X } from "lucide-react"
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
  const { overlayZ, contentZ } = useModalLayer(showModal)

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
      <MotionList>
        <MotionItem>
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
        </MotionItem>
      </MotionList>

      {/* Feedback Modal — shared portal/overlay/positioner shell, same shape as
          ConfirmModal/SettingsModal so every modal in the app stacks and
          animates identically. */}
      {createPortal(
        <AnimatePresence>
          {showModal && (
            <>
              <motion.div
                className="modal-overlay"
                style={{ zIndex: overlayZ }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowModal(false)}
              />
              <div className="modal-positioner" style={{ zIndex: contentZ }}>
                <motion.div
                  className="modal"
                  initial={{ opacity: 0, scale: 0.96, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 16 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <div className="modal-header">
                    <h2 className="title2 emphasized">Submit Feedback</h2>
                    <button className="button modal-close" onClick={() => setShowModal(false)}>
                      <X size={16} />
                    </button>
                  </div>
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
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Page>
  )
}
