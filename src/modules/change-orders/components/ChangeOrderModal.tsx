import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { useJobcostNav } from "../../jobcost/useJobcostNav"
import { X, ChevronRight, ChevronDown, Trash2, Search, Upload, ArrowLeft, FileSpreadsheet } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { formatMoneyFull, formatDate } from "../../../shared/utils/format"
import { useModalLayer } from "../../../shared/hooks/useModalLayer"
import { deleteChangeOrder, createChangeOrder } from "../../../shared/api/mutationApi"
import { ConfirmModal } from "../../../shared/components/ConfirmModal/ConfirmModal"
import { useAuth } from "../../../core/auth/AuthProvider"
import { parseChangeOrderExcel, type ParsedChangeOrder } from "../utils/parseExcel"
import { coCost, coMarkup, coMarkupPct, coUnits } from "../utils/coMath"
import { useOpenPhaseOptions, type JobOption } from "../hooks/useOpenPhaseOptions"
import type { ChangeOrder, ChangeOrderLineItem } from "../types"

// ONE modal for the whole change-order lifecycle. Two modes share the shell,
// the totals deck, the units row, and the line-item grid:
//
//   view    — an existing order. Hierarchy leads with the money (totals deck
//             as the hero), then units; the full grid rests collapsed behind
//             an expander.
//   create  — a three-step wizard: choose project → upload Excel → review &
//             verify. Steps glide horizontally inside a fixed frame; the
//             review step shows the grid in full so the uploader can verify
//             every line before submitting.
//
// Entry shortcuts: `create.presetJob` opens straight at the upload step
// (jobcost detail's "+ Change Order"); `create.file` (a file dropped on the
// list page) parses immediately and skips upload once a project is chosen.

const CATEGORIES = [
  { key: "labor", label: "Labor" },
  { key: "material", label: "Material" },
  { key: "subs", label: "Subs" },
  { key: "wtpm", label: "WTPM" },
] as const

// Directional step glide: incoming from the travel direction, outgoing the
// opposite way. Springs on x (physical), quick fade on opacity.
const STEP_TRANSITION = {
  x: { type: "spring", bounce: 0, visualDuration: 0.35 },
  opacity: { duration: 0.18 },
} as const
const stepVariants = {
  enter: (dir: number) => ({ x: dir * 64, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -64, opacity: 0 }),
}

export interface CreateChangeOrderConfig {
  /** Skip the project step — the wizard opens at upload (jobcost shortcut). */
  presetJob?: JobOption
  /** A file already chosen (list-page drop): parsed on open; once a project
   *  is picked the wizard jumps straight to review. */
  file?: File
}

interface ChangeOrderModalProps {
  /** View mode: the order to show. */
  order?: ChangeOrder | null
  /** Create mode: wizard config (use {} for a plain "+ New"). */
  create?: CreateChangeOrderConfig | null
  onClose: () => void
  /** When provided, view mode offers a Delete action (confirm → API →
   *  onClose → onDeleted). View-only contexts (managers) simply omit it. */
  onDeleted?: () => void
  /** Called after a successful create so the host can reload its list. */
  onCreated?: () => void
}

export function ChangeOrderModal({ order, create, onClose, onDeleted, onCreated }: ChangeOrderModalProps) {
  const open = !!order || !!create
  const { overlayZ, contentZ } = useModalLayer(open)
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
          <div className="modal-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              className={`modal co-modal${create ? " co-wizard" : ""}`}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {order ? (
                <ViewChangeOrder order={order} onClose={onClose} onDeleted={onDeleted} />
              ) : create ? (
                <CreateChangeOrderWizard config={create} onClose={onClose} onCreated={onCreated} />
              ) : null}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

// The money hero, read as a literal sum: Budget + Markup = Total Cost.
function CoTotalsDeck({ co, hero }: { co: Parameters<typeof coCost>[0]; hero?: boolean }) {
  return (
    <div className={`co-modal-totals${hero ? " co-modal-totals--hero" : ""}`}>
      <div className="co-modal-total">
        <span className="co-modal-total-label">Budget</span>
        <span className="co-modal-total-value">{formatMoneyFull(coCost(co))}</span>
      </div>
      <span className="co-modal-op" aria-hidden="true">+</span>
      <div className="co-modal-total">
        <span className="co-modal-total-label">Markup · {coMarkupPct(co)}%</span>
        <span className="co-modal-total-value">{formatMoneyFull(coMarkup(co))}</span>
      </div>
      <span className="co-modal-op" aria-hidden="true">=</span>
      <div className="co-modal-total co-modal-total-primary">
        <span className="co-modal-total-label">Total Cost</span>
        <span className="co-modal-total-value">{formatMoneyFull(co.total ?? 0)}</span>
      </div>
    </div>
  )
}

