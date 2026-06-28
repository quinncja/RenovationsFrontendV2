import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, BarChart3 } from "lucide-react"
import { fetchCompanyEngagement, type CompanyEngagement } from "./engagementApi"
import { SectionEngagementList, WidgetEngagementList, PageEngagementList } from "./EngagementInsights"
import { sectionLabel, pageLabel, formatCompactNumber } from "./labels"
import { Chart } from "../components/Chart/Chart"
import type { LineSeries } from "../components/Chart/chart.types"
import { ModalSectionPager } from "../components/UserActivityModal/ModalSectionPager"

/**
 * Company-wide engagement. Deliberately mirrors UserActivityModal's full layout
 * one-for-one — the same wide modal, grouped overview stat cards + API chart,
 * the dot-navigated section pager, and the three card-wrapped ranked lists —
 * just with company-scope data (all users, tech excluded).
 */
export function CompanyEngagementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<CompanyEngagement | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch fresh each open — engagement drifts day to day.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetchCompanyEngagement(30)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // `activity` may be absent until the backend ships the new fields — guard so a
  // stale prod response can't crash the chart / stat cards.
  const activity = data?.activity

  // Most-used section, rolled up from the company's top widgets by dwell.
  const topSection = (() => {
    if (!data) return null
    const totals = new Map<string, number>()
    for (const w of data.topWidgets) {
      if (!w.section) continue
      totals.set(w.section, (totals.get(w.section) ?? 0) + w.totalDwellMs)
    }
    let best: string | null = null
    let bestMs = -1
    for (const [s, ms] of totals) if (ms > bestMs) { best = s; bestMs = ms }
    return best
  })()
  const topPage = data?.topPages[0]

  const series: LineSeries[] = activity
    ? [{
        id: "API Calls",
        color: "var(--primary-color)",
        data: activity.last30Days.map((d) => {
          const date = new Date(d.date + "T12:00:00")
          return {
            x: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            y: d.count,
          }
        }),
      }]
    : []

  const tickValues = series[0]?.data
    .filter((_, i, arr) => i % 6 === 0 || i === arr.length - 1)
    .map((p) => p.x as string)

  const overviewContent = (
    <>
      <div className="usr-overview">
        <div className="usr-stat-group">
          <span className="usr-stat-group-label">Requests</span>
          <div className="usr-stat-group-body">
            <div className="usr-substat">
              <span className="usr-substat-value" title={activity ? activity.total.toLocaleString() : undefined}>
                {activity ? formatCompactNumber(activity.total) : "—"}
              </span>
              <span className="usr-substat-label">Total</span>
            </div>
            <div className="usr-substat">
              <span className="usr-substat-value usr-substat-value--accent" title={activity ? activity.thisMonth.toLocaleString() : undefined}>
                {activity ? formatCompactNumber(activity.thisMonth) : "—"}
              </span>
              <span className="usr-substat-label">Last 30 days</span>
            </div>
          </div>
        </div>

        <div className="usr-stat-group">
          <span className="usr-stat-group-label">Sessions</span>
          <div className="usr-stat-group-body">
            <div className="usr-substat">
              <span className="usr-substat-value">
                {data?.totalSessionCount == null ? "—" : formatCompactNumber(data.totalSessionCount)}
              </span>
              <span className="usr-substat-label">Total</span>
            </div>
            <div className="usr-substat">
              <span className="usr-substat-value usr-substat-value--accent">
                {data?.sessionCount == null ? "—" : formatCompactNumber(data.sessionCount)}
              </span>
              <span className="usr-substat-label">Last 30 days</span>
            </div>
          </div>
        </div>

        <div className="usr-stat-group">
          <span className="usr-stat-group-label">Focus · Last 30 days</span>
          <div className="usr-stat-group-body">
            <div className="usr-substat">
              <span className="usr-substat-value usr-substat-value--text" title={topSection ? sectionLabel(topSection) : undefined}>
                {topSection ? sectionLabel(topSection) : "—"}
              </span>
              <span className="usr-substat-label">Top section</span>
            </div>
            <div className="usr-substat">
              <span className="usr-substat-value usr-substat-value--text" title={topPage ? pageLabel(topPage.page) : undefined}>
                {topPage ? pageLabel(topPage.page) : "—"}
              </span>
              <span className="usr-substat-label">Most visited</span>
            </div>
          </div>
        </div>
      </div>

      <div className="usr-activity-chart-section">
        <p className="invoice-modal-section-label">API Activity · Last 30 Days</p>
        {loading ? (
          <div className="widget-skeleton" style={{ height: "10rem" }} />
        ) : (
          <div className="usr-activity-chart">
            <Chart
              config={{
                type: "line",
                series,
                enableArea: true,
                curve: "monotoneX",
                yFormat: (v) => String(Math.round(v)),
                axisBottomTickValues: tickValues,
                disableGrowthTooltip: true,
              }}
            />
          </div>
        )}
      </div>
    </>
  )

  const engagementContent = (
    <div className="usr-activity-eng-lists">
      {loading ? (
        <div className="widget-skeleton" style={{ height: "16rem" }} />
      ) : (
        <div className="ceng-cols ceng-cols--3">
          <section className="ceng-col">
            <header className="ceng-col-head">
              <h3 className="ceng-col-title">Most-used sections</h3>
              <span className="ceng-col-sub">By time spent</span>
            </header>
            <SectionEngagementList widgets={data?.topWidgets ?? []} />
          </section>
          <section className="ceng-col">
            <header className="ceng-col-head">
              <h3 className="ceng-col-title">Most-used widgets</h3>
              <span className="ceng-col-sub">By time spent</span>
            </header>
            <WidgetEngagementList widgets={data?.topWidgets ?? []} showUsers />
          </section>
          <section className="ceng-col">
            <header className="ceng-col-head">
              <h3 className="ceng-col-title">Most-visited pages</h3>
              <span className="ceng-col-sub">By visits</span>
            </header>
            <PageEngagementList pages={data?.topPages ?? []} showUsers />
          </section>
        </div>
      )}
    </div>
  )

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="modal-positioner">
            <motion.div
              className="modal usr-activity-modal usr-activity-modal--full"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Header — company title block (mirrors the user header layout) */}
              <div className="usr-activity-header">
                <div className="usr-activity-user-row">
                  <div className="usr-avatar usr-avatar-initials usr-avatar--lg">
                    <BarChart3 size={20} />
                  </div>
                  <div className="usr-activity-user-info">
                    <div className="usr-activity-name-row">
                      <span className="usr-activity-name">Company Engagement</span>
                    </div>
                    <span className="usr-activity-email">
                      Last 30 days{data ? ` · ${data.activeUsers} active ${data.activeUsers === 1 ? "user" : "users"}` : ""}
                    </span>
                  </div>
                </div>
                <div className="usr-activity-header-actions">
                  <button className="button modal-close" onClick={onClose}><X size={16} /></button>
                </div>
              </div>

              <ModalSectionPager
                sections={[
                  { id: "overview", label: "Overview", content: overviewContent },
                  { id: "engagement", label: "Engagement", content: engagementContent },
                ]}
              />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
