import { useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, ArrowUpRight } from "lucide-react"
import { formatMoneyFull } from "../../utils/format"
import { useModalLayer } from "../../hooks/useModalLayer"
import { useCloseOnRouteChange } from "../../hooks/useCloseOnRouteChange"

// ─── Shared detail-modal primitive ───────────────────────────────────────────
//
// Every detail modal in the app (invoice, cost posting, PO, subcontract, …)
// reads as the same surface: an amount-led card where the total is the hero,
// the description + its project sit in a row, and the line items are the
// substance underneath. That shared look used to live only in the `.cost-detail-*`
// CSS class family, with each modal hand-rolling identical portal/animation/markup.
//
// `DetailModal` owns the shell (portal, backdrop, animation, close button); a
// caller drops any content inside — loading/error states included. `DetailModalContent`
// renders the standard body from a view model, so a modal only has to describe
// *what* it shows, not re-lay-out the structure. Callers pre-format the figure
// string themselves ("N/A" / "—" / money) so this stays purely presentational.

// ─── Shell ────────────────────────────────────────────────────────────────────

export function DetailModal({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const { overlayZ, contentZ } = useModalLayer(open)
  // "View project" navigates while this modal (and any stack above it, e.g. the
  // daily recap) stays mounted — a route change must dismiss it.
  useCloseOnRouteChange(open, onClose)

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
              className="modal invoice-modal cost-detail-modal"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <button className="cost-detail-close" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
              <div className="cost-detail">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ─── Content view model ─────────────────────────────────────────────────────

/** A single line item in the ledger. A null amount renders as "—" (no amount
 *  entered, e.g. an unpriced PO line); a number is formatted with `formatMoneyFull`. */
export interface DetailLine {
  primary: string
  meta?: string | null
  amount: number | null
}

/** The ledger section under the head — the line items that make up the figure. */
export interface DetailLedger {
  /** Left header cell, e.g. "Line items" or "3 lines". */
  heading: string
  loading?: boolean
  lines: DetailLine[]
  /** Shown when there are no lines and we're not loading. Omit to render nothing. */
  emptyText?: string
}

/** A stat in the strip under the figure (e.g. Paid / Remaining / Retainage). */
export interface DetailStat {
  label: string
  value: string
  /** Extra class appended to `.cost-detail-stat-value` (e.g. "cost-detail-stat-value--paid"). */
  valueClass?: string
}

/** A badge qualifying the figure (e.g. invoice status). `className` is the full class string. */
export interface DetailBadge {
  label: string
  className: string
}

/** Provenance shown in the footer — who entered it (left) and when (right).
 *  Secondary information: it sits quietly at the base of the card. */
export interface DetailFooter {
  left?: string | null
  right?: string | null
}

/** The clickable project the item belongs to — the one way out of the modal. */
export interface DetailProject {
  jobId: string
  jobName: string | null
  onOpen: () => void
  /** When set, the project link is inert: clicking/hovering reveals this
   *  message as a tooltip instead of navigating away. Used during the daily
   *  recap intro, where leaving for a project is blocked until the walkthrough
   *  is finished. */
  blockedReason?: string | null
}

export interface DetailModalContentProps {
  /** The kind of record, e.g. "AP invoice" — the small label above the name. */
  eyebrow: string
  /** A secondary identifier shown beside the eyebrow, e.g. "#12345". */
  caption?: string | null
  /** The name of the item — the hero of the card, leading above everything. */
  title: string
  /** The party the item is with (client / vendor / subcontractor) — emphasized
   *  directly under the name, since who it's with is as telling as what it is. */
  party?: string | null
  /** Pre-formatted figure string (money). Pass null when no amount was entered —
   *  it renders a muted "No amount entered" caption instead of the figure. */
  figure: string | null
  badge?: DetailBadge | null
  stats?: DetailStat[] | null
  project?: DetailProject | null
  ledger?: DetailLedger | null
  /** Who entered it and when — the quiet provenance line at the card's base. */
  footer?: DetailFooter | null
}

// ─── Content ──────────────────────────────────────────────────────────────────

export function DetailModalContent({
  eyebrow,
  caption,
  title,
  party,
  figure,
  badge,
  stats,
  project,
  ledger,
  footer,
}: DetailModalContentProps) {
  const hasFooter = Boolean(footer && (footer.left || footer.right))
  return (
    <>
      {/* Head band: the name leads. What it is (kind + number) sits small above
          it; who it's with sits emphasized just below. The amount rides at the
          right, in line with the name — firm but no longer the hero. */}
      <div className="cost-detail-head">
        <div className="cost-detail-eyebrow-row">
          <span className="cost-detail-eyebrow">{eyebrow}</span>
          {caption && (
            <>
              <span className="cost-detail-dot" aria-hidden>·</span>
              <span className="cost-detail-caption">{caption}</span>
            </>
          )}
        </div>
        <div className="cost-detail-headline">
          <div className="cost-detail-headline-text">
            <p className="cost-detail-title">{title}</p>
            {party && <p className="cost-detail-party">{party}</p>}
          </div>
          <div className="cost-detail-figure-block">
            <span className={`cost-detail-figure${figure == null ? " cost-detail-figure--empty" : ""}`}>
              {figure ?? "No amount entered"}
            </span>
            {badge && <span className={badge.className}>{badge.label}</span>}
          </div>
        </div>
      </div>

      {/* Then the money's state — how much is settled, outstanding, when due —
          grouped into one panel with divided cells so it reads at a glance. */}
      {stats && stats.length > 0 && (
        <div className="cost-detail-stats">
          {stats.map((s, i) => (
            <div className="cost-detail-stat" key={i}>
              <span className="cost-detail-stat-label">{s.label}</span>
              <span
                className={`cost-detail-stat-value${s.valueClass ? ` ${s.valueClass}` : ""}`}
              >
                {s.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Where it lives — the project, a full-width card and the one way out. */}
      {project && <ProjectLink project={project} />}

      {/* Line items are the substance — no total row (the figure above is it). */}
      {ledger && (
        <div className="cost-detail-ledger">
          <div className="cost-detail-ledger-head">
            <span>{ledger.heading}</span>
            <span>Amount</span>
          </div>
          {ledger.loading ? (
            <div className="widget-skeleton" style={{ height: "4rem" }} />
          ) : ledger.lines.length > 0 ? (
            <ul className="cost-detail-lines">
              {ledger.lines.map((line, i) => (
                <li className="cost-detail-line" key={i}>
                  <span className="cost-detail-line-desc">
                    {line.primary}
                    {line.meta && <small>{line.meta}</small>}
                  </span>
                  <span className="cost-detail-line-amt">
                    {line.amount == null ? "—" : formatMoneyFull(line.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : ledger.emptyText ? (
            <p className="body-text text-secondary">{ledger.emptyText}</p>
          ) : null}
        </div>
      )}

      {/* Provenance — who entered it, when — reads last and quiet, split to the
          two edges of the card's base. */}
      {hasFooter && (
        <div className="cost-detail-footer">
          <span>{footer!.left}</span>
          <span>{footer!.right}</span>
        </div>
      )}
    </>
  )
}

// ─── Project link ──────────────────────────────────────────────────────────────
// The one way out of the modal. Normally it navigates to the job-cost detail;
// when `blockedReason` is set (the daily-recap intro walkthrough) the link is
// inert and clicking/hovering surfaces the reason as a tooltip instead — the
// user is kept inside the greeting until they finish it.

function ProjectLink({ project }: { project: DetailProject }) {
  const blocked = Boolean(project.blockedReason)
  const [tipShown, setTipShown] = useState(false)

  return (
    <div className={`cost-detail-project-wrap${blocked ? " cost-detail-project-wrap--blocked" : ""}`}>
      <button
        type="button"
        className={`cost-detail-project${blocked ? " cost-detail-project--blocked" : ""}`}
        onClick={() => (blocked ? setTipShown((v) => !v) : project.onOpen())}
        onMouseEnter={blocked ? () => setTipShown(true) : undefined}
        onMouseLeave={blocked ? () => setTipShown(false) : undefined}
        onFocus={blocked ? () => setTipShown(true) : undefined}
        onBlur={blocked ? () => setTipShown(false) : undefined}
        aria-label={
          blocked
            ? project.blockedReason!
            : `View project ${project.jobName ?? project.jobId}`
        }
        aria-disabled={blocked || undefined}
      >
        <span className="cost-detail-project-text">
          <span className="cost-detail-project-eyebrow">Project</span>
          <span className="cost-detail-project-name">
            {project.jobName || `Job #${project.jobId}`}
          </span>
          {project.jobName && (
            <span className="cost-detail-project-num">Job #{project.jobId}</span>
          )}
        </span>
        <ArrowUpRight size={17} className="cost-detail-project-icon" aria-hidden />
      </button>
      <AnimatePresence>
        {blocked && tipShown && (
          <motion.p
            className="cost-detail-project-tip"
            role="tooltip"
            // x:-50% carries the horizontal centering (see CSS) since framer
            // owns the transform; y adds the subtle rise.
            initial={{ opacity: 0, x: "-50%", y: -4 }}
            animate={{ opacity: 1, x: "-50%", y: 0 }}
            exit={{ opacity: 0, x: "-50%", y: -4 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {project.blockedReason}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
