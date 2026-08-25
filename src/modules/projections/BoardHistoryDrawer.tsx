import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, RotateCcw, Camera, Clock, Download } from "lucide-react"
import { ConfirmModal } from "../../shared/components/ConfirmModal/ConfirmModal"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { fullMonth } from "../../shared/utils/format"
import { createProjectionSnapshot, fetchProjectionHistory, fetchProjectionSnapshot, fetchProjectionSnapshots } from "./api"
import { exportProjectionWorkbook, type ExportActuals } from "./exportProjection"
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
  if (field.startsWith("style:")) return `${fieldLabel(field.slice(6))} color`
  if (field.startsWith("month:")) return fullMonth(Number(field.slice(6)) + 1)
  return FIELD_LABELS[field] ?? field
}

interface ChangeLine {
  user: ProjectionEditEntry["user"]
  /** Distinct fields touched by this person, in first-seen order. */
  fields: string[]
  count: number
  recolored: boolean
}

interface ProjectSummary {
  key: string
  /** Latest timestamp across the project's edits. */
  at: string
  /** Address (primary) and name (secondary), split from the row label. */
  address: string
  name: string | null
  lines: ChangeLine[]
}

/** rowLabel arrives as "name — address"; the address leads the display. */
function splitRowLabel(label: string | null): { address: string; name: string | null } {
  if (!label || label.startsWith("(")) return { address: "", name: null }
  const i = label.indexOf(" — ")
  if (i < 0) return { address: label, name: null }
  const name = label.slice(0, i).trim()
  const address = label.slice(i + 3).trim()
  return { address: address || name, name: address ? name || null : null }
}

/** Structural actions read as their own line; value edits fold into the
 *  project they belong to. */
function summaryKind(e: ProjectionEditEntry): { subject: string | null; field: string | null } {
  switch (e.field) {
    case "row:add": return { subject: null, field: "New project" }
    case "pipeline:add": return { subject: null, field: "New project" }
    case "row:delete": return { subject: null, field: "Deleted" }
    case "pipeline:delete": return { subject: null, field: "Deleted from pipeline" }
    case "pipeline:award": return { subject: null, field: "Awarded" }
    case "row:return": return { subject: null, field: "Returned to pipeline" }
    case "row:reorder": return { subject: e.rowLabel ? null : "Unit Projection", field: "Order" }
    case "pipeline:reorder": return { subject: e.rowLabel ? null : "Pipeline", field: "Order" }
    case "snapshot:restore": return { subject: "Restored a version", field: e.newValue ? String(e.newValue) : null }
    default: return { subject: e.rowLabel ? null : fieldLabel(e.field), field: e.rowLabel ? fieldLabel(e.field) : null }
  }
}

/** One card per project per day, listing each person's changes beneath. */
function summarizeEntries(entries: ProjectionEditEntry[]): ProjectSummary[] {
  const map = new Map<string, ProjectSummary>()
  for (const e of entries) {
    const k = summaryKind(e)
    const key = k.subject ?? e.rowId ?? e.rowLabel ?? e.field
    let g = map.get(key)
    if (!g) {
      const id = k.subject ? { address: k.subject, name: null } : splitRowLabel(e.rowLabel)
      g = { key, at: e.at, ...id, lines: [] }
      map.set(key, g)
    }
    if (e.at > g.at) g.at = e.at
    // Entries arrive newest-first; a row created that day starts with a
    // placeholder label, so take the address from the first real one.
    if (!g.address && !k.subject) g.address = splitRowLabel(e.rowLabel).address
    const person = who(e.user)
    let line = g.lines.find((l) => who(l.user) === person)
    if (!line) {
      line = { user: e.user, fields: [], count: 0, recolored: false }
      g.lines.push(line)
    }
    // Any number of cell recolors is one "Color" update; named only when
    // it's the sole thing this person changed.
    if (e.field.startsWith("style:")) {
      if (!line.recolored) line.count += 1
      line.recolored = true
      continue
    }
    line.count += 1
    if (k.field && !line.fields.includes(k.field)) line.fields.push(k.field)
  }
  for (const g of map.values()) {
    // A deletion is the whole story: drop whatever was edited beforehand and
    // credit the person who deleted it.
    const del = g.lines.find((l) => l.fields.some((f) => f.startsWith("Deleted")))
    if (del) {
      const label = del.fields.find((f) => f.startsWith("Deleted")) as string
      g.lines = [{ user: del.user, fields: [label], count: 1, recolored: false }]
      continue
    }
    for (const l of g.lines) if (l.recolored && l.fields.length === 0) l.fields.push("Color")
    // A row created that day: the headline says so, the lines show its setup.
    if (g.lines.some((l) => l.fields.includes("New project"))) {
      g.address = g.address ? `New project: ${g.address}` : "New project"
      for (const l of g.lines) l.fields = l.fields.filter((f) => f !== "New project")
      for (const l of g.lines) if (l.fields.length === 0) l.fields.push("Created")
    }
    if (!g.address) g.address = "Untitled project"
  }
  return [...map.values()].sort((x, y) => (x.at < y.at ? 1 : -1))
}

