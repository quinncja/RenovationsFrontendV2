import { useParams } from "react-router-dom"
import Page from "../../shared/components/Page"
import { PageDataProvider, useWidgetData } from "../../shared/context/PageContext"
import { PAGE_QUERIES } from "../../shared/config/pageQueries"
import { Widget } from "../../shared/components/Widget/Widget"
import { StatWidget } from "../../shared/components/StatWidget/StatWidget"
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList"
import { formatMoneyFull } from "../../shared/utils/format"

interface ChangeOrderRow {
  recnum: number
  chgnum: string
  date: string
  description: string
  budget: number
  contractAmount: number
  status: number
  user: string
}

const CO_STATUS_LABEL: Record<number, string> = {
  1: "Approved",
  2: "Pending",
  3: "Rejected",
}

function formatCODate(value: string) {
  if (!value) return ""
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString()
}

export default function JobcostDetailPage() {
  const { recnum } = useParams<{ recnum: string }>()
  const numericId = Number(recnum)

  if (!recnum || isNaN(numericId)) {
    return <Page title="Job Not Found"><p>Invalid job ID.</p></Page>
  }

  return (
    <PageDataProvider module="jobcostDetail" queries={PAGE_QUERIES.projectJobcost} params={{ recnum: numericId }}>
      <JobcostDetail recnum={numericId} />
    </PageDataProvider>
  )
}

function JobcostDetail({ recnum }: { recnum: number }) {
  const { data, isLoading } = useWidgetData<{
    getPhases: unknown[] | null
    getBudgetByRecnum: {
      contract?: number
      totalCost?: number
      margin?: number
      invoiced?: number
      jobName?: string
      jobNum?: string
    } | null
    getAllCostItems: unknown[] | null
    getChangeOrdersByRecnum: ChangeOrderRow[] | null
  }>(["getPhases", "getBudgetByRecnum", "getAllCostItems", "getChangeOrdersByRecnum"])

  const budget = data?.getBudgetByRecnum
  const costItems = data?.getAllCostItems as {
    description: string
    amount: number
    costType: string
    vendor: string
    date: string
  }[] | null
  const changeOrders = data?.getChangeOrdersByRecnum ?? null
  const coTotalBudget = (changeOrders ?? []).reduce((s, co) => s + (Number(co.budget) || 0), 0)
  const coTotalContract = (changeOrders ?? []).reduce((s, co) => s + (Number(co.contractAmount) || 0), 0)

  return (
    <Page
      title={budget?.jobName ?? `Job #${recnum}`}
      subtitle={budget?.jobNum ?? ""}
    >
      <MotionList className="dashboard-grid">
        {/* Summary Metrics */}
        <MotionItem>
          <Widget title="Job Summary" loading={isLoading} noData={!budget}>
            {budget && (
              <div className="stat-grid">
                <StatWidget title="Contract" value={budget.contract} />
                <StatWidget title="Total Cost" value={budget.totalCost} />
                <StatWidget title="Margin" value={budget.margin} format="percent" />
                <StatWidget title="Invoiced" value={budget.invoiced} />
              </div>
            )}
          </Widget>
        </MotionItem>

        {/* Cost Items Table */}
        <MotionItem>
          <Widget title="Cost Items" loading={isLoading} noData={!costItems || costItems.length === 0}>
            {costItems && costItems.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Vendor</th>
                    <th>Type</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {costItems.map((item, i) => (
                    <tr key={i}>
                      <td>{item.description}</td>
                      <td>{item.vendor}</td>
                      <td>{item.costType}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Widget>
        </MotionItem>

        {/* Change Orders */}
        <MotionItem>
          <Widget
            title="Change Orders"
            loading={isLoading}
            noData={!changeOrders || changeOrders.length === 0}
          >
            {changeOrders && changeOrders.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>CO #</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Budget</th>
                    <th style={{ textAlign: "right" }}>Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {changeOrders.map((co) => (
                    <tr key={co.recnum}>
                      <td>{co.chgnum}</td>
                      <td>{formatCODate(co.date)}</td>
                      <td>{co.description}</td>
                      <td>{CO_STATUS_LABEL[co.status] ?? co.status}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(Number(co.budget) || 0)}</td>
                      <td style={{ textAlign: "right" }}>{formatMoneyFull(Number(co.contractAmount) || 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ fontWeight: 600 }}>
                      Total ({changeOrders.length})
                    </td>
                    <td />
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMoneyFull(coTotalBudget)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMoneyFull(coTotalContract)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Widget>
        </MotionItem>
      </MotionList>
    </Page>
  )
}
