import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronRight } from "lucide-react"
import { Widget } from "../../../../shared/components/Widget/Widget"
import { useJobcostNav } from "../../../jobcost/useJobcostNav"
import { useModalLayer } from "../../../../shared/hooks/useModalLayer"
import { formatDate, formatMoneyFull, formatRelativeTime } from "../../../../shared/utils/format"
import type { RecentChangeItem, RecentKind } from "./recentTypes"
import { useRecentChanges, type RecentSource } from "./useRecentChanges"

const TOP_N = 6

// ─── Kind presentation ──────────────────────────────────────────────────────

const KIND_LABEL: Record<
  RecentKind,
  { pill: string; full: string; partyLabel?: string }
> = {
  project: { pill: "New Job", full: "New project", partyLabel: "Client" },
  purchaseOrder: { pill: "PO", full: "Purchase order", partyLabel: "Vendor" },
  subcontract: { pill: "Sub", full: "Subcontract", partyLabel: "Vendor" },
  cost: { pill: "Cost", full: "Posted cost" },
  apInvoice: { pill: "Invoice", full: "Vendor invoice", partyLabel: "Vendor" },
  changeOrder: { pill: "CO", full: "Change order" },
  arInvoice: { pill: "Billing", full: "Client billing", partyLabel: "Client" },
  payment: { pill: "Payment", full: "Payment received", partyLabel: "Client" },
}

/** The item is the story; the project is supporting context. Primary text is
 *  the item itself (invoice description, PO description, cost posting);
 *  secondary is who it involves and which job it hit. */
