export interface Allocation {
  kind: "job" | "overhead";
  destination: string;
  name?: string;
  costCode: string;
  costType: string;
  amountCents: number;
}
export interface ReceiptFile {
  id: string;
  name: string;
  mime: string;
  bytes: number;
}
export interface Receipt {
  _id: string;
  revision: number;
  state: "pending" | "awaiting" | "posting" | "approved" | "dismissed";
  mode: "test" | "production";
  employeeName: string;
  cardLast4: string;
  receiptDate: string;
  description: string;
  amountCents: number;
  charges: { merchant: string; amountCents: number; messageId: string }[];
  allocations: Allocation[];
  files: ReceiptFile[];
  missingReceipt: string;
  combinedConfirmed: boolean;
  manual: boolean;
  firstSubmittedAt?: string;
  lastSubmittedAt?: string;
  createdAt?: string;
  approvedAt?: string;
  correctionReason?: string;
  dismissalRequested?: string;
  invoiceNumber?: string;
  canApprove?: boolean;
  originalReceiptId?: string;
  relatedReceiptIds?: string[];
  relatedReceipts?: { id: string; token: string }[];
  ownerUid?: string;
  /** Sage employee the card maps to; set means the receipt is assigned. */
  employeeId?: number | null;
  matchCandidates?: string[];
  dropboxRevision?: number;
  dropboxSyncedRevision?: number;
  dropboxError?: string;
  audit?: {
    action: string;
    name: string;
    at: string;
    before?: unknown;
    after?: unknown;
  }[];
}
export interface Option {
  id: string;
  name: string;
  own?: boolean;
  status?: number;
}
export interface Options {
  jobs: Option[];
  accounts: Option[];
  costCodes: Option[];
  costTypes: Option[];
}
export interface CCSettings {
  testMode: boolean;
  revision: number;
  canEdit: boolean;
  sageReady: boolean;
  smsReady: boolean;
  testConsent: string;
}
export type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const statusLabel = (state: Receipt["state"]) =>
  ({
    pending: "Pending submission",
    awaiting: "Awaiting approval",
    posting: "Posting",
    approved: "Approved",
    dismissed: "Dismissed",
  })[state];
export type Tone = "blue" | "green" | "amber" | "red" | "gray" | "muted";
export const statusTone = (state: Receipt["state"]): Tone =>
  (
    {
      pending: "amber",
      awaiting: "blue",
      posting: "blue",
      approved: "green",
      dismissed: "gray",
    } as const
  )[state];
// Receipt dates are plain YYYY-MM-DD; format in UTC so no zone shifts the day.
export const day = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
};
