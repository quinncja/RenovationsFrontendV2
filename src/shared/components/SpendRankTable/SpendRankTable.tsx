import { useNavigate } from "react-router-dom"
import { formatMoneyFull } from "../../utils/format"

interface SpendItem {
  id: string
  label: string
  value: number
}

interface SpendRankTableProps {
  items: SpendItem[]
  detailPath: string
}

export function SpendRankTable({ items, detailPath }: SpendRankTableProps) {
  const navigate = useNavigate()

  if (items.length === 0) {
    return <p className="body-text text-secondary" style={{ padding: "1rem 0" }}>No data for this year.</p>
  }

  return (
    <table className="spend-rank-table">
      <thead>
        <tr>
          <th className="spend-rank-table-num">#</th>
          <th className="spend-rank-table-name">Name</th>
          <th className="spend-rank-table-value">Amount</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr
            key={item.id}
            className="spend-rank-table-row"
            onClick={() => navigate(`${detailPath}/${item.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && navigate(`${detailPath}/${item.id}`)}
          >
            <td className="spend-rank-table-num subheadline text-secondary">{i + 1}</td>
            <td className="spend-rank-table-name body-text">{item.label}</td>
            <td className="spend-rank-table-value body-text emphasized">{formatMoneyFull(item.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
