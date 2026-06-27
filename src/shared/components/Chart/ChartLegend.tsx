// A plain-HTML chart legend, rendered outside the SVG (e.g. in a Widget's
// header `actions` slot) so it can sit precisely in the widget's top-right
// corner instead of floating inside the plot like nivo's built-in legend.
// Pair with `legend: false` (line) / `hideLegend: true` (bar) on the Chart.
export interface ChartLegendItem {
  label: string
  /** Swatch color — must match the series/key color in the chart. */
  color: string
}

export function ChartLegend({ items }: { items: ChartLegendItem[] }) {
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.label} className="chart-legend-item">
          <span className="chart-legend-dot" style={{ background: it.color }} />
          <span className="chart-legend-label">{it.label}</span>
        </span>
      ))}
    </div>
  )
}
