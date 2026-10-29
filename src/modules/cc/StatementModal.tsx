import { useRef, useState, type ReactNode } from "react";
import { Check as CheckIcon, CheckCircle2, FileUp } from "lucide-react";
import { CCModal } from "./CCModal";
import { Banner } from "./ReceiptForm";
import { staffRequest } from "./staffApi";
import { json } from "./api";
import { money } from "./types";
import { parseStatement, type StatementRow } from "./parseStatement";
import { addDays, weekName, weekRange } from "./statementWeeks";

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
  week: { start: string; end: string };
  /** Rows with no posted date yet; they reconcile the week they post. */
  pending: number;
  lines: number;
  totalCents: number;
  already: number;
  matched: number;
  changed: (Line & {
    fromCents: number;
    category?: string;
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
const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
// Plain-words reason a final charge differs from its first alert.
function why(c: { cents: number; fromCents: number; category?: string }) {
  const d = c.cents - c.fromCents;
  if (Math.abs(d) <= 100) return `Rounding ${signed(d)}`;
  if (d > 0 && /dining|restaurant/i.test(c.category || "")) return `Tip added ${signed(d)}`;
  return d > 0 ? `Went up ${signed(d)}` : `Settled lower ${signed(d)}`;
}

// Weekly statement upload: read the bank's transaction download, stage what it
// changes, apply on confirmation. Matching runs on the server; the staging
// table is its preview, and every change can be left out before applying.
export function StatementModal({
  week: picked,
  onClose,
  onApplied,
}: {
  /** Monday of the week picked on the card; the file is checked against it. */
  week?: string;
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

  const alreadyDone = !!preview && preview.already === preview.lines;
  const footer = result ? (
    <button className="button primary-button" onClick={onClose}>
      Done
    </button>
  ) : preview ? (
    <>
      <span className="subheadline text-secondary cc-stmt-foot-note">
        {changes ? "Unticked items are left as they are." : ""}
      </span>
      <button className="button secondary-button" disabled={busy} onClick={onClose}>
        Cancel
      </button>
      <button
        className="button primary-button"
        disabled={busy || alreadyDone}
        onClick={() => void apply()}
      >
        {busy
          ? "Updating…"
          : changes
            ? `Confirm ${changes} ${changes === 1 ? "update" : "updates"}`
            : "Mark the week reconciled"}
      </button>
    </>
  ) : undefined;
  // "Oct week 2 (Oct 12 – 18)".
  const label = (start: string) => `${weekName(start)} (${weekRange(start)})`;
  const week = preview ? label(preview.week.start) : "";

  return (
    <CCModal
      eyebrow="Weekly statement"
      title={
        result
          ? `${week} is reconciled`
          : preview
            ? "Check the changes"
            : picked
              ? `Upload the ${label(picked)} statement`
              : "Upload last week's statement"
      }
      wide
      onClose={onClose}
      footer={footer}
    >
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
          <h3 className="title3 emphasized">All set for {week}</h3>
          <p className="body-text text-secondary">
            {[
              result.matched && `${result.matched} matched`,
              result.changed && `${result.changed} amounts updated`,
              result.combined && `${result.combined} merged`,
              result.created && `${result.created} receipts added`,
            ]
              .filter(Boolean)
              .join(" · ") || "Nothing needed changing."}
          </p>
          {!!result.failed.length && (
            <Banner tone="amber">
              <strong>
                {result.failed.length} {result.failed.length === 1 ? "item needs" : "items need"} fixing
                by hand in Sage.
              </strong>
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
        <>
        <ol className="cc-stmt-steps">
          <li>
            <span className="cc-stmt-num">1</span>
            <span>
              In Capital One, open <b>Transactions</b>, pick{" "}
              {picked ? (
                <b>
                  {longDay(picked)} to {longDay(addDays(picked, 6))}
                </b>
              ) : (
                "last week (Monday to Sunday)"
              )}{" "}
              and download it as a <b>CSV</b>.
            </span>
          </li>
          <li>
            <span className="cc-stmt-num">2</span>
            <span>Drop the file below. Nothing changes until you review it and confirm.</span>
          </li>
        </ol>
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
            {busy ? "Reading the statement…" : "Choose the downloaded file"}
          </span>
          <span className="subheadline text-secondary">Or drag it here. A .csv or .xlsx works.</span>
        </button>
        </>
      ) : (
        <div className="cc-stmt">
          {picked && preview.week.start !== picked && (
            <Banner tone="amber">
              This file covers <strong>{week}</strong>, not {label(picked)}, the week you picked.
              Check it's the right download before confirming.
            </Banner>
          )}
          <div className="cc-stmt-result">
            <span className="cc-stmt-result-icon" aria-hidden="true">
              <CheckIcon size={18} strokeWidth={2.6} />
            </span>
            <div>
              <strong>
                {alreadyDone
                  ? "This statement was already uploaded."
                  : `${preview.matched + preview.already} of ${preview.lines} charges match their receipts.`}
              </strong>
              <span>
                {week} · {money(preview.totalCents)}
                {alreadyDone
                  ? " · Nothing left to change."
                  : changes
                    ? ` · ${preview.changed.length + preview.combined.length + preview.created.length} below need a quick look before you confirm.`
                    : " · Nothing else to change."}
                {!!preview.pending &&
                  ` ${preview.pending} ${preview.pending === 1 ? "charge is" : "charges are"} still pending and will be checked on the week ${preview.pending === 1 ? "it posts" : "they post"}.`}
              </span>
            </div>
          </div>

          {!!preview.changed.length && (
            <Section
              title={`Final amount was different · ${preview.changed.length}`}
              note="The bank's final charge differs from the first alert, usually a tip or a gas pump. The receipt is updated to what was actually charged."
            >
              <thead>
                <tr>
                  <th className="cc-col-check" />
                  <th>Charge</th>
                  <th className="spend-rank-table-value">First alert</th>
                  <th className="spend-rank-table-value">Actually charged</th>
                  <th>Why</th>
                  <th>Sage</th>
                </tr>
              </thead>
              <tbody>
                {preview.changed.map((c) => (
                  <tr key={c.key} className="spend-rank-table-row-plain">
                    <Check line={c} skip={skip} toggle={toggle} disabled={!!c.blocked} />
                    <ChargeCell merchant={c.merchant} who={c.who} date={c.date} />
                    <td className="spend-rank-table-value body-text text-secondary">{money(c.fromCents)}</td>
                    <td className="spend-rank-table-value body-text emphasized">{money(c.cents)}</td>
                    <td>
                      <span className="cc-stmt-why">{why(c)}</span>
                    </td>
                    <td className="cc-stmt-sage">
                      {c.blocked
                        ? c.blocked
                        : c.sage === "posted"
                          ? `Invoice ${c.invoiceNumber} is updated too`
                          : "Not in Sage yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Section>
          )}

          {!!preview.combined.length && (
            <Section
              title={`Several holds became one charge · ${preview.combined.length}`}
              note="The store placed more than one hold and charged once. Those receipts are merged into one."
            >
              <thead>
                <tr>
                  <th className="cc-col-check" />
                  <th>Charge</th>
                  <th className="spend-rank-table-value">Holds</th>
                  <th className="spend-rank-table-value">Actually charged</th>
                </tr>
              </thead>
              <tbody>
                {preview.combined.map((c) => (
                  <tr key={c.key} className="spend-rank-table-row-plain">
                    <Check line={c} skip={skip} toggle={toggle} />
                    <ChargeCell merchant={c.merchant} who={c.who} date={c.date} />
                    <td className="spend-rank-table-value body-text text-secondary">
                      {c.parts.map((p) => money(p.cents)).join(" + ")}
                    </td>
                    <td className="spend-rank-table-value body-text emphasized">{money(c.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </Section>
          )}

          {!!preview.created.length && (
            <Section
              title={`No receipt yet · ${preview.created.length}`}
              note="Charged on the card, but no receipt exists. A receipt is added for the cardholder, who is asked to attach the paperwork."
            >
              <thead>
                <tr>
                  <th className="cc-col-check" />
                  <th>Charge</th>
                  <th className="spend-rank-table-value">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.created.map((c) => (
                  <tr key={c.key} className="spend-rank-table-row-plain">
                    <Check line={c} skip={skip} toggle={toggle} />
                    <ChargeCell merchant={c.merchant} who={c.who} date={c.date} />
                    <td className="spend-rank-table-value body-text">
                      {money(c.cents)}
                      {c.cents < 0 && <span className="cc-stmt-why cc-stmt-why--after">Return</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Section>
          )}

          {!!preview.notOnStatement.length && (
            <details className="cc-stmt-aside">
              <summary className="subheadline text-secondary">
                {preview.notOnStatement.length}{" "}
                {preview.notOnStatement.length === 1 ? "receipt isn't" : "receipts aren't"} on this
                statement yet
              </summary>
              <p className="cc-band-sub">
                Usually charges that post next week. Nothing changes for them.
              </p>
              <div className="co-table-scroll">
                <table className="spend-rank-table">
                  <tbody>
                    {preview.notOnStatement.map((r) => (
                      <tr key={r.receiptId} className="spend-rank-table-row-plain">
                        <ChargeCell merchant={r.merchant} who={r.who} date={r.date} />
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

function ChargeCell({ merchant, who, date }: { merchant: string; who: string; date: string }) {
  return (
    <td>
      <div className="cc-cell-stack">
        <span className="body-text emphasized">{merchant}</span>
        <span className="cell-secondary">
          {who} · {shortDay(date)}
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
