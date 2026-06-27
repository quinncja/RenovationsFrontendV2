import type { ReactNode } from "react"

// --- Shared data shapes ---

export interface LinePoint {
  x: string | number
  y: number | null
}

export interface LineSeries {
  id: string
  color?: string
  data: LinePoint[]
}

export interface SpendItem {
  id: string
  label: string
  value: number
}

// --- Chart config discriminated union ---
// Add a new case here to add a new chart type; Chart.tsx handles rendering.

export interface BarDataPoint {
  label: string
  value: number
}

// Subset of nivo's CartesianMarkerProps that we expose. `axis: "x"` draws
// a vertical reference line at the given x value; "y" draws horizontal.
export interface LineMarker {
  axis: "x" | "y"
  value: string | number
  legend?: string
  legendOrientation?: "horizontal" | "vertical"
  legendPosition?: "top" | "top-right" | "right" | "bottom" | "left"
  lineStyle?: {
    stroke?: string
    strokeWidth?: number
    strokeDasharray?: string
    strokeOpacity?: number
  }
  textStyle?: {
    fill?: string
    fontSize?: number
    fontWeight?: number | string
  }
  /** When set (line charts, y-axis markers only), the legend renders as a pill
   *  centered ON the marker line with this background fill — e.g. the widget
   *  surface color — so the label stays legible sitting atop the line instead
   *  of floating above it. Replaces nivo's plain in-line marker text. */
  labelBackground?: string
}

export interface RadialBarSeries {
  id: string
  data: { x: string; y: number }[]
}

