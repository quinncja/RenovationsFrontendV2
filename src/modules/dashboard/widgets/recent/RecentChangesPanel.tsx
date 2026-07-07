import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { Widget } from "../../../../shared/components/Widget/Widget"
import { useJobcostNav } from "../../../jobcost/useJobcostNav"
import { useModalLayer } from "../../../../shared/hooks/useModalLayer"
import { formatMoneyFull, formatRelativeTime } from "../../../../shared/utils/format"
import type { RecentChangeItem, RecentKind } from "./recentTypes"
import { useRecentChanges, type RecentSource } from "./useRecentChanges"

const HIGHLIGHT_COUNT = 6

// ─── Categories ────────────────────────────────────────────────────────────
// The summary tiles and the modal's filters share this grouping. Change
// orders are deliberately absent — the data barely moves, so the category
// earned no surface (the backend still returns them; we just don't render).

type CategoryKey = "projects" | "committed" | "costs" | "billed" | "collected"

interface Category {
  key: CategoryKey
  label: string
  kinds: RecentKind[]
  adminOnly?: boolean
}

const CATEGORIES: Category[] = [
  { key: "projects", label: "New Projects", kinds: ["project"] },
  { key: "committed", label: "Committed", kinds: ["purchaseOrder", "subcontract"] },
  { key: "costs", label: "Costs Posted", kinds: ["cost", "apInvoice"] },
  { key: "billed", label: "Billed", kinds: ["arInvoice"], adminOnly: true },
  { key: "collected", label: "Collected", kinds: ["payment"], adminOnly: true },
]

const sum = (items: RecentChangeItem[]) =>
  items.reduce((acc, i) => acc + (i.amount ?? 0), 0)

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** The muted count line under each tile's figure. */
function tileSub(key: CategoryKey, items: RecentChangeItem[]): string {
  if (items.length === 0) return "None"
  switch (key) {
    case "projects": {
      const contracts = sum(items)
      return contracts > 0 ? `${formatMoneyFull(contracts)} in contracts` : "assigned"
    }
    case "committed": {
      const pos = items.filter((i) => i.kind === "purchaseOrder").length
      const subs = items.filter((i) => i.kind === "subcontract").length
      const parts = []
      if (pos) parts.push(`${pos} ${plural(pos, "PO", "POs")}`)
      if (subs) parts.push(`${subs} ${plural(subs, "sub", "subs")}`)
      return parts.join(" · ")
    }
    case "costs":
      return `${items.length} ${plural(items.length, "entry", "entries")}`
    case "billed":
      return `${items.length} ${plural(items.length, "invoice", "invoices")}`
    case "collected":
      return `${items.length} ${plural(items.length, "payment", "payments")}`
  }
}

// ─── Row anatomy ────────────────────────────────────────────────────────────
// Per-kind mapping of the raw item onto pill / primary / secondary text, so a
// vendor invoice leads with the vendor, a billing with its description, a
// posted cost with the job it hit.

