import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { SortableHeader } from "../../shared/components/SortableHeader"
import { useTableSort, applySort } from "../../shared/hooks/useTableSort"
import { useModalLayer } from "../../shared/hooks/useModalLayer"
import { useCloseOnRouteChange } from "../../shared/hooks/useCloseOnRouteChange"
import { formatMoneyFull, formatPercent, marginTextColor } from "../../shared/utils/format"
import useMarginColorsEnabled from "../../shared/hooks/useMarginColorsEnabled"
import { PeriodSearch, Highlight } from "./PeriodSearch"
import { normalizeSearch } from "./overheadSearch"
import { totalsOf, type MarginGroup } from "./marginReport"

type GroupSortKey = "name" | "jobs" | "revenue" | "cost" | "grossProfit" | "margin"

/**
 * Every client (or property) behind the Margin Report's leaderboard: the
 * full ranked, sortable, searchable list. Same shell as the jobs modal; a
 * row hands its group back to the page, which stacks the jobs modal on top.
 */
export function MarginGroupsModal({
  open,
  title,
  subtitle,
  nameLabel,
  plural,
  groups,
  onOpenGroup,
  onClose,
}: {
  open: boolean
  title: string
  subtitle?: string
  nameLabel: string
  /** "clients" / "properties", for the subtitle and empty states. */
  plural: string
  groups: MarginGroup[]
  onOpenGroup: (g: MarginGroup) => void
  onClose: () => void
}) {
  const { overlayZ, contentZ, isTopLayer } = useModalLayer(open)
  useCloseOnRouteChange(open, onClose)
  const marginColorsOn = useMarginColorsEnabled()
  const sort = useTableSort<GroupSortKey>("margin", "desc")
  const [query, setQuery] = useState("")

  const visible = useMemo(
    () => (query ? groups.filter((g) => normalizeSearch(g.name).includes(query)) : groups),
    [groups, query]
  )
  const sorted = applySort(visible, sort, (g, key) =>
    key === "name" ? g.name : key === "jobs" ? g.jobs : key === "revenue" ? g.revenue : key === "cost" ? g.cost : key === "grossProfit" ? g.grossProfit : g.margin ?? -Infinity
  )
  const totals = totalsOf(groups.flatMap((g) => g.members))
  const noun = nameLabel.toLowerCase()
  const marginStyle = (m: number | null) => (m != null && marginColorsOn ? { color: marginTextColor(m) } : undefined)

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={`modal-overlay${isTopLayer ? " modal-overlay--blur" : ""}`}
            style={{ zIndex: overlayZ }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner" style={{ zIndex: contentZ }}>
            <motion.div
              className="modal reports-modal mgr-groups-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="modal-header">
                <div className="reports-modal-title">
                  <div>
                    <h2 className="title2 emphasized">{title}</h2>
                    <span className="reports-modal-subtitle">
                      {subtitle ? `${subtitle} · ` : ""}
                      {groups.length} {groups.length === 1 ? noun : plural} ·{" "}
                      {formatMoneyFull(totals.contract)} contract · {totals.margin != null ? formatPercent(totals.margin) : "—"} margin
                    </span>
                  </div>
                </div>
                <div className="mgr-modal-actions">
                  <PeriodSearch onQuery={setQuery} placeholder={`Find a ${noun}`} ariaLabel={`Search ${plural}`} />
                  <button className="button modal-close" onClick={onClose}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="reports-modal-body scrollbar-secondary">
                {sorted.length === 0 ? (
                  <p className="reports-modal-empty body-text text-secondary">
                    {query ? `No ${noun} matches "${query}".` : `No ${plural}.`}
                  </p>
                ) : (
                  <table className="data-table mgr-group-table">
                    <thead>
                      <tr>
                        <th className="mgr-rank-th" aria-label="Rank" />
                        <SortableHeader label={nameLabel} columnKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} />
                        <SortableHeader label="Jobs" columnKey="jobs" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Contract" columnKey="revenue" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Committed + Spent" columnKey="cost" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Gross Profit" columnKey="grossProfit" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                        <SortableHeader label="Margin" columnKey="margin" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((g, i) => (
                        <tr
                          key={g.key}
                          className="clickable-row"
                          onClick={() => onOpenGroup(g)}
                          tabIndex={0}
                          role="button"
                          onKeyDown={(e) => e.key === "Enter" && onOpenGroup(g)}
                          title="View the jobs behind this row"
                        >
                          <td className="mgr-rank-td text-secondary">{i + 1}</td>
                          <td>
                            <span className="mgr-group-name">
                              <Highlight text={g.name} query={query} />
                            </span>
                          </td>
                          <td className="num text-secondary">{g.jobs}</td>
                          <td className="num text-secondary">{formatMoneyFull(g.revenue)}</td>
                          <td className="num text-secondary">{formatMoneyFull(g.cost)}</td>
                          <td className="num">{formatMoneyFull(g.grossProfit)}</td>
                          <td className="num" style={marginStyle(g.margin)}>
                            {g.margin != null ? formatPercent(g.margin) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>Total</td>
                        <td className="num">{totals.jobs}</td>
                        <td className="num">{formatMoneyFull(totals.revenue)}</td>
                        <td className="num">{formatMoneyFull(totals.cost)}</td>
                        <td className="num">{formatMoneyFull(totals.grossProfit)}</td>
                        <td className="num" style={marginStyle(totals.margin)}>
                          {totals.margin != null ? formatPercent(totals.margin) : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
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
