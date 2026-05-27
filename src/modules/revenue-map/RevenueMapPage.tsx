import { useState, useMemo } from "react"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { YearSelector } from "../../shared/components/YearSelector/YearSelector"
import { Widget } from "../../shared/components/Widget/Widget"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import useLocalStorage from "../../shared/hooks/useLocalStorage"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { useDarkMode } from "../../shared/hooks/useDarkMode"

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
      if (stateData.margin >= 0.20) return "#22c55e"
      if (stateData.margin >= 0.17) return "#eab308"
      return "#ef4444"
    }

    const intensity = stateData.revenue / maxRevenue
    // Copper gradient from low to high
    const r = Math.round(194 + (232 - 194) * (1 - intensity))
    const g = Math.round(124 + (224 - 124) * (1 - intensity))
    const b = Math.round(62 + (216 - 62) * (1 - intensity))
    return `rgb(${r}, ${g}, ${b})`
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
      <div style={{ display: "flex", gap: "1.5rem" }}>
        <Widget title={`${year ?? "All-Time"} ${viewMode === "revenue" ? "Revenue" : "Margin"} by State`} loading={isLoading} noData={stateMap.size === 0}>
          <div style={{ height: "70vh" }}>
            <ComposableMap projection="geoAlbersUsa">
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
                            hover: { fill: "#c27c3e", outline: "none" },
                            pressed: { fill: "#a86a34", outline: "none" },
                            default: { outline: "none" },
                          }}
                          onClick={() => abbr && setSelectedState(abbr)}
                        />
                      )
                    })
                  }
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>
          </div>
        </Widget>

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
    </Page>
  )
}
