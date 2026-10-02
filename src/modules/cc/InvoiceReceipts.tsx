import { useEffect, useState } from "react";
import { FilePreview, FileViewer } from "./ReceiptForm";
import { staffRequest, staffFile } from "./staffApi";
import { day, type ReceiptFile } from "./types";
import "./cc.css";

// The card receipt(s) behind a Capital One AP invoice that Card Receipts
// posted, shown inside the shared invoice modal (Job Costing's spending table
// opens it). Hand-entered card invoices have no dashboard receipt, so this
// renders nothing for them, and nothing while loading.

interface InvoiceReceipt {
  id: string;
  description: string;
  receiptDate: string;
  employeeName: string;
  missingReceipt: string;
  files: { id: string; name: string; mime: string; bytes?: number }[];
}

export function InvoiceReceipts({ invoiceRecnum }: { invoiceRecnum: string }) {
  const [rows, setRows] = useState<InvoiceReceipt[] | null>(null),
    [viewing, setViewing] = useState<{ file: ReceiptFile; url: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    staffRequest<InvoiceReceipt[]>(
      `cc/receipts/by-invoice/${encodeURIComponent(invoiceRecnum)}`,
    )
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [invoiceRecnum]);
  if (!rows?.length) return null;
  return (
    <div className="cost-detail-ledger cc-invoice-receipts">
      <div className="cost-detail-ledger-head">
        <span>{rows.length > 1 ? "Card receipts" : "Card receipt"}</span>
        <span />
      </div>
      {rows.map((r) => (
        <div key={r.id} className="cc-invoice-receipt">
          <span className="cc-invoice-receipt-meta">
            {r.employeeName} · {day(r.receiptDate)}
          </span>
          {r.files.length ? (
            <div className="cc-files">
              {r.files.map((f) => (
                <FilePreview
                  key={f.id}
                  file={{ ...f, bytes: f.bytes ?? 0 }}
                  path={`cc/receipts/${r.id}`}
                  loadFile={staffFile}
                  onOpen={(file, url) => setViewing({ file, url })}
                />
              ))}
            </div>
          ) : (
            <p className="cc-invoice-receipt-missing">
              No receipt image
              {r.missingReceipt ? `: ${r.missingReceipt}` : "."}
            </p>
          )}
        </div>
      ))}
      {viewing && (
        <FileViewer
          file={viewing.file}
          url={viewing.url}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
