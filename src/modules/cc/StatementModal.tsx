import { useRef, useState, type ReactNode } from "react";
import { CheckCircle2, FileUp } from "lucide-react";
import { CCModal } from "./CCModal";
import { Banner } from "./ReceiptForm";
import { staffRequest } from "./staffApi";
import { json } from "./api";
import { money, day } from "./types";
import { parseStatement, type StatementRow } from "./parseStatement";

interface Line {
  key: string;
  date: string;
  posted: string;
  card: string;
  merchant: string;
  cents: number;
  who: string;
}
interface Preview {
  from: string;
  to: string;
  lines: number;
  totalCents: number;
  already: number;
  matched: number;
  changed: (Line & {
    fromCents: number;
    alertMerchant: string;
    state: string;
    sage?: "posted" | "not-posted";
    invoiceNumber?: string;
    blocked?: string;
  })[];
  combined: (Line & { parts: { date: string; cents: number }[] })[];
  created: Line[];
  notOnStatement: {
    receiptId: string;
    date: string;
    card: string;
    who: string;
    merchant: string;
    cents: number;
    state: string;
  }[];
}
interface Result {
  matched: number;
  changed: number;
  combined: number;
  created: number;
  failed: { kind: string; key: string; error: string; merchant?: string }[];
}

const signed = (cents: number) => `${cents > 0 ? "+" : "−"}${money(Math.abs(cents))}`;

