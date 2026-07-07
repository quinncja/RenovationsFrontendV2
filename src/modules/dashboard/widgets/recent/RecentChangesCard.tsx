import { useMemo } from "react"
import { Widget } from "../../../../shared/components/Widget/Widget"
import { useJobcostNav } from "../../../jobcost/useJobcostNav"
import { formatMoneyFull, formatRelativeTime } from "../../../../shared/utils/format"
import { KIND_META, type RecentChangeItem, type RecentKind } from "./recentTypes"
import { useRecentChanges, type RecentSource } from "./useRecentChanges"

const MAX_VISIBLE_ROWS = 8

interface RecentChangesCardProps {
  title: string
  /** Which item kinds this card lists (e.g. purchaseOrder + subcontract). */
  kinds: RecentKind[]
  source: RecentSource
  /** Attribute each row to its job's PM — on for the company-wide admin feed. */
  showPm?: boolean
}

function RowPill({ item }: { item: RecentChangeItem }) {
  // A change order approved in the window is the more meaningful event than
  // its (possibly older) entry — surface that in the pill itself.
  const label =
    item.kind === "changeOrder" && item.status === "approved"
      ? "CO ✓"
      : KIND_META[item.kind].label
  return <span className="rcnt-pill">{label}</span>
}

/**
 * One category of the "Recent Changes" section: a compact list of what was
 * entered since the last business day, count in the title, each row drilling
 * into Job Costing. Shared by the admin section widgets (company-wide) and the
 * manager home (token-scoped) — only `source`/`showPm` differ.
 */
export function RecentChangesCard({ title, kinds, source, showPm }: RecentChangesCardProps) {
  const { items, sinceLabel, isLoading, disconnected } = useRecentChanges(source)
  const { goToJobcost } = useJobcostNav()

  const filtered = useMemo(
    () => items.filter((i) => kinds.includes(i.kind)),
    [items, kinds]
  )
  const visible = filtered.slice(0, MAX_VISIBLE_ROWS)
  const overflow = filtered.length - visible.length
  const isEmpty = !isLoading && !disconnected && filtered.length === 0

  const openJob = (item: RecentChangeItem) => {
    if (item.jobId) goToJobcost(item.jobId, { backLabel: "Dashboard" })
  }

  return (
    <Widget
      title={isLoading ? title : `${title} (${filtered.length})`}
      description={`Since ${sinceLabel}`}
      loading={isLoading}
      disconnected={disconnected}
    >
      {isEmpty ? (
        // Custom empty state ("No changes since Friday") instead of the
        // Widget's generic "No data available" — an empty feed is a normal,
        // meaningful outcome here, not missing data.
        <div className="widget-no-data">
          <span className="body-text">No changes since {sinceLabel}</span>
        </div>
      ) : (
        <ul className="rcnt-list">
          {visible.map((item) => {
            const clickable = Boolean(item.jobId)
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className={`rcnt-row${clickable ? " rcnt-row-clickable" : ""}`}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                title={clickable ? "Open job costing" : undefined}
                onClick={clickable ? () => openJob(item) : undefined}
                onKeyDown={clickable ? (e) => e.key === "Enter" && openJob(item) : undefined}
              >
                <RowPill item={item} />
                <div className="rcnt-main">
                  <span className="rcnt-title">
                    {item.title}
                    {item.party ? <span className="rcnt-party"> · {item.party}</span> : null}
                  </span>
                  <span className="rcnt-sub">
                    {[item.jobName, showPm ? item.pmName : null]
                      .filter(Boolean)
                      .join(" · ") || "No job"}
                  </span>
                </div>
                <div className="rcnt-right">
                  {item.amount != null && (
                    <span className="rcnt-amount">{formatMoneyFull(item.amount)}</span>
                  )}
                  <span className="rcnt-when">{formatRelativeTime(item.occurredAt)}</span>
                </div>
              </li>
            )
          })}
          {overflow > 0 && <li className="rcnt-more">+{overflow} more</li>}
        </ul>
      )}
    </Widget>
  )
}