export type ChartConfig =
  | {
      type: "bar"
      /**
       * Simple bars use `BarDataPoint[]` ({ label, value }). For multi-series /
       * stacked bars, pass raw rows plus `keys` + `indexBy`.
       */
      data: BarDataPoint[] | Record<string, unknown>[]
      /** Numeric fields to stack. Omit for simple { label, value } data. */
      keys?: string[]
      /** Category-axis field when `keys` is provided (default "label"). */
      indexBy?: string
      /** Multi-key layout: "stacked" (default) piles keys into one bar;
       *  "grouped" places them side by side — use for budget-vs-actual style
       *  comparisons where stacking the two would be meaningless. */
      groupMode?: "grouped" | "stacked"
      /** Trim the top margin and tuck the multi-key legend into the top-right
       *  corner (instead of the default bottom-center row). Mirrors the line
       *  chart's `compactTop` so a bar + line pair in the same grid row align
       *  plot-to-plot and share legend placement. */
      compactTop?: boolean
      /** Bar fill color for single-series bars (defaults to primary chart color) */
      color?: string
      /** Color palette for stacked keys (defaults to the chart palette) */
      colors?: string[]
      /** Per-bar color from its value (simple { label, value } bars only) */
      colorBy?: (value: number) => string
      /** Y-axis label formatter (also used for tooltip values) */
      yFormat?: (v: number) => string
      /** Y-axis lower bound (default "auto"; set below 0 to show negative bars) */
      minValue?: number | "auto"
      /** Y-axis upper bound (default "auto") */
      maxValue?: number | "auto"
      /** Explicit left-axis tick values (fewer labels); also used for grid lines */
      axisLeftTickValues?: number | number[]
      /** Subset of category labels to render on the x axis (e.g. every other
       *  label on mobile, where the full set would crowd). */
      axisBottomTickValues?: string[]
      /** Value-axis scale (default "linear"). "symlog" compresses extreme
       *  magnitudes while still showing zero and negatives. */
      scaleType?: "linear" | "symlog"
      /** symlog linear-threshold: values within ±constant stay ~linear, beyond
       *  are log-compressed. Defaults to nivo's 1. */
      scaleConstant?: number
      /** Draw a brighter reference line at y=0 (useful when bars go negative) */
      emphasizeZero?: boolean
      /** Show one combined tooltip per category (every key's value plus their
       *  signed difference) instead of nivo's default per-segment tooltip.
       *  Hovering anywhere in the category's column triggers it — like a line
       *  chart's slice tooltip. Only meaningful for multi-key (stacked /
       *  diverging) bars. */
      groupTooltip?: boolean
      /** Label for the difference row in the group tooltip (default "Net").
       *  The value shown is the signed sum of the category's key values. */
      tooltipTotalLabel?: string
      /** Extra reference markers — e.g. a vertical dashed line at the open
       *  accounting month so the in-progress bar reads as "you are here".
       *  Merged with the internal `emphasizeZero` marker if both apply. */
      markers?: LineMarker[]
      /** Hide the auto legend (the row of key swatches) under stacked bars. */
      hideLegend?: boolean
      /** Custom tooltip for simple (non-stacked) bars. Receives the category's
       *  indexValue + numeric value; return any node. Overrides the default. */
      barTooltip?: (indexValue: string, value: number) => ReactNode
      /** Render each simple bar's value as a bold label on the opposite side of
       *  the zero axis from the bar (a positive bar's label sits just below the
       *  axis, a negative bar's just above). Uses yFormat for the text and
       *  colorBy (if set) for the color. */
      oppositeAxisLabels?: boolean
      /** Category label of the bar whose value has WIP (over/under) folded in.
       *  When set, that bar's tooltip header reads "{label} Billed + WIP" to
       *  flag it isn't billed-only. Other bars are unaffected. */
      wipMonthLabel?: string | null
      /** Called when a bar's category column is clicked. Receives the
       *  category's indexValue (e.g. the week label) and, for a two-key
       *  diverging chart, which key was clicked based on the cursor's side of
       *  the zero line (e.g. "AR" above, "AP" below). */
      onBarClick?: (indexValue: string, key?: string) => void
    }
  | {
      type: "radial-bar"
      data: RadialBarSeries[]
      /** Override the default color palette */
      colors?: string[]
      /** Value formatter for tooltips/labels */
      valueFormat?: (v: number) => string
    }
  | {
      type: "line"
      series: LineSeries[]
      yFormat?: (v: number) => string
      enableArea?: boolean
      /** Y-axis upper bound (default "auto", driven by the data). Set this when
       *  a horizontal `markers` reference line (e.g. a budget ceiling) can sit
       *  above the data and would otherwise be clipped off the top. */
      maxValue?: number | "auto"
      legend?: boolean
      /** Trim the top margin so the plot sits close under the widget header and
       *  any legend tucks into the top-right corner. For tight cards where the
       *  default headroom wastes vertical space. */
      compactTop?: boolean
      /** Per-legend-item width (px); widen for long series labels. Default 48. */
      legendItemWidth?: number
      curve?: "linear" | "monotoneX" | "step" | "natural" | "catmullRom"
      axisBottomTickValues?: string[]
      axisBottomFormat?: (v: string | number) => string
      disableGrowthTooltip?: boolean
      /** X-axis label of the open month whose value has WIP (over/under)
       *  folded in. When set, that month's slice tooltip header reads
       *  "{Month} Billed + WIP" to flag that the figure isn't billed-only.
       *  Other months are unaffected. */
      wipMonthLabel?: string | null
      /** Reference markers — typically a vertical dashed line at a
       *  specific x value (e.g. the open accounting month, to indicate
       *  "you are here" on a monthly trend chart). Passes through to
       *  nivo's `markers` prop. */
      markers?: LineMarker[]
      /** Animated pulsing dot at one specific data point. Used to draw
       *  attention to the "open" / in-progress data point on a trend
       *  chart. Renders as a static colored dot plus an expanding /
       *  fading ring underneath. Color defaults to the series color. */
      pulsePoint?: { seriesId: string; xValue: string | number; color?: string }
      /** When set, every series mutes to a neutral gray and the single
       *  point matching this x value paints in its series color. Used by
       *  drill-down pages to highlight a clicked month. */
      highlightedX?: string | null
      /** Called when the user clicks a point. Receives the x value as a
       *  string (matches whatever the data points use for `x`). */
      onPointClick?: (xValue: string) => void
    }
  | {
      type: "pie-with-list"
      items: SpendItem[]
      /** How many items to show in the preview list (default 5) */
      previewCount?: number
      valueFormat?: (v: number) => string
      onItemClick?: (id: string) => void
      /** Override the default color palette for this chart */
      colors?: string[]
      /** Text shown in the center of the donut (e.g. "TOTAL REVENUE") */
      centerLabel?: string
      /** Show percentage alongside the value in the list */
      showPercent?: boolean
      /** Size of the donut chart: "sm" = 180px, "md" = 220px, "lg" = 300px (default "sm") */
      chartSize?: "sm" | "md" | "lg"
      /** Override the center total (defaults to sum of displayed items) */
      centerTotal?: number | null
    }
