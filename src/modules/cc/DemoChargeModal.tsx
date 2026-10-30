import { useEffect, useState } from "react";
import { CCModal } from "./CCModal";
import { Banner } from "./ReceiptForm";
import { staffRequest } from "./staffApi";
import { json } from "./api";

interface Card {
  cardLast4: string;
  employeeName?: string;
  active?: boolean;
}

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};

export function DemoChargeModal({
  onClose,
  onCharged,
}: {
  onClose: () => void;
  onCharged: (receiptId: string | null) => void;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const [draft, setDraft] = useState({
    cardLast4: "",
    merchant: "",
    amount: "",
    date: today(),
    refund: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    staffRequest<{ mappings: Card[] }>("cc/mappings")
      .then(({ mappings }) => {
        const active = mappings.filter((m) => m.active !== false);
        setCards(active);
        if (active.length === 1)
          setDraft((d) => ({ ...d, cardLast4: active[0].cardLast4 }));
      })
      .catch(() => {});
  }, []);

  const valid =
    /^\d{4}$/.test(draft.cardLast4) &&
    draft.merchant.trim().length > 0 &&
    Number(draft.amount.replace(/,/g, "")) > 0 &&
    !!draft.date;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const out = await staffRequest<{ receiptId: string | null }>(
        "cc/demo/charges",
        json("POST", draft),
      );
      onCharged(out.receiptId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <CCModal
      eyebrow="Demo"
      title="Simulate card charge"
      narrow
      onClose={onClose}
      footer={
        <>
          <button className="button secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary-button"
            disabled={busy || !valid}
            onClick={() => void submit()}
          >
            {busy ? "Sending…" : draft.refund ? "Send refund alert" : "Send charge alert"}
          </button>
        </>
      }
    >
      <form
        className="cc-demo-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void submit();
        }}
      >
        <fieldset className="cc-fieldset" disabled={busy}>
          <p className="cc-quote">
            Arrives exactly like a Capital One alert: it becomes a receipt
            waiting on the cardholder. No text is sent.
          </p>
          <div className="cc-grid">
            <label className="cc-field">
              <span className="cc-field-label">Card</span>
              {cards.length ? (
                <select
                  className="cc-input"
                  value={draft.cardLast4}
                  autoFocus
                  onChange={(e) => set({ cardLast4: e.target.value })}
                >
                  <option value="">Choose a card</option>
                  {cards.map((c) => (
                    <option key={c.cardLast4} value={c.cardLast4}>
                      {c.employeeName || "Unassigned"} · •••• {c.cardLast4}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="cc-input cc-input--money"
                  value={draft.cardLast4}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Last four"
                  autoFocus
                  onChange={(e) => set({ cardLast4: e.target.value.replace(/\D/g, "") })}
                />
              )}
            </label>
            <label className="cc-field">
              <span className="cc-field-label">Charge date</span>
              <input
                className="cc-input"
                type="date"
                max={today()}
                value={draft.date}
                onChange={(e) => set({ date: e.target.value })}
              />
            </label>
            <label className="cc-field">
              <span className="cc-field-label">Merchant</span>
              <input
                className="cc-input"
                maxLength={100}
                placeholder="THE HOME DEPOT #1950"
                value={draft.merchant}
                onChange={(e) => set({ merchant: e.target.value })}
              />
            </label>
            <label className="cc-field">
              <span className="cc-field-label">Amount</span>
              <input
                className="cc-input cc-input--money"
                inputMode="decimal"
                placeholder="0.00"
                value={draft.amount}
                onChange={(e) => set({ amount: e.target.value.replace(/[^\d.,]/g, "") })}
              />
            </label>
          </div>
          <label className="cc-check">
            <input
              type="checkbox"
              checked={draft.refund}
              onChange={(e) => set({ refund: e.target.checked })}
            />
            Refund (money back to the card)
          </label>
          {!cards.length && (
            <span className="cc-field-hint">
              No demo cards are mapped yet, so this charge arrives unassigned.
              Add one under Card mapping to see it reach a cardholder.
            </span>
          )}
          {error && <Banner tone="red">{error}</Banner>}
          <button type="submit" hidden />
        </fieldset>
      </form>
    </CCModal>
  );
}
