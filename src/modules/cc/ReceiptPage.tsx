import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ReceiptForm from "./ReceiptForm";
import { publicRequest } from "./api";
import type { Receipt } from "./types";
import "./receipt-page.css";
function ReceiptPage() {
  const token = location.pathname.split("/")[2] || "";
  const path = `cc/public/${encodeURIComponent(token)}`;
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    document.documentElement.style.colorScheme = "light";
    document.title = "Receipt · Renovations Delivered";
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    publicRequest<Receipt>(path)
      .then(setReceipt)
      .catch((e) => setError(e.message));
    return () => meta.remove();
  }, [path]);
  return (
    <main className="cc-mobile cc">
      <header className="cc-brand">
        Renovations Delivered<span>Company card receipts</span>
      </header>
      <div className="cc-mobile-card">
        {receipt ? (
          <ReceiptForm
            initial={receipt}
            path={path}
            request={publicRequest}
            onChange={setReceipt}
          />
        ) : (
          <p role={error ? "alert" : "status"}>
            {error || "Loading your receipt…"}
          </p>
        )}
      </div>
      <footer>
        Need help?{" "}
        <a href="mailto:qsieja@renovationsdelivered.com">Contact support</a>
        <div>
          <a href="/sms-terms">Terms</a> · <a href="/sms-privacy">Privacy</a>
        </div>
      </footer>
    </main>
  );
}
export function mountReceiptPage() {
  createRoot(document.getElementById("root")!).render(<ReceiptPage />);
}