function rowParts(item: RecentChangeItem) {
  const meta = KIND_LABEL[item.kind]
  // Cost titles arrive as "Labor · 2 lines posted"; the pill already frames
  // the row, so the trailing verb goes.
  const title = item.kind === "cost" ? item.title.replace(/\sposted$/, "") : item.title
  // Older backend payloads titled payments "Payment · #" — pure noise.
  const cleanTitle = /^Payment(\s*·\s*#?)?$/.test(title)
    ? (item.party ?? "Payment received")
    : title
  // Projects lead with the job itself, so their secondary is just the client;
  // everything else leads with the item and carries the job as context.
  const secondaryParts =
    item.kind === "project"
      ? [item.party]
      : [item.party !== cleanTitle ? item.party : null, item.jobName]
  return {
    pill: meta.pill,
    primary: item.kind === "project" ? (item.jobName ?? cleanTitle) : cleanTitle,
    secondary: secondaryParts.filter(Boolean).join(" · "),
  }
}

// ─── Categories ──────────────────────────────────────────────────────────────

type CategoryKey = "projects" | "committed" | "costs" | "billed" | "collected"

interface Category {
  key: CategoryKey
  label: string
  kinds: RecentKind[]
}

const ACTIVITY_CATEGORIES: Category[] = [
  { key: "projects", label: "New Projects", kinds: ["project"] },
  { key: "committed", label: "Committed", kinds: ["purchaseOrder", "subcontract"] },
  { key: "costs", label: "Costs Posted", kinds: ["cost", "apInvoice"] },
]

const BILLING_CATEGORIES: Category[] = [
  { key: "billed", label: "Billed", kinds: ["arInvoice"] },
  { key: "collected", label: "Collected", kinds: ["payment"] },
]

const sum = (items: RecentChangeItem[]) =>
  items.reduce((acc, i) => acc + (i.amount ?? 0), 0)

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

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

// ─── Item detail modal ───────────────────────────────────────────────────────
// The deeper look at one change: every field the feed knows about, plus the
// jump into the project's Job Costing page.

function ItemDetailModal({
  item,
  showPm,
  onClose,
  onViewProject,
}: {
  item: RecentChangeItem | null
  showPm: boolean
  onClose: () => void
  onViewProject: (jobId: string) => void
}) {
  const open = item !== null
  const { overlayZ, contentZ } = useModalLayer(open)
  // Keep the last item through the exit animation.
  const [shown, setShown] = useState(item)
  if (item !== null && item !== shown) setShown(item)
  const meta = shown ? KIND_LABEL[shown.kind] : null

  const fields: Array<[string, string]> = []
  if (shown && meta) {
    fields.push(["Type", meta.full])
    fields.push(["Amount", shown.amount ? formatMoneyFull(shown.amount) : "—"])
    if (shown.party && meta.partyLabel) fields.push([meta.partyLabel, shown.party])
    if (shown.jobName) fields.push(["Project", shown.jobName])
    if (showPm && shown.pmName) fields.push(["Project manager", shown.pmName])
    if (shown.enteredBy) fields.push(["Entered by", shown.enteredBy])
    fields.push([
      "Entered",
      `${formatDate(shown.occurredAt)} · ${formatRelativeTime(shown.occurredAt)}`,
    ])
  }

  return createPortal(
    <AnimatePresence>
      {open && shown && (
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
              className="modal rcnt-detail-modal"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <div className="rcnt-detail-heading">
                  <span className="rcnt-pill">{KIND_LABEL[shown.kind].pill}</span>
                  <h2 className="title2 emphasized">{rowParts(shown).primary}</h2>
                </div>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
              <dl className="rcnt-detail-grid">
                {fields.map(([label, value]) => (
                  <div key={label} className="rcnt-detail-field">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {shown.jobId && (
                <div className="rcnt-detail-footer">
                  <button
                    className="rcnt-btn-primary"
                    onClick={() => onViewProject(shown.jobId!)}
                  >
                    View project
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ─── View-all modal ──────────────────────────────────────────────────────────

function ViewAllModal({
  open,
  onClose,
  categories,
  byCategory,
  initialFilter,
  since,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  categories: Category[]
  byCategory: Record<CategoryKey, RecentChangeItem[]>
  initialFilter: CategoryKey | "all" | null
  since: string
  onSelect: (item: RecentChangeItem) => void
}) {
  const { overlayZ, contentZ } = useModalLayer(open)
  const [filter, setFilter] = useState<CategoryKey | "all">("all")
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
                <h2 className="title2 emphasized">Changes since {since}</h2>
                <button className="button modal-close" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
              {categories.length > 1 && (
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
              )}
              <div className="rcnt-modal-body">
                {shown.map((c) => {
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
                        {items.map((item) => {
                          const { pill, primary, secondary } = rowParts(item)
                          return (
                            <li
                              key={`${item.kind}-${item.id}`}
                              className="rcnt-row rcnt-row-clickable"
                              role="button"
                              tabIndex={0}
                              onClick={() => onSelect(item)}
                              onKeyDown={(e) => e.key === "Enter" && onSelect(item)}
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
                                <span className="rcnt-when">
                                  {formatRelativeTime(item.occurredAt)}
                                </span>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ─── Widget ──────────────────────────────────────────────────────────────────

/**
 * One Recent Changes widget: summary tiles for its categories, then the
 * largest items as a full-bleed table (the shared `.widget:has(.data-table)`
 * treatment — same edge alignment as Employee Performance). Rows lead with
 * the item itself; the project is secondary context. Clicking a row opens the
 * item's detail modal, which links on to the project.
 *
 * `group` picks the categories: "activity" (projects, POs & subs, costs) or
 * "billing" (AR invoices, payments) — the admin home shows one widget of
 * each, the manager home a single activity widget scoped to their jobs.
 */
export function RecentChangesWidget({
  source,
  group,
}: {
  source: RecentSource
  group: "activity" | "billing"
}) {
  const { items, sinceLabel, isLoading, disconnected } = useRecentChanges(source)
  const { goToJobcost } = useJobcostNav()
  const showPm = source === "admin"
  const categories = group === "activity" ? ACTIVITY_CATEGORIES : BILLING_CATEGORIES

  const byCategory = useMemo(() => {
    const map = {} as Record<CategoryKey, RecentChangeItem[]>
    for (const c of categories) {
      map[c.key] = items.filter((i) => c.kinds.includes(i.kind))
    }
    return map
  }, [items, categories])

  const included = useMemo(
    () => categories.flatMap((c) => byCategory[c.key]),
    [categories, byCategory]
  )

  // Largest movements first; zero-amount items (a new job with no contract
  // value yet) sink to the end rather than disappearing.
  const top = useMemo(
    () =>
      [...included]
        .sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0))
        .slice(0, TOP_N),
    [included]
  )

  const [viewAll, setViewAll] = useState<CategoryKey | "all" | null>(null)
  const [selected, setSelected] = useState<RecentChangeItem | null>(null)

  const title =
    source === "pm" ? "Recent Changes" : group === "activity" ? "Project Activity" : "Billing & Payments"
  const isEmpty = !isLoading && !disconnected && included.length === 0

  const viewAllBtn = included.length > 0 && (
    <button className="widget-link-btn" onClick={() => setViewAll("all")}>
      View all {included.length} <ChevronRight size={12} />
    </button>
  )

  return (
    <Widget
      title={title}
      description={`Since ${sinceLabel}`}
      loading={isLoading}
      disconnected={disconnected}
      className="rcnt-widget"
      actions={viewAllBtn || undefined}
    >
      {isEmpty ? (
        <div className="widget-no-data">
          <span className="body-text">
            {group === "billing" ? "No billing activity" : "No changes"} since {sinceLabel}
          </span>
        </div>
      ) : (
        <>
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
                  onClick={() => setViewAll(c.key)}
                  disabled={catItems.length === 0}
                >
                  <span className="rcnt-tile-label">{c.label}</span>
                  <span
                    className={`rcnt-tile-value${catItems.length === 0 ? " rcnt-tile-value--zero" : ""}`}
                  >
                    {catItems.length === 0 ? "—" : value}
                  </span>
                  <span className="rcnt-tile-sub">{tileSub(c.key, catItems)}</span>
                </button>
              )
            })}
          </div>

          <table className="data-table rcnt-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "right" }}>Entered</th>
              </tr>
            </thead>
            <tbody>
              {top.map((item) => {
                const { pill, primary, secondary } = rowParts(item)
                return (
                  <tr
                    key={`${item.kind}-${item.id}`}
                    className="clickable-row"
                    onClick={() => setSelected(item)}
                  >
                    <td>
                      <div className="rcnt-item-cell">
                        <span className="rcnt-pill">{pill}</span>
                        <div className="rcnt-main">
                          <span className="rcnt-title">{primary}</span>
                          {secondary && <span className="rcnt-sub">{secondary}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="rcnt-td-amount">
                      {item.amount ? formatMoneyFull(item.amount) : "—"}
                    </td>
                    <td className="rcnt-td-when">{formatRelativeTime(item.occurredAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      <ViewAllModal
        open={viewAll !== null}
        onClose={() => setViewAll(null)}
        categories={categories}
        byCategory={byCategory}
        initialFilter={viewAll}
        since={sinceLabel}
        onSelect={setSelected}
      />
      <ItemDetailModal
        item={selected}
        showPm={showPm}
        onClose={() => setSelected(null)}
        onViewProject={(jobId) => goToJobcost(jobId, { backLabel: "Dashboard" })}
      />
    </Widget>
  )
}
