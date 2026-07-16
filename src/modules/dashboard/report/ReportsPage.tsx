import { useMemo, useState } from "react"
import Page from "../../../shared/components/Page"
import { Widget } from "../../../shared/components/Widget/Widget"
import { MotionList, MotionItem } from "../../../shared/components/MotionList/MotionList"
import { useAuth } from "../../../core/auth/AuthProvider"
import type { ReportMetricKey } from "./reportTypes"
import {
  chicagoToday,
  dayLabel,
  presetRange,
  rangeLabel,
  type DateRange,
  type RangePreset,
} from "./chicagoDate"
import { useRangeReport, type ReportSource } from "./useReportData"
import { visibleMetrics } from "./metricDefs"
import { MetricGrid, MetricGridSkeleton } from "./MetricGrid"
import { MetricDrilldownModal } from "./MetricDrilldownModal"
import { useItemDrilldown } from "./ActivityFeed"
import { ActivityTimeline } from "./ActivityTimeline"
import { MiniCalendarPopover } from "./MiniCalendarPopover"

// Matches the feed's per-kind cap in the backend (getActivityFeed limit).
// A month-scale window can exceed it; the summary tiles stay exact either way.
const FEED_CAP = 100

const PRESETS: Array<{ key: RangePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "thisYear", label: "This Year" },
]

type Selection = { kind: "preset"; preset: RangePreset } | { kind: "day"; day: string }

/**
 * The Reports page: the daily report's metric grid over any window — a picked
 * day, or calendar-period presets — with the full activity feed beneath it.
 * Admins see all six metrics company-wide; managers the four non-billing ones
 * scoped to their jobs (the backend decides from the token).
 */
export default function ReportsPage() {
  const { claims } = useAuth()
  // Route access is already role-gated; managers are supervisor-scoped.
  const source: ReportSource = claims["role"] === "manager" ? "pm" : "admin"

  const today = chicagoToday()
  const [sel, setSel] = useState<Selection>({ kind: "preset", preset: "today" })
  const range: DateRange = useMemo(
    () => (sel.kind === "day" ? { from: sel.day, to: sel.day } : presetRange(sel.preset, today)),
    [sel, today]
  )

  const { payload, isLoading, disconnected } = useRangeReport(source, range)
  const [metric, setMetric] = useState<ReportMetricKey | null>(null)
  const { openItem, modals } = useItemDrilldown({ backLabel: "Activity", window: range })

  // A window can outrun the feed's per-kind server cap; the summary tiles stay
  // exact either way, so we just note the timeline is showing the latest slice.
  const capped = useMemo(
    () =>
      payload
        ? visibleMetrics(payload.summary).some(
            (d) => payload.items.filter((i) => d.kinds.includes(i.kind)).length >= FEED_CAP
          )
        : false,
    [payload]
  )

  return (
    <Page
      title="Activity"
      subtitle={range.from === range.to ? dayLabel(range.from) : rangeLabel(range)}
    >
      <MotionList>
        <MotionItem className="rpt-controls">
          <div className="period-selector" role="radiogroup" aria-label="Report window">
            {PRESETS.map(({ key, label }) => {
              const active = sel.kind === "preset" && sel.preset === key
              return (
                <button
                  key={key}
                  className={`period-selector-btn${active ? " period-selector-btn--active" : ""}`}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSel({ kind: "preset", preset: key })}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <MiniCalendarPopover
            value={sel.kind === "day" ? sel.day : null}
            max={today}
            active={sel.kind === "day"}
            onSelect={(day) => setSel({ kind: "day", day })}
          />
        </MotionItem>

        {/* Skeleton/data swaps happen INSIDE the item so the entrance runs once
            per page load, matching every other MotionList page. */}
        <MotionItem>
          {isLoading ? (
            <MetricGridSkeleton pmScoped={source === "pm"} />
          ) : disconnected || !payload ? (
            <div className="widget card">
              <div className="widget-no-data">
                <span className="body-text">Couldn't load this report — try again shortly</span>
              </div>
            </div>
          ) : (
            <>
              <MetricGrid summary={payload.summary} onOpen={setMetric} />

              <Widget
                title="Timeline"
                description={
                  capped
                    ? `Latest ${FEED_CAP} per category, newest first`
                    : `${payload.items.length} ${payload.items.length === 1 ? "item" : "items"}, newest first`
                }
                className="rcnt-widget rpt-feed-widget"
              >
                {payload.items.length === 0 ? (
                  <div className="widget-no-data">
                    <span className="body-text">No activity in this window</span>
                  </div>
                ) : (
                  <ActivityTimeline
                    items={payload.items}
                    summary={payload.summary}
                    grouped={range.from !== range.to}
                    onSelect={openItem}
                  />
                )}
              </Widget>
            </>
          )}
        </MotionItem>
      </MotionList>

      <MetricDrilldownModal
        metric={metric}
        items={payload?.items ?? []}
        window={range}
        subtitle={rangeLabel(range)}
        backLabel="Activity"
        onClose={() => setMetric(null)}
      />
      {modals}
    </Page>
  )
}
