import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, RotateCcw, Camera, Clock } from "lucide-react"
import { ConfirmModal } from "../../shared/components/ConfirmModal/ConfirmModal"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { formatMoneyFull, fullMonth } from "../../shared/utils/format"
import { createProjectionSnapshot, fetchProjectionHistory, fetchProjectionSnapshots } from "./api"
import type { ProjectionEditEntry, ProjectionSnapshotMeta } from "./types"

const FIELD_LABELS: Record<string, string> = {
  address: "Address",
  client: "Client",
  name: "Name",
  units: "Units",
  avgUnitPrice: "Avg Unit Price",
  pctWin: "% Win",
  grossMargin: "Margin",
  overheadMonthly: "Monthly Overhead",
}

function fieldLabel(field: string): string {
  if (field.startsWith("month:")) return fullMonth(Number(field.slice(6)) + 1)
  return FIELD_LABELS[field] ?? field
}

function fmtValue(field: string, value: unknown): string {
  if (value == null) return "—"
  if (field === "pctWin" || field === "grossMargin") return `${Math.round(Number(value) * 1000) / 10}%`
  if (field === "avgUnitPrice" || field === "overheadMonthly") return formatMoneyFull(Number(value))
  return String(value)
}

function editSentence(e: ProjectionEditEntry): { title: string; detail: string | null } {
  if (e.field === "row:add") return { title: "Added a project row", detail: null }
  if (e.field === "row:delete") return { title: `Deleted ${e.rowLabel ?? "a row"}`, detail: null }
  if (e.field === "snapshot:restore")
    return { title: "Restored a version", detail: e.newValue ? String(e.newValue) : null }
  return {
    title: e.rowLabel ? `${e.rowLabel} · ${fieldLabel(e.field)}` : fieldLabel(e.field),
    detail: `${fmtValue(e.field, e.oldValue)} → ${fmtValue(e.field, e.newValue)}`,
  }
}

function who(user: { name: string | null; email: string | null }): string {
  return user.name || user.email || "Unknown"
}

/** Relative label for real-UTC Mongo timestamps. The shared formatRelativeTime
 *  strips the timezone (a Sage wall-clock workaround) which would skew these
 *  by 5–6h, so this parses normally. */
function relTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const diffMs = Date.now() - d.getTime()
  if (diffMs < 60_000) return "just now"
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

interface BoardHistoryDrawerProps {
  open: boolean
  year: number
  /** Bump to refetch while open (e.g. after local saves). */
  refreshKey: number
  onClose: () => void
  onRestore: (snapshotId: string) => Promise<void> | void
}

/** Right-side drawer: the cell-level change log and the version list. */
export function BoardHistoryDrawer({ open, year, refreshKey, onClose, onRestore }: BoardHistoryDrawerProps) {
  const { overlayZ, contentZ } = useModalLayer(open)
  const [tab, setTab] = useState<"changes" | "versions">("changes")
  const [history, setHistory] = useState<ProjectionEditEntry[] | null>(null)
  const [snapshots, setSnapshots] = useState<ProjectionSnapshotMeta[] | null>(null)
  const [label, setLabel] = useState("")
  const [savingSnap, setSavingSnap] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<ProjectionSnapshotMeta | null>(null)
  const [restoring, setRestoring] = useState(false)

  const loadAll = useCallback(() => {
    fetchProjectionHistory(year).then((r) => setHistory(r.history)).catch(() => setHistory([]))
    fetchProjectionSnapshots(year).then((r) => setSnapshots(r.snapshots)).catch(() => setSnapshots([]))
  }, [year])

  useEffect(() => {
    if (!open) return
    loadAll()
  }, [open, refreshKey, loadAll])

  const saveVersion = async () => {
    setSavingSnap(true)
    try {
      await createProjectionSnapshot(year, label)
      setLabel("")
      loadAll()
    } finally {
      setSavingSnap(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="pj-drawer card"
            style={{ zIndex: contentZ }}
            initial={{ x: "104%" }}
            animate={{ x: 0 }}
            exit={{ x: "104%" }}
            transition={{ type: "spring", bounce: 0, visualDuration: 0.32 }}
            role="dialog"
            aria-label="Board history"
          >
            <header className="pj-drawer-head">
              <div className="pj-drawer-tabs">
                <button
                  className={`pj-drawer-tab${tab === "changes" ? " pj-drawer-tab-active" : ""}`}
                  onClick={() => setTab("changes")}
                >
                  <Clock size={13} /> Changes
                </button>
                <button
                  className={`pj-drawer-tab${tab === "versions" ? " pj-drawer-tab-active" : ""}`}
                  onClick={() => setTab("versions")}
                >
                  <Camera size={13} /> Versions
                </button>
              </div>
              <button className="btn-icon" aria-label="Close history" onClick={onClose}>
                <X size={15} />
              </button>
            </header>

            {tab === "changes" && (
              <div className="pj-drawer-body">
                {history == null ? (
                  <div className="pj-drawer-empty callout text-secondary">Loading…</div>
                ) : history.length === 0 ? (
                  <div className="pj-drawer-empty callout text-secondary">No changes recorded yet.</div>
                ) : (
                  <ul className="pj-history-list">
                    {history.map((e) => {
                      const s = editSentence(e)
                      return (
                        <li key={e.id} className="pj-history-item">
                          <div className="pj-history-title body-text emphasized">{s.title}</div>
                          {s.detail && <div className="pj-history-detail body-text">{s.detail}</div>}
                          <div className="pj-history-meta callout text-secondary">
                            {who(e.user)} · {relTime(e.at)}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}

            {tab === "versions" && (
              <div className="pj-drawer-body">
                <div className="pj-snapshot-form">
                  <input
                    className="pj-snapshot-input"
                    placeholder="Version name (optional)"
                    value={label}
                    maxLength={120}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                  <button className="button primary-button" disabled={savingSnap} onClick={saveVersion}>
                    {savingSnap ? "Saving…" : "Save version"}
                  </button>
                </div>
                {snapshots == null ? (
                  <div className="pj-drawer-empty callout text-secondary">Loading…</div>
                ) : snapshots.length === 0 ? (
                  <div className="pj-drawer-empty callout text-secondary">
                    No versions yet. One is captured automatically before each day's first edit.
                  </div>
                ) : (
                  <ul className="pj-history-list">
                    {snapshots.map((s) => (
                      <li key={s.id} className="pj-history-item pj-snapshot-item">
                        <div>
                          <div className="pj-history-title body-text emphasized">
                            {s.label || "Manual version"}
                            {s.auto && <span className="pj-auto-badge callout">auto</span>}
                          </div>
                          <div className="pj-history-meta callout text-secondary">
                            {s.takenBy ? `${who(s.takenBy)} · ` : ""}
                            {relTime(s.at)}
                          </div>
                        </div>
                        <button className="pj-restore-btn callout" onClick={() => setConfirmRestore(s)}>
                          <RotateCcw size={12} /> Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </motion.aside>
          <ConfirmModal
            open={confirmRestore != null}
            title="Restore this version"
            message={
              confirmRestore
                ? `Replace the current board with "${confirmRestore.label || "this version"}"? The current state is preserved in history and today's auto version.`
                : undefined
            }
            confirmLabel="Restore"
            loading={restoring}
            onConfirm={async () => {
              if (!confirmRestore) return
              setRestoring(true)
              try {
                await onRestore(confirmRestore.id)
                loadAll()
              } finally {
                setRestoring(false)
                setConfirmRestore(null)
              }
            }}
            onCancel={() => setConfirmRestore(null)}
          />
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