// Weekly statement upload: read the bank's transaction download, stage what it
// changes, apply on confirmation. Matching runs on the server; the staging
// table is its preview, and every change can be left out before applying.
export function StatementModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: () => void;
}) {
  const [file, setFile] = useState<{ name: string; rows: StatementRow[] } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function choose(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setSkip(new Set());
    try {
      const rows = await parseStatement(f);
      const p = await staffRequest<Preview>(
        "cc/statements/preview",
        json("POST", { rows, fileName: f.name }),
      );
      setFile({ name: f.name, rows });
      setPreview(p);
      // Blocked items can't apply; start them unticked.
      setSkip(new Set(p.changed.filter((c) => c.blocked).map((c) => c.key)));
    } catch (e) {
      setError((e as Error).message);
      setFile(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function apply() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await staffRequest<Result>(
          "cc/statements/apply",
          json("POST", { rows: file.rows, fileName: file.name, skip: [...skip] }),
        ),
      );
      onApplied();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (key: string, on: boolean) =>
    setSkip((old) => {
      const next = new Set(old);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });
  const changes = preview
    ? [...preview.changed, ...preview.combined, ...preview.created].filter((x) => !skip.has(x.key)).length
    : 0;
  const nothingToChange =
    preview && !preview.changed.length && !preview.combined.length && !preview.created.length;

  const footer = result ? (
    <button className="button primary-button" onClick={onClose}>
      Done
    </button>
  ) : preview ? (
    <>
      <button className="button secondary-button" disabled={busy} onClick={() => input.current?.click()}>
        Choose another file
      </button>
      <button
        className="button primary-button"
        disabled={busy || (!changes && !preview.matched)}
        onClick={() => void apply()}
      >
        {busy
          ? "Applying…"
          : changes
            ? `Apply ${changes} ${changes === 1 ? "change" : "changes"}`
            : `Mark ${preview.matched} reconciled`}
      </button>
    </>
  ) : undefined;

  return (
    <CCModal eyebrow="Card Receipts" title="Upload statement" wide onClose={onClose} footer={footer}>
      <input
        ref={input}
        type="file"
        hidden
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      {error && <Banner tone="red">{error}</Banner>}

      {result ? (
        <div className="cc-stmt-done">
          <CheckCircle2 size={28} className="cc-stmt-done-icon" aria-hidden="true" />
          <h3 className="title3 emphasized">Statement applied</h3>
          <p className="body-text text-secondary">
            {[
              result.matched && `${result.matched} reconciled`,
              result.changed && `${result.changed} amounts updated`,
              result.combined && `${result.combined} combined`,
              result.created && `${result.created} new receipts`,
            ]
              .filter(Boolean)
              .join(" · ") || "Nothing needed changing."}
          </p>
          {!!result.failed.length && (
            <Banner tone="amber">
              <strong>{result.failed.length} could not be applied.</strong>
              <ul className="cc-stmt-failures">
                {result.failed.map((f) => (
                  <li key={f.key}>
                    {f.merchant || f.key}: {f.error}
                  </li>
                ))}
              </ul>
            </Banner>
          )}
        </div>
      ) : !preview ? (
        <button
          type="button"
          className={`cc-stmt-drop${dragging ? " is-dragging" : ""}`}
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void choose(e.dataTransfer.files?.[0]);
          }}
        >
          <FileUp size={22} aria-hidden="true" />
          <span className="body-text emphasized">
            {busy ? "Reading the statement…" : "Choose last week's transaction download"}
          </span>
          <span className="subheadline text-secondary">
            The Capital One .csv, or the weekly .xlsx. Or drop it here.
          </span>
        </button>
      ) : (
        <div className="cc-stmt">
          <div className="cc-stmt-summary">
            <span className="body-text emphasized">{file?.name}</span>
            <span className="subheadline text-secondary">
              {day(preview.from)} to {day(preview.to)} · {preview.lines} charges ·{" "}
              {money(preview.totalCents)}
            </span>
            <span className="cc-stmt-chips">
              <span className="cc-badge cc-badge--green">{preview.matched} match</span>
              {!!preview.already && (
                <span className="cc-badge cc-badge--muted">{preview.already} already reconciled</span>
              )}
            </span>
          </div>

          {nothingToChange && (
            <p className="body-text text-secondary" style={{ margin: 0 }}>
              Every charge on this statement matches its receipt.
            </p>
          )}

          {!!preview.changed.length && (
            <Section
              title="Amount changed"
              note="The bank charged a different final amount than the alert. The receipt moves to the statement amount; one already in Sage has its invoice updated."
            >
              <thead>
                <tr>
                  <th className="cc-col-check" />
                  <th>Charge</th>
                  <th>Date</th>
                  <th className="spend-rank-table-value">Alert</th>
                  <th className="spend-rank-table-value">Statement</th>
                  <th className="spend-rank-table-value">Change</th>
                  <th>Sage</th>
                </tr>
              </thead>
              <tbody>
                {preview.changed.map((c) => (
                  <tr key={c.key} className="spend-rank-table-row-plain">
                    <Check line={c} skip={skip} toggle={toggle} disabled={!!c.blocked} />
                    <ChargeCell merchant={c.merchant} who={c.who} card={c.card} />
                    <td className="body-text">{day(c.date)}</td>
                    <td className="spend-rank-table-value body-text text-secondary">{money(c.fromCents)}</td>
                    <td className="spend-rank-table-value body-text">{money(c.cents)}</td>
                    <td className="spend-rank-table-value body-text emphasized">
                      {signed(c.cents - c.fromCents)}
                    </td>
                    <td>
                      {c.blocked ? (
                        <span className="cc-badge cc-badge--amber" title={c.blocked}>
                          Can't update
                        </span>
                      ) : c.sage === "posted" ? (
                        <span className="cc-badge cc-badge--blue">Updates #{c.invoiceNumber}</span>
                      ) : (
                        <span className="cc-badge cc-badge--muted">Not posted yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Section>
          )}

          {!!preview.combined.length && (
            <Section
              title="Combined into one charge"
              note="Several alerts settled as one charge. Their receipts combine into one."
            >
              <thead>
                <tr>
                  <th className="cc-col-check" />
                  <th>Charge</th>
                  <th>Date</th>
                  <th className="spend-rank-table-value">Alerts</th>
                  <th className="spend-rank-table-value">Statement</th>
                </tr>
              </thead>
              <tbody>
                {preview.combined.map((c) => (
                  <tr key={c.key} className="spend-rank-table-row-plain">
                    <Check line={c} skip={skip} toggle={toggle} />
                    <ChargeCell merchant={c.merchant} who={c.who} card={c.card} />
                    <td className="body-text">{day(c.date)}</td>
                    <td className="spend-rank-table-value body-text text-secondary">
                      {c.parts.map((p) => money(p.cents)).join(" + ")}
                    </td>
                    <td className="spend-rank-table-value body-text">{money(c.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </Section>
          )}

          {!!preview.created.length && (
            <Section
              title="New receipts"
              note="On the statement with no alert behind them: a card without alerts, a return, or a missed email. Each becomes a receipt for the card's cardholder."
            >
              <thead>
                <tr>
                  <th className="cc-col-check" />
                  <th>Charge</th>
                  <th>Date</th>
                  <th className="spend-rank-table-value">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.created.map((c) => (
                  <tr key={c.key} className="spend-rank-table-row-plain">
                    <Check line={c} skip={skip} toggle={toggle} />
                    <ChargeCell merchant={c.merchant} who={c.who} card={c.card} />
                    <td className="body-text">{day(c.date)}</td>
                    <td className="spend-rank-table-value body-text">
                      {c.cents < 0 ? `${money(c.cents)} return` : money(c.cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Section>
          )}

          {!!preview.notOnStatement.length && (
            <details className="cc-stmt-aside">
              <summary className="subheadline text-secondary">
                {preview.notOnStatement.length} receipts from these dates aren't on this statement
              </summary>
              <p className="cc-band-sub">
                Usually charges that post next week. Nothing changes for them.
              </p>
              <div className="co-table-scroll">
                <table className="spend-rank-table">
                  <tbody>
                    {preview.notOnStatement.map((r) => (
                      <tr key={r.receiptId} className="spend-rank-table-row-plain">
                        <ChargeCell merchant={r.merchant} who={r.who} card={r.card} />
                        <td className="body-text">{day(r.date)}</td>
                        <td className="spend-rank-table-value body-text">{money(r.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </CCModal>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="cc-stmt-section">
      <div className="cc-band-head">
        <h3 className="cc-band-title">{title}</h3>
      </div>
      <p className="cc-band-sub">{note}</p>
      <div className="co-table-scroll cc-stmt-table">
        <table className="spend-rank-table">{children}</table>
      </div>
    </section>
  );
}

function ChargeCell({ merchant, who, card }: { merchant: string; who: string; card: string }) {
  return (
    <td>
      <div className="cc-cell-stack">
        <span className="body-text emphasized">{merchant}</span>
        <span className="cell-secondary">
          {who} · •••• {card}
        </span>
      </div>
    </td>
  );
}

function Check({
  line,
  skip,
  toggle,
  disabled,
}: {
  line: { key: string; merchant: string };
  skip: Set<string>;
  toggle: (key: string, on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <td className="cc-col-check">
      <input
        type="checkbox"
        aria-label={`Include ${line.merchant}`}
        checked={!skip.has(line.key)}
        disabled={disabled}
        onChange={(e) => toggle(line.key, e.target.checked)}
      />
    </td>
  );
}
