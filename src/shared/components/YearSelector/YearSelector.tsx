const MIN_YEAR = 2019

type YearSelectorProps =
  | { allowAllTime?: false; value: number; onChange: (year: number) => void }
  | { allowAllTime: true; value: number | null; onChange: (year: number | null) => void }

export function YearSelector(props: YearSelectorProps) {
  const { value, onChange, allowAllTime = false } = props
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = currentYear; y >= MIN_YEAR; y--) {
    years.push(y)
  }

  return (
    <select
      className="year-selector"
      value={value ?? "all"}
      onChange={(e) => {
        const v = e.target.value
        if (allowAllTime) {
          ;(onChange as (year: number | null) => void)(v === "all" ? null : Number(v))
        } else {
          ;(onChange as (year: number) => void)(Number(v))
        }
      }}
      aria-label="Select year"
    >
      {allowAllTime && <option value="all">All Time</option>}
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}
