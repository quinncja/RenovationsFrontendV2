import { useState, useMemo } from "react"
import Page from "../../shared/components/Page"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { Widget } from "../../shared/components/Widget/Widget"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { useDarkMode } from "../../shared/hooks/useDarkMode"
import { formatMoneyFull } from "../../shared/utils/format"

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"

interface StateData {
  state: string
  revenue: number
  margin: number
}

// FIPS to state abbreviation mapping
const FIPS_TO_STATE: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
  "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
  "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
  "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
}

type ViewMode = "revenue" | "margin"

export default function RevenueMapPage() {
  const [year, setYear] = useLocalStorage<number | null>("revenueMapYear", new Date().getFullYear())

  return (
    <PageDataProvider module="revenueMap" queries={PAGE_QUERIES.revenueMap} params={{ year }}>
      <RevenueMapContent year={year} onYearChange={setYear} />
    </PageDataProvider>
  )
}

function RevenueMapContent({ year, onYearChange }: { year: number | null; onYearChange: (y: number | null) => void }) {
  const dark = useDarkMode()
  const [viewMode, setViewMode] = useState<ViewMode>("revenue")
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const [tip, setTip] = useState<{ content: string; x: number; y: number } | null>(null)
  const { data, isLoading } = useWidgetData<{ revenueMap: StateData[] | null }>(["revenueMap"])

  const stateMap = useMemo(() => {
    const map = new Map<string, StateData>()
    if (Array.isArray(data?.revenueMap)) {
      for (const item of data.revenueMap) {
        map.set(item.state, item)
      }
    }
    return map
  }, [data?.revenueMap])

  const maxRevenue = useMemo(() => {
    let max = 0
    stateMap.forEach(d => { if (d.revenue > max) max = d.revenue })
    return max || 1
  }, [stateMap])

  function getColor(geo: { id: string }): string {
    const abbr = FIPS_TO_STATE[geo.id]
    const stateData = abbr ? stateMap.get(abbr) : undefined
    if (!stateData) return dark ? "#2a2725" : "#e5e7eb"

    if (viewMode === "margin") {
      // Backend returns margin as a percentage (e.g. 18.4), not a fraction.
      if (stateData.margin >= 20) return "#22c55e"
      if (stateData.margin >= 15) return "#eab308"
      return "#ef4444"
    }

    const intensity = stateData.revenue / maxRevenue
    // Copper gradient from low to high
    const r = Math.round(194 + (232 - 194) * (1 - intensity))
    const g = Math.round(124 + (224 - 124) * (1 - intensity))
    const b = Math.round(62 + (216 - 62) * (1 - intensity))
    return `rgb(${r}, ${g}, ${b})`
  }

  function tipText(abbr: string): string {
    const d = stateMap.get(abbr)
    if (!d) return `${abbr} · No data`
    return viewMode === "revenue"
      ? `${abbr} · ${formatMoneyFull(d.revenue)}`
      : `${abbr} · ${d.margin.toFixed(1)}% margin`
  }

  const selectedData = selectedState ? stateMap.get(selectedState) : null

  return (
    <Page
      title="Revenue Map"
      actions={
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div className="toggle-group">
            <button
              className={`button toggle-button ${viewMode === "revenue" ? "active" : ""}`}
              onClick={() => setViewMode("revenue")}
            >
              Revenue
            </button>
            <button
              className={`button toggle-button ${viewMode === "margin" ? "active" : ""}`}
              onClick={() => setViewMode("margin")}
            >
              Margin
            </button>
          </div>
          <YearSelector value={year} onChange={onYearChange} allowAllTime />
        </div>
      }
    >
      <MotionList className="inv-page-stack">
        <MotionItem>
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
        <Widget title={`${year ?? "All-Time"} ${viewMode === "revenue" ? "Revenue" : "Margin"} by State`} loading={isLoading} noData={stateMap.size === 0}>
          <div style={{ height: "70vh", width: "100%" }}>
            <ComposableMap projection="geoAlbersUsa" style={{ width: "100%", height: "100%" }}>
              <ZoomableGroup>
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map(geo => {
                      const abbr = FIPS_TO_STATE[geo.id]
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={getColor(geo)}
                          stroke={dark ? "#1a1714" : "#fff"}
                          strokeWidth={0.5}
                          style={{
                            hover: { fill: dark ? "#9a948c" : "#cbd5e1", outline: "none", cursor: "pointer" },
                            pressed: { fill: dark ? "#7c766e" : "#94a3b8", outline: "none" },
                            default: { outline: "none" },
                          }}
                          onClick={() => abbr && setSelectedState(abbr)}
                          onMouseEnter={(e) => abbr && setTip({ content: tipText(abbr), x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                          onMouseLeave={() => setTip(null)}
                        />
                      )
                    })
                  }
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>
          </div>
        </Widget>
        </div>

        {selectedData && (
          <div style={{ minWidth: 240 }}>
            <Widget title={selectedState || ""}>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <StatWidget title="Revenue" value={selectedData.revenue} />
                <StatWidget title="Margin" value={selectedData.margin} format="percent" />
              </div>
            </Widget>
          </div>
        )}
      </div>
        </MotionItem>
      </MotionList>

      {tip && (
        <div className="map-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
          {tip.content}
        </div>
      )}
    </Page>
  )
}