function fieldsLabel(fields: string[], max = 4): string {
  if (fields.length <= max) return fields.join(", ")
  return `${fields.slice(0, max).join(", ")} +${fields.length - max} more`
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

/** Business-day key + label, in the company's timezone (matches the backend's
 *  Chicago auto-snapshot day). */
const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" })
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" })

function dayKey(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : DAY_FMT.format(d)
}
function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const key = DAY_FMT.format(d)
  const now = new Date()
  if (key === DAY_FMT.format(now)) return "Today"
  if (key === DAY_FMT.format(new Date(now.getTime() - 86_400_000))) return "Yesterday"
  return DAY_LABEL.format(d)
}
interface DayGroup {
  key: string
  label: string
  entries: ProjectionEditEntry[]
  people: string[]
}

/** Newest-first entries → one group per business day, keeping order. */
function groupByDay(history: ProjectionEditEntry[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const e of history) {
    const key = dayKey(e.at)
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      g = { key, label: dayLabel(e.at), entries: [], people: [] }
      groups.push(g)
    }
    g.entries.push(e)
    const name = who(e.user)
    if (!g.people.includes(name)) g.people.push(name)
  }
  return groups
}

function DayHeader({ group }: { group: DayGroup }) {
  const n = group.entries.length
  return (
    <div className="pj-day-head">
      <span className="pj-day-label">{group.label}</span>
      <span className="pj-day-rule" aria-hidden="true" />
      <span className="pj-day-meta">
        <span className="pj-day-count">{n} change{n === 1 ? "" : "s"}</span>
      </span>
    </div>
  )
}

interface BoardHistoryDrawerProps {
  open: boolean
  year: number
  /** Bump to refetch while open (e.g. after local saves). */
  refreshKey: number
  /** Live booked figures (Sage) for the Actual block of a version export. */
  bookedActuals?: ExportActuals | null
  onClose: () => void
  onRestore: (snapshotId: string) => Promise<void> | void
}

/** Right-side drawer: the cell-level change log and the version list. */
export function BoardHistoryDrawer({ open, year, refreshKey, bookedActuals, onClose, onRestore }: BoardHistoryDrawerProps) {
  const { overlayZ, contentZ } = useModalLayer(open)
  const [tab, setTab] = useState<"changes" | "versions">("changes")
  const [history, setHistory] = useState<ProjectionEditEntry[] | null>(null)
  const [snapshots, setSnapshots] = useState<ProjectionSnapshotMeta[] | null>(null)
  const [label, setLabel] = useState("")
  const [savingSnap, setSavingSnap] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<ProjectionSnapshotMeta | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const days = useMemo(() => (history ? groupByDay(history) : []), [history])

  const downloadVersion = async (meta: ProjectionSnapshotMeta) => {
    setDownloadingId(meta.id)
    try {
      const snap = await fetchProjectionSnapshot(meta.id)
      const taken = new Date(snap.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
      const name = snap.label || (snap.auto ? "Auto version" : "Manual version")
      exportProjectionWorkbook(
        {
          year: snap.year,
          overheadMonthly: snap.overheadMonthly,
          rows: snap.rows,
          pipeline: snap.pipeline ?? [],
          actuals: snap.actuals,
          bookedActuals,
          versionLine: `Version "${name}"  ·  saved ${taken}${snap.takenBy ? `  ·  ${who(snap.takenBy)}` : ""}`,
        },
        `Projection_Board_${snap.year}_${name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}_${dayKey(snap.at)}`
      )
    } finally {
      setDownloadingId(null)
    }
  }

  const loadAll = useCallback(() => {
    fetchProjectionHistory(year, 500).then((r) => setHistory(r.history)).catch(() => setHistory([]))
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
              <div className="pj-drawer-body pj-drawer-body-changes">
                {history == null ? (
                  <div className="pj-drawer-empty callout text-secondary">Loading…</div>
                ) : history.length === 0 ? (
                  <div className="pj-drawer-empty callout text-secondary">No changes recorded yet.</div>
                ) : (
                  <div className="pj-day-list">
                    {days.map((g) => (
                      <section key={g.key} className="pj-day-group">
                        <DayHeader group={g} />
                        <ul className="pj-history-list pj-day-items">
                          {summarizeEntries(g.entries).map((c) => (
                            <li key={c.key} className="pj-day-item">
                              <span className="pj-day-address">{c.address}</span>
                              {c.lines.map((l) => (
                                <Fragment key={who(l.user)}>
                                  <span className="pj-day-fields">
                                    {l.fields.length > 0 ? fieldsLabel(l.fields) : "Updated"}
                                  </span>
                                  <span className="pj-day-who">
                                    {who(l.user)}
                                    {l.count > 1 && <span className="pj-day-count-sm"> · {l.count}</span>}
                                  </span>
                                </Fragment>
                              ))}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
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
                        <div className="pj-snapshot-actions">
                          <button
                            className="pj-restore-btn callout"
                            title="Download this version as an Excel workbook"
                            aria-label="Download version"
                            disabled={downloadingId != null}
                            onClick={() => downloadVersion(s)}
                          >
                            <Download size={12} /> {downloadingId === s.id ? "…" : "Excel"}
                          </button>
                          <button className="pj-restore-btn callout" onClick={() => setConfirmRestore(s)}>
                            <RotateCcw size={12} /> Restore
                          </button>
                        </div>
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
