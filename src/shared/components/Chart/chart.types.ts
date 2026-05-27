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
      /** Bar fill color for single-series bars (defaults to primary chart color) */
      color?: string
      /** Color palette for stacked keys (defaults to the chart palette) */
      colors?: string[]
      /** Y-axis label formatter */
      yFormat?: (v: number) => string
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
      legend?: boolean
      curve?: "linear" | "monotoneX" | "step" | "natural" | "catmullRom"
      axisBottomTickValues?: string[]
      axisBottomFormat?: (v: string | number) => string
      disableGrowthTooltip?: boolean
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
