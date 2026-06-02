// Shape returned by GET /change-orders (changeOrders.queries.getChangeOrders).
export interface ChangeOrderLineItem {
  desc: string
  unit: string
  material: number
  labor: number
  subs: number
  wtpm: number
  total: number
}

export interface ChangeOrder {
  recnum: string
  chgnum?: number
  name: string
  /** Project name (actrec.jobnme). */
  jobString: string
  /** Job recnum. */
  jobnum: string | number
  total: number
  budget?: number
  status: number
  /** Submission date (prmchg.entdte). */
  date: string
  /** Submitted by (prmchg.usrdf2). */
  user: string
  material: number
  labor: number
  subs: number
  wtpm: number
  lineItems: ChangeOrderLineItem[]
}