// The gold fact bar: one surface carrying everything that identifies the
// order — project and units on the meta line, the money summed beneath.
function CoHero({ co, projectName, projectNum, onProjectOpen }: {
  co: Parameters<typeof coCost>[0]
  projectName: string
  projectNum?: string | number
  /** When provided the project drills through to job costing. */
  onProjectOpen?: () => void
}) {
  const units = coUnits(co)
  const count = units.length || co.lineItems?.length || 0
  const projectBody = (
    <>
      <span className="co-hero-project-name">{projectName}</span>
      {projectNum != null && projectNum !== "" && (
        <span className="co-modal-project-num">#{projectNum}</span>
      )}
    </>
  )
  return (
    <div className="co-hero">
      <div className="co-hero-meta">
        {onProjectOpen ? (
          <button className="button co-hero-project" title="Open job costing" onClick={onProjectOpen}>
            {projectBody}
            <ChevronRight size={12} />
          </button>
        ) : (
          <span className="co-hero-project">{projectBody}</span>
        )}
        <span className="co-hero-units">
          <span className="co-hero-units-count">{count} Unit{count !== 1 ? "s" : ""}</span>
          {units.length > 0 && <span className="co-hero-units-list"> · {units.join(", ")}</span>}
        </span>
      </div>
      <CoTotalsDeck co={co} hero />
    </div>
  )
}