const joinParts = (parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join(" · ")

function rowParts(item: RecentChangeItem, showPm: boolean) {
  const pm = showPm ? item.pmName : null
  // Cost titles arrive as "Labor · 2 lines posted"; the pill already says the
  // row is a posting, so the trailing verb is dropped.
  const costTitle = item.title.replace(/\sposted$/, "")
  switch (item.kind) {
    case "project":
      return {
        pill: "New Job",
        primary: item.jobName ?? item.title,
        secondary: joinParts([item.party, pm]),
      }
    case "purchaseOrder":
    case "subcontract":
      return {
        pill: item.kind === "purchaseOrder" ? "PO" : "Sub",
        primary: item.title,
        secondary: joinParts([item.party, item.jobName, pm]),
      }
    case "cost":
      return {
        pill: "Cost",
        primary: item.jobName ?? "No job",
        secondary: joinParts([costTitle, pm]),
      }
    case "apInvoice":
      return {
        pill: "Invoice",
        primary: item.party ?? item.title,
        secondary: joinParts([item.party ? item.title : null, item.jobName, pm]),
      }
    case "arInvoice":
      return {
        pill: "Billing",
        primary: item.title,
        secondary: joinParts([item.party, item.jobName, pm]),
      }
    case "payment":
      return {
        pill: "Payment",
        primary: item.party ?? "Payment received",
        // Older backend payloads titled payments "Payment · #"; hide that noise.
        secondary: joinParts([
          /^Payment(\s*·\s*#?)?$/.test(item.title) ? null : item.title,
          item.jobName,
          pm,
        ]),
      }
    default:
      return {
        pill: item.kind,
        primary: item.title,
        secondary: joinParts([item.party, item.jobName, pm]),
      }
  }
}

function ChangeRow({
  item,
  showPm,
  onOpenJob,
}: {
  item: RecentChangeItem
  showPm: boolean
  onOpenJob: (jobId: string) => void
}) {
  const { pill, primary, secondary } = rowParts(item, showPm)
  const clickable = Boolean(item.jobId)
  const open = () => item.jobId && onOpenJob(item.jobId)
  return (
    <li
      className={`rcnt-row${clickable ? " rcnt-row-clickable" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? "Open job costing" : undefined}
      onClick={clickable ? open : undefined}
      onKeyDown={clickable ? (e) => e.key === "Enter" && open() : undefined}
    >
      <span className="rcnt-pill">{pill}</span>
      <div className="rcnt-main">
        <span className="rcnt-title">{primary}</span>
        {secondary && <span className="rcnt-sub">{secondary}</span>}
      </div>
      <div className="rcnt-right">
        <span className="rcnt-amount">
          {item.amount ? formatMoneyFull(item.amount) : "—"}
        </span>
        <span className="rcnt-when">{formatRelativeTime(item.occurredAt)}</span>
      </div>
    </li>
  )
}

// ─── Detail modal ───────────────────────────────────────────────────────────
// The deeper look: every change in the window, filterable by category.

function RecentChangesModal({
  open,
  onClose,
  categories,
  byCategory,
  initialFilter,
  since,
  showPm,
  onOpenJob,
}: {
  open: boolean
  onClose: () => void
  categories: Category[]
  byCategory: Record<CategoryKey, RecentChangeItem[]>
  initialFilter: CategoryKey | "all" | null
  since: string
  showPm: boolean
  onOpenJob: (jobId: string) => void
}) {
  const { overlayZ, contentZ } = useModalLayer(open)
  const [filter, setFilter] = useState<CategoryKey | "all">("all")
  // Re-sync the filter to whichever tile opened the modal; null (closing)
  // leaves it alone so the list doesn't flicker during the exit animation.
  const [lastInitial, setLastInitial] = useState(initialFilter)
  if (initialFilter !== lastInitial) {
    setLastInitial(initialFilter)
    if (initialFilter !== null) setFilter(initialFilter)
  }

  const total = categories.reduce((n, c) => n + byCategory[c.key].length, 0)
  const shown = filter === "all" ? categories : categories.filter((c) => c.key === filter)

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
              className="modal modal--wide rcnt-modal"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <h2 className="title2 emphasized">Recent changes — since {since}</h2>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
              <div className="rcnt-chips">
                <button
                  className={`rcnt-chip${filter === "all" ? " rcnt-chip--active" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  All ({total})
                </button>
                {categories.map((c) => (
                  <button
                    key={c.key}
                    className={`rcnt-chip${filter === c.key ? " rcnt-chip--active" : ""}`}
                    onClick={() => setFilter(c.key)}
                  >
                    {c.label} ({byCategory[c.key].length})
                  </button>
                ))}
              </div>
              <div className="rcnt-modal-body">
                {shown.every((c) => byCategory[c.key].length === 0) ? (
                  <p className="body-text text-secondary rcnt-empty">
                    No changes since {since}.
                  </p>
                ) : (
                  shown.map((c) => {
                    const items = byCategory[c.key]
                    if (items.length === 0) return null
                    const money = sum(items)
                    return (
                      <section key={c.key} className="rcnt-group">
                        {filter === "all" && (
                          <header className="rcnt-group-head">
                            <span>{c.label}</span>
                            <span className="rcnt-group-total">
                              {money !== 0 ? formatMoneyFull(money) : `${items.length}`}
                            </span>
                          </header>
                        )}
                        <ul className="rcnt-list">
                          {items.map((item) => (
                            <ChangeRow
                              key={`${item.kind}-${item.id}`}
                              item={item}
                              showPm={showPm}
                              onOpenJob={onOpenJob}
                            />
                          ))}
                        </ul>
                      </section>
                    )
                  })
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ─── Panel ──────────────────────────────────────────────────────────────────

/**
 * The Recent Changes section: one full-width panel. A strip of summary tiles
 * (count / dollars per category) states what happened since the last business
 * day at a glance; below it, only the largest movements are listed. Every
 * tile and the "View all" link open the detail modal for the full feed.
 * `source` picks the backing query; the PM variant drops the billing tiles
 * and PM attribution (every row is theirs).
 */
export function RecentChangesPanel({ source }: { source: RecentSource }) {
  const { items, sinceLabel, isLoading, disconnected } = useRecentChanges(source)
  const { goToJobcost } = useJobcostNav()
  const showPm = source === "admin"
  const categories = useMemo(
    () => CATEGORIES.filter((c) => showPm || !c.adminOnly),
    [showPm]
  )

  const byCategory = useMemo(() => {
    const map = {} as Record<CategoryKey, RecentChangeItem[]>
    for (const c of CATEGORIES) {
      map[c.key] = items.filter((i) => c.kinds.includes(i.kind))
    }
    return map
  }, [items])

  const included = useMemo(
    () => categories.flatMap((c) => byCategory[c.key]),
    [categories, byCategory]
  )

  // The digest: the biggest dollar movements across every category.
  const highlights = useMemo(
    () =>
      [...included]
        .filter((i) => i.amount != null && i.amount !== 0)
        .sort((a, b) => Math.abs(b.amount!) - Math.abs(a.amount!))
        .slice(0, HIGHLIGHT_COUNT),
    [included]
  )

  const [modalFilter, setModalFilter] = useState<CategoryKey | "all" | null>(null)

  const onOpenJob = (jobId: string) => goToJobcost(jobId, { backLabel: "Dashboard" })
  const isEmpty = !isLoading && !disconnected && included.length === 0

  return (
    <Widget loading={isLoading} disconnected={disconnected} className="rcnt-panel">
      {isEmpty ? (
        <div className="widget-no-data">
          <span className="body-text">No changes since {sinceLabel}</span>
        </div>
      ) : (
        <>
          <div className="rcnt-head">
            <span className="rcnt-eyebrow">Since {sinceLabel}</span>
            <button className="rcnt-view-all" onClick={() => setModalFilter("all")}>
              View all {included.length} changes
            </button>
          </div>

          <div className="rcnt-tiles">
            {categories.map((c) => {
              const catItems = byCategory[c.key]
              const money = sum(catItems)
              const value =
                c.key === "projects"
                  ? String(catItems.length)
                  : money !== 0
                    ? formatMoneyFull(money)
                    : "—"
              return (
                <button
                  key={c.key}
                  className="rcnt-tile"
                  onClick={() => setModalFilter(c.key)}
                  disabled={catItems.length === 0}
                >
                  <span className="rcnt-tile-label">{c.label}</span>
                  <span className={`rcnt-tile-value${catItems.length === 0 ? " rcnt-tile-value--zero" : ""}`}>
                    {catItems.length === 0 ? "—" : value}
                  </span>
                  <span className="rcnt-tile-sub">{tileSub(c.key, catItems)}</span>
                </button>
              )
            })}
          </div>

          {highlights.length > 0 && (
            <ul className="rcnt-list rcnt-highlights">
              {highlights.map((item) => (
                <ChangeRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  showPm={showPm}
                  onOpenJob={onOpenJob}
                />
              ))}
            </ul>
          )}

          <RecentChangesModal
            open={modalFilter !== null}
            onClose={() => setModalFilter(null)}
            categories={categories}
            byCategory={byCategory}
            initialFilter={modalFilter}
            since={sinceLabel}
            showPm={showPm}
            onOpenJob={onOpenJob}
          />
        </>
      )}
    </Widget>
  )
}
