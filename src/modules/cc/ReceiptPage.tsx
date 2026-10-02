import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, ChevronRight } from "lucide-react";
import ReceiptForm from "./ReceiptForm";
import { publicRequest } from "./api";
import { day, money, type Receipt } from "./types";
import "./receipt-page.css";

// The cardholder's other unfinished receipts, each with its own link.
interface Outstanding {
  token: string;
  description: string;
  amountCents: number;
  receiptDate: string;
  correction: boolean;
}

// After a submit the form gives way to one of two endings: the receipts this
// card still owes (each opens its own link), or a checkmark saying they are
// done and can close the page.
function Done({
  outstanding,
  onReview,
}: {
  outstanding: Outstanding[];
  onReview: () => void;
}) {
  const left = outstanding.length;
  return (
    <div className="cc-done">
      <span className={`cc-done-mark${left ? " cc-done-mark--small" : ""}`}>
        <Check size={left ? 22 : 34} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <h1 className="cc-done-title">
        {left ? "Receipt submitted" : "You're all set"}
      </h1>
      <p className="cc-done-sub">
        {left
          ? `You have ${left} more ${left === 1 ? "receipt" : "receipts"} to finish.`
          : "Every receipt is submitted. You can close this page now."}
      </p>
      {left > 0 && (
        <ul className="cc-done-list">
          {outstanding.map((o) => (
            <li key={o.token}>
              <a className="cc-done-row" href={`/r/${o.token}`}>
                <span className="cc-done-row-text">
                  <strong>{o.description}</strong>
                  <span>
                    {day(o.receiptDate)}
                    {o.correction ? " · Needs correction" : ""}
                  </span>
                </span>
                <span className="cc-done-row-amt">{money(o.amountCents)}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="cc-btn cc-btn--quiet" onClick={onReview}>
        Review what I submitted
      </button>
    </div>
  );
}
function ReceiptPage() {
  const token = location.pathname.split("/")[2] || "";
  const path = `cc/public/${encodeURIComponent(token)}`;
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [error, setError] = useState(""),
    [done, setDone] = useState<Outstanding[] | null>(null),
    [formKey, setFormKey] = useState(0);
  async function submitted() {
    try {
      setDone(await publicRequest<Outstanding[]>(`${path}/outstanding`));
    } catch {
      // The receipt is saved either way; without the list, say so plainly.
      setDone([]);
    }
    window.scrollTo(0, 0);
  }
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
    <main className="cc-shell">
      <header className="cc-shell-brand">
        <img src="/r-logo.png" alt="" />
        <div>
          <strong>Renovations Delivered</strong>
          <span>Company card receipt</span>
        </div>
      </header>
      <div className="cc-shell-card">
        {done ? (
          <Done
            outstanding={done}
            onReview={() => {
              setDone(null);
              setFormKey((k) => k + 1);
            }}
          />
        ) : receipt ? (
          <ReceiptForm
            key={formKey}
            initial={receipt}
            path={path}
            request={publicRequest}
            onChange={setReceipt}
            onSubmitted={() => void submitted()}
          />
        ) : (
          <p className="cc-shell-status" role={error ? "alert" : "status"}>
            {error || "Loading your receipt…"}
          </p>
        )}
      </div>
      <footer className="cc-shell-footer">
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