// The excel-like grid, unchanged in structure — hosts decide whether it rests
// open (wizard review) or collapsed behind an expander (view mode).
function CoLineItemsTable({ co }: {
  co: { lineItems: ChangeOrderLineItem[]; material: number; labor: number; subs: number; wtpm: number }
}) {
  const items = co.lineItems ?? []
  if (items.length === 0) return <p className="table-empty" style={{ padding: "1.25rem 1.5rem" }}>No line items</p>
  return (
    <div className="co-modal-table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="co-col-unit">Unit</th>
            {CATEGORIES.map((c) => (
              <th key={c.key} className="co-col-num">{c.label}</th>
            ))}
            <th className="co-col-num co-col-amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => (
            <tr key={i}>
              <td>{row.desc}</td>
              <td className="co-col-unit">{row.unit}</td>
              {CATEGORIES.map((c) => (
                <td key={c.key} className="co-col-num">
                  {row[c.key] ? formatMoneyFull(row[c.key]) : <span className="co-cell-empty">–</span>}
                </td>
              ))}
              <td className="co-col-num co-col-amount">{formatMoneyFull(row.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="co-modal-foot">
            <td>Totals</td>
            <td className="co-col-unit">{items.length} Unit{items.length !== 1 ? "s" : ""}</td>
            {CATEGORIES.map((c) => (
              <td key={c.key} className="co-col-num">{formatMoneyFull(co[c.key])}</td>
            ))}
            <td className="co-col-num co-col-amount">{formatMoneyFull(coCost(co))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── View mode ───────────────────────────────────────────────────────────────

function ViewChangeOrder({ order, onClose, onDeleted }: {
  order: ChangeOrder
  onClose: () => void
  onDeleted?: () => void
}) {
  const { goToJobcost } = useJobcostNav()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [gridOpen, setGridOpen] = useState(false)
  const items = order.lineItems ?? []
  const openJobcost = () => {
    if (!order.jobnum) return
    goToJobcost(order.jobnum)
    onClose()
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError("")
    try {
      await deleteChangeOrder(order.recnum)
      setConfirmOpen(false)
      onClose()
      onDeleted?.()
    } catch {
      setDeleteError("Failed to delete change order. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="modal-header co-modal-header">
        <div className="co-modal-title">
          <span className="co-modal-eyebrow">Change Order</span>
          <h2 className="title2 emphasized">{order.name}</h2>
        </div>
        <button className="button modal-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="co-modal-body">
        {/* The gold fact bar leads — project + units, then the money. The
            grid rests behind the expander beneath it. */}
        <CoHero
          co={order}
          projectName={order.jobString || (order.jobnum ? "Job" : "No job assigned")}
          projectNum={order.jobnum}
          onProjectOpen={order.jobnum ? openJobcost : undefined}
        />

        <button
          className={`co-grid-toggle${gridOpen ? " co-grid-toggle-open" : ""}`}
          onClick={() => setGridOpen((v) => !v)}
          aria-expanded={gridOpen}
        >
          <motion.span
            className="co-grid-toggle-chevron"
            animate={{ rotate: gridOpen ? 0 : -90 }}
            transition={{ type: "spring", bounce: 0, visualDuration: 0.25 }}
          >
            <ChevronDown size={14} />
          </motion.span>
          Line items
          <span className="co-grid-toggle-count">{items.length}</span>
        </button>
        {/* The grid stays MOUNTED while collapsed (height 0, hidden) so its
            natural width always shapes the sheet — expanding animates height
            only, never a width jump. */}
        <motion.div
          className="co-grid-reveal"
          initial={false}
          animate={{ height: gridOpen ? "auto" : 0, opacity: gridOpen ? 1 : 0 }}
          transition={{
            height: { type: "spring", bounce: 0, visualDuration: 0.32 },
            opacity: { duration: 0.18 },
          }}
          aria-hidden={!gridOpen}
          // Keep the hidden table out of the tab order and hit testing.
          style={{ pointerEvents: gridOpen ? "auto" : "none" }}
          {...(!gridOpen ? { inert: true } : {})}
        >
          <CoLineItemsTable co={order} />
        </motion.div>
      </div>

      <div className="co-modal-meta">
        <span>
          Submitted by {order.user || "—"}
          {order.date ? ` · ${formatDate(order.date)}` : ""}
        </span>
        {onDeleted && (
          <button
            className="button co-modal-delete"
            onClick={() => {
              setDeleteError("")
              setConfirmOpen(true)
            }}
          >
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Delete change order?"
        message={
          <>
            This will permanently delete <strong>{order.name}</strong>
            {order.jobString ? <> for {order.jobString}</> : null}. This can't be undone.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={deleting}
        error={deleteError || undefined}
        onConfirm={confirmDelete}
        onCancel={() => {
          setConfirmOpen(false)
          setDeleteError("")
        }}
      />
    </>
  )
}

// ─── Create mode (wizard) ────────────────────────────────────────────────────

type WizardStep = "project" | "upload" | "review"
const STEP_ORDER: WizardStep[] = ["project", "upload", "review"]

function CreateChangeOrderWizard({ config, onClose, onCreated }: {
  config: CreateChangeOrderConfig
  onClose: () => void
  onCreated?: () => void
}) {
  const { user } = useAuth()
  const { options, loading: optionsLoading } = useOpenPhaseOptions(true)
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(config.presetJob ?? null)
  const [parsed, setParsed] = useState<ParsedChangeOrder | null>(null)
  const [step, setStep] = useState<WizardStep>(config.presetJob ? "upload" : "project")
  const [dir, setDir] = useState(1)
  const [parseError, setParseError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")

  const goTo = useCallback((next: WizardStep) => {
    setDir(STEP_ORDER.indexOf(next) >= STEP_ORDER.indexOf(step) ? 1 : -1)
    setStep(next)
  }, [step])

  const handleFile = useCallback(async (file: File) => {
    try {
      const result = await parseChangeOrderExcel(file)
      setParsed(result)
      setParseError("")
      return true
    } catch (err) {
      setParsed(null)
      setParseError((err as Error).message || "Failed to parse Excel file")
      return false
    }
  }, [])

  // A file dropped on the list page arrives pre-chosen — parse it right away
  // so picking a project can jump straight to review.
  useEffect(() => {
    if (config.file) handleFile(config.file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickProject(job: JobOption) {
    setSelectedJob(job)
    goTo(parsed ? "review" : "upload")
  }

  async function uploadFile(file: File) {
    if (await handleFile(file)) goTo("review")
  }

  async function handleSubmit() {
    if (!parsed || !selectedJob) return
    setSubmitting(true)
    setSubmitError("")
    try {
      await createChangeOrder({
        ...parsed,
        recnum: selectedJob.recnum,
        jobString: selectedJob.jobName,
        user: user?.displayName || user?.email || "Unknown",
      })
      onCreated?.()
      onClose()
    } catch (err) {
      setSubmitError((err as Error).message || "Failed to submit change order")
    } finally {
      setSubmitting(false)
    }
  }

  const stepNum = STEP_ORDER.indexOf(step) + 1
  const stepTitle =
    step === "project" ? "Choose a project" : step === "upload" ? "Upload the Excel" : "Review & verify"

  return (
    <>
      <div className="modal-header co-modal-header co-wizard-header">
        <div className="co-modal-title">
          <span className="co-modal-eyebrow">New Change Order · Step {stepNum} of 3</span>
          <h2 className="title2 emphasized">{stepTitle}</h2>
        </div>
        <button className="button modal-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="co-wizard-frame">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={step}
            className="co-wizard-step"
            custom={dir}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={STEP_TRANSITION}
          >
            {step === "project" && (
              <ProjectStep
                options={options}
                loading={optionsLoading}
                selected={selectedJob}
                onPick={pickProject}
              />
            )}
            {step === "upload" && selectedJob && (
              <UploadStep
                job={selectedJob}
                error={parseError}
                onChangeProject={() => goTo("project")}
                onFile={uploadFile}
              />
            )}
            {step === "review" && selectedJob && parsed && (
              <ReviewStep
                job={selectedJob}
                parsed={parsed}
                submitting={submitting}
                error={submitError}
                onBack={() => goTo("upload")}
                onSubmit={handleSubmit}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}

// Step 1 — the project owns the whole frame: a search box and a generous,
// scrollable list of every open phase. Clicking a row advances.
function ProjectStep({ options, loading, selected, onPick }: {
  options: JobOption[]
  loading: boolean
  selected: JobOption | null
  onPick: (job: JobOption) => void
}) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  return (
    <div className="co-project-step">
      <div className="co-project-search">
        <Search size={14} className="co-project-search-icon" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search projects..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="co-project-list" role="listbox" aria-label="Projects">
        {loading && options.length === 0 ? (
          <div className="co-project-empty body-text text-secondary">Loading projects…</div>
        ) : filtered.length === 0 ? (
          <div className="co-project-empty body-text text-secondary">
            {query ? `No projects match "${query}"` : "No open projects"}
          </div>
        ) : (
          filtered.map((o) => (
            <button
              key={o.recnum}
              role="option"
              aria-selected={selected?.recnum === o.recnum}
              className={`co-project-option${selected?.recnum === o.recnum ? " co-project-option-selected" : ""}`}
              onClick={() => onPick(o)}
            >
              <span className="co-project-option-name">{o.jobName}</span>
              <span className="co-project-option-recnum">{o.recnum}</span>
              <ChevronRight size={14} className="co-project-option-go" />
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// Step 2 — the whole frame is the drop target; the chosen project rides along
// as a quiet chip with a way back.
function UploadStep({ job, error, onChangeProject, onFile }: {
  job: JobOption
  error: string
  onChangeProject: () => void
  onFile: (file: File) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div className="co-upload-step">
      <button className="co-job-chip" onClick={onChangeProject} title="Choose a different project">
        <span className="co-job-chip-name">{job.jobName}</span>
        <span className="co-job-chip-recnum">{job.recnum}</span>
        <span className="co-job-chip-change">Change</span>
      </button>
      <div
        className={`co-upload-zone${dragOver ? " co-upload-zone-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
        }}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <FileSpreadsheet size={34} className="co-upload-glyph" />
        <span className="body-text emphasized">Drag & drop the change order Excel here</span>
        <span className="co-upload-hint">or click to browse for the file</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (file) onFile(file)
          }}
        />
      </div>
      {error && <p className="auth-error co-wizard-error">{error}</p>}
    </div>
  )
}

// Step 3 — the staged order in full: money hero, units, and the complete grid
// so the uploader can verify every line before committing.
function ReviewStep({ job, parsed, submitting, error, onBack, onSubmit }: {
  job: JobOption
  parsed: ParsedChangeOrder
  submitting: boolean
  error: string
  onBack: () => void
  onSubmit: () => void
}) {
  return (
    <div className="co-review-step">
      <div className="co-review-scroll">
        <div className="co-review-idline">
          <span className="co-review-name">{parsed.name || "Change Order"}</span>
        </div>
        <CoHero co={parsed} projectName={job.jobName} projectNum={job.recnum} />
        <CoLineItemsTable co={parsed} />
      </div>
      <div className="co-wizard-footer">
        <button className="button secondary-button" onClick={onBack} disabled={submitting}>
          <ArrowLeft size={15} /> Back
        </button>
        {error && <span className="auth-error co-wizard-footer-error">{error}</span>}
        <button className="button primary-button" onClick={onSubmit} disabled={submitting}>
          <Upload size={15} /> {submitting ? "Submitting…" : "Verify & Submit"}
        </button>
      </div>
    </div>
  )
}
