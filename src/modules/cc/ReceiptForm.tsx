import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  FileUp,
  Info,
  Plus,
  Trash2,
} from "lucide-react";
import { json, base } from "./api";
import {
  day,
  money,
  statusLabel,
  statusTone,
  type Receipt,
  type Options,
  type Request,
  type ReceiptFile,
  type Allocation,
} from "./types";
import "./cc.css";

// Shared by the dashboard review modal and the isolated /r/:token page, so it
// draws only `cc-*` classes (cc.css), never App.css ones. Layout, top to
// bottom: head band (merchant, who/when, amount + status), state banners,
// then Details, Receipt, Categorization bands, and a sticky verdict bar.

type Draft = Omit<Allocation, "amountCents"> & { amount: string };

export function Banner({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "amber" | "red" | "green";
  children: ReactNode;
}) {
  const Icon =
    tone === "green" ? CheckCircle2 : tone === "neutral" ? Info : AlertTriangle;
  return (
    <div
      className={`cc-banner${tone === "neutral" ? "" : ` cc-banner--${tone}`}`}
      role={tone === "red" ? "alert" : undefined}
    >
      <Icon size={16} aria-hidden="true" />
      <div className="cc-banner-body">{children}</div>
    </div>
  );
}

export function FilePreview({
  file,
  path,
  loadFile,
}: {
  file: ReceiptFile;
  path: string;
  loadFile?: (path: string) => Promise<string>;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let blob = "";
    if (loadFile)
      loadFile(`${path}/files/${file.id}`)
        .then((value) => {
          blob = value;
          if (alive) setUrl(value);
          else URL.revokeObjectURL(value);
        })
        .catch(() => {
          if (alive) setError("Preview unavailable");
        });
    else setUrl(`${base}/${path}/files/${file.id}`);
    return () => {
      alive = false;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [file.id, path, loadFile]);
  const image =
    url && file.mime.startsWith("image/") && file.mime !== "image/heic";
  return (
    <a
      className="cc-file"
      href={url || undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={error || `Open ${file.name}`}
    >
      <span className="cc-file-thumb">
        {image ? (
          <img src={url} alt={file.name} loading="lazy" />
        ) : (
          <FileText size={26} aria-hidden="true" />
        )}
      </span>
      <span className="cc-file-name">{error || file.name}</span>
    </a>
  );
}

export default function ReceiptForm({
  initial,
  path,
  request,
  onChange,
  loadFile,
}: {
  initial: Receipt;
  path: string;
  request: Request;
  onChange: (receipt: Receipt) => void;
  loadFile?: (path: string) => Promise<string>;
}) {
  const [r, setReceipt] = useState(initial);
  const [opts, setOpts] = useState<Options | null>(null);
  const [amount, setAmount] = useState((initial.amountCents / 100).toFixed(2));
  const [description, setDescription] = useState(initial.description);
  const [date, setDate] = useState(initial.receiptDate);
  const [missing, setMissing] = useState(initial.missingReceipt || "");
  const [showMissing, setShowMissing] = useState(!!initial.missingReceipt);
  const [confirmed, setConfirmed] = useState(initial.combinedConfirmed);
  const [draft, setDraft] = useState<Draft[]>(
    initial.allocations.length
      ? initial.allocations.map((a) => ({
          ...a,
          amount: (a.amountCents / 100).toFixed(2),
        }))
      : [
          {
            kind: "job",
            destination: initial.mode === "test" ? "24000100" : "",
            costCode: "",
            costType: "",
            amount: (initial.amountCents / 100).toFixed(2),
          },
        ],
  );
  const [candidates, setCandidates] = useState<
    {
      id: string;
      description: string;
      receiptDate: string;
      amountCents: number;
      state: string;
    }[]
  >([]);
  const [dismissReason, setDismissReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null),
    cameraRef = useRef<HTMLInputElement>(null);
  const readonly = ["approved", "posting", "dismissed"].includes(r.state);
  useEffect(() => {
    let alive = true;
    request<Options>(`${path}/options`)
      .then((value) => {
        if (alive) setOpts(value);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [path, request]);
  useEffect(() => {
    if (initial.amountCents < 0 || initial.matchCandidates?.length)
      request<typeof candidates>(`${path}/candidates`)
        .then(setCandidates)
        .catch((e) => setError(e.message));
  }, [path, request, initial.amountCents, initial.matchCandidates]);
  const update = (next: Receipt) => {
    setReceipt(next);
    onChange(next);
  };
  const edit = (index: number, patch: Partial<Draft>) =>
    setDraft((rows) =>
      rows.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  async function save(submit: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      update(
        await request<Receipt>(
          path,
          json("PATCH", {
            revision: r.revision,
            amount,
            description,
            receiptDate: date,
            allocations: effective,
            missingReceipt: missing,
            combinedConfirmed: confirmed,
            submit,
          }),
        ),
      );
      setNotice(
        submit
          ? "Receipt submitted. You can make corrections until it is approved."
          : "Changes saved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    let current = r;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 15 * 1024 * 1024)
          throw new Error(`${file.name} exceeds the 15 MB limit.`);
        current = await request<Receipt>(`${path}/files`, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-Receipt-Revision": String(current.revision),
          },
          body: file,
        });
        update(current);
      }
      setNotice(
        "Files saved. Submit the form when your categorization is complete.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (uploadRef.current) uploadRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }
  async function relationship(
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await request<Receipt>(
        `${path}/actions`,
        json("POST", { revision: r.revision, action, ...extra }),
      );
      update(next);
      setAmount((next.amountCents / 100).toFixed(2));
      setConfirmed(next.combinedConfirmed);
      setDraft(
        next.allocations.map((a) => ({
          ...a,
          amount: (a.amountCents / 100).toFixed(2),
        })),
      );
      setNotice(
        action === "request-dismissal"
          ? "Dismissal requested. A GM will review this charge."
          : "Receipt updated. Review the categorization before submitting.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const ownJobs = opts?.jobs.filter((j) => j.own) || [],
    otherJobs = opts?.jobs.filter((j) => !j.own) || [];
  const split = draft.length > 1;
  // A lone allocation has no amount field: it always carries the full total.
  const effective = split ? draft : draft.map((a) => ({ ...a, amount }));
  const allocated = effective.reduce(
    (sum, a) => sum + Math.round(Number(a.amount || 0) * 100),
    0,
  );
  const remaining = Math.round(Number(amount || 0) * 100) - allocated;
  // The card's merchant names the purchase; grouped charges fall back to the
  // receipt description, and their merchants list in the ledger below.
  const headline =
    r.charges.length === 1 ? r.charges[0].merchant : r.description;

  return (
    <div className="cc-form">
      <header className="cc-head">
        <div className="cc-eyebrow-row">
          <span className="cc-eyebrow">
            {r.mode === "test" ? "Test receipt" : "Company card"}
          </span>
          <span className="cc-dot" aria-hidden="true">
            ·
          </span>
          <span className="cc-caption">•••• {r.cardLast4}</span>
        </div>
        <div className="cc-headline">
          <div className="cc-headline-text">
            <h2 className="cc-title">{headline || "Card charge"}</h2>
            <p className="cc-party">
              {r.employeeName}
              {r.receiptDate ? ` · ${day(r.receiptDate)}` : ""}
            </p>
          </div>
          <div className="cc-figure-block">
            <p className="cc-figure">{money(r.amountCents)}</p>
            <span className={`cc-badge cc-badge--${statusTone(r.state)}`}>
              {statusLabel(r.state)}
            </span>
          </div>
        </div>
      </header>

      {(r.correctionReason ||
        r.state === "awaiting" ||
        readonly ||
        !!r.matchCandidates?.length) && (
        <div className="cc-notes">
          {r.correctionReason && (
            <Banner tone="amber">
              <strong>Correction requested.</strong> {r.correctionReason}
            </Banner>
          )}
          {r.state === "awaiting" && (
            <Banner>
              Submitted for approval. Saving changes returns it to Pending
              Submission.
            </Banner>
          )}
          {readonly && (
            <Banner>
              This receipt is {statusLabel(r.state).toLowerCase()} and can no
              longer be edited.
            </Banner>
          )}
          {!!r.matchCandidates?.length && (
            <Banner tone="amber">
              This may duplicate a receipt you already started. Resolve it
              below before submitting.
            </Banner>
          )}
        </div>
      )}

      <fieldset className="cc-fieldset" disabled={readonly || busy}>
        {!!r.matchCandidates?.length && (
          <section className="cc-band">
            <div className="cc-band-head">
              <h3 className="cc-band-title">Possible existing receipt</h3>
            </div>
            <p className="cc-band-sub">
              Same card, date and amount. Use the existing receipt to avoid a
              duplicate invoice.
            </p>
            <div className="cc-option-list">
              {candidates
                .filter((c) => r.matchCandidates?.includes(c.id))
                .map((c) => (
                  <div className="cc-option" key={c.id}>
                    <span className="cc-option-text">
                      <strong>{c.description}</strong>
                      <span className="cc-option-meta">
                        {day(c.receiptDate)} · {money(c.amountCents)} ·{" "}
                        {c.state}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="cc-btn"
                      onClick={() =>
                        void relationship("match-confirm", { receiptId: c.id })
                      }
                    >
                      Use this receipt
                    </button>
                  </div>
                ))}
            </div>
            <button
              type="button"
              className="cc-btn cc-btn--quiet"
              style={{ alignSelf: "flex-start" }}
              onClick={() => void relationship("match-reject")}
            >
              These are different purchases
            </button>
          </section>
        )}

        <section className="cc-band">
          <div className="cc-band-head">
            <h3 className="cc-band-title">Details</h3>
          </div>
          <div className={r.manual ? "cc-grid cc-grid--3" : "cc-grid"}>
            <label className="cc-field">
              <span className="cc-field-label">Description</span>
              <input
                className="cc-input"
                value={description}
                maxLength={200}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="cc-field">
              <span className="cc-field-label">Total</span>
              <input
                className="cc-input cc-input--money"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {r.manual && (
              <label className="cc-field">
                <span className="cc-field-label">Receipt date</span>
                <input
                  className="cc-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            )}
          </div>
          {r.charges.length > 1 && (
            <div className="cc-ledger">
              {r.charges.map((c) => (
                <div className="cc-ledger-line" key={c.messageId}>
                  <span className="cc-ledger-desc">{c.merchant}</span>
                  {!readonly && (
                    <button
                      type="button"
                      className="cc-btn cc-btn--quiet"
                      onClick={() =>
                        void relationship("separate", {
                          messageId: c.messageId,
                        })
                      }
                    >
                      Separate
                    </button>
                  )}
                  <span className="cc-ledger-amt">{money(c.amountCents)}</span>
                </div>
              ))}
              <div className="cc-ledger-foot">
                <label className="cc-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  These charges belong to one receipt
                </label>
              </div>
            </div>
          )}
        </section>

        {r.amountCents < 0 && (
          <section className="cc-band">
            <div className="cc-band-head">
              <h3 className="cc-band-title">Original purchase</h3>
            </div>
            {r.originalReceiptId ? (
              <p className="cc-band-sub" style={{ marginTop: 0 }}>
                Linked to the original receipt. Review the return
                categorization below.
              </p>
            ) : (
              <label className="cc-field">
                <span className="cc-field-label">Link this return</span>
                <select
                  className="cc-input"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value)
                      void relationship("link-return", {
                        receiptId: e.target.value,
                      });
                  }}
                >
                  <option value="">Choose the original receipt</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {day(c.receiptDate)} · {c.description} ·{" "}
                      {money(c.amountCents)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        )}

        <section className="cc-band">
          <div className="cc-band-head">
            <h3 className="cc-band-title">Receipt</h3>
            {!r.files.length && !missing.trim() && !readonly && (
              <span className="cc-badge cc-badge--amber">Needed</span>
            )}
          </div>
          <div className="cc-files">
            {r.files.map((f) => (
              <FilePreview
                key={f.id}
                file={f}
                path={path}
                loadFile={loadFile}
              />
            ))}
            {!readonly && (
              <>
                <button
                  type="button"
                  className="cc-add-tile"
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera size={20} aria-hidden="true" />
                  Take photo
                </button>
                <button
                  type="button"
                  className="cc-add-tile"
                  onClick={() => uploadRef.current?.click()}
                >
                  <FileUp size={20} aria-hidden="true" />
                  Upload file
                </button>
                <input
                  hidden
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => void upload(e.target.files)}
                />
                <input
                  hidden
                  ref={uploadRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  multiple
                  onChange={(e) => void upload(e.target.files)}
                />
              </>
            )}
          </div>
          {!readonly && (
            <span className="cc-field-hint">
              Photos or PDFs, up to 15 MB each.
            </span>
          )}
          {showMissing ? (
            <label className="cc-field">
              <span className="cc-field-label">Why is there no receipt?</span>
              <textarea
                className="cc-input"
                value={missing}
                rows={2}
                maxLength={2000}
                onChange={(e) => setMissing(e.target.value)}
              />
            </label>
          ) : (
            !readonly && (
              <button
                type="button"
                className="cc-btn cc-btn--quiet"
                style={{ alignSelf: "flex-start" }}
                onClick={() => setShowMissing(true)}
              >
                I can't provide a receipt
              </button>
            )
          )}
        </section>

        <section className="cc-band">
          <div className="cc-band-head">
            <h3 className="cc-band-title">Categorization</h3>
            {opts && (
              <span
                className={`cc-badge cc-badge--${remaining === 0 ? "green" : remaining > 0 ? "amber" : "red"}`}
              >
                {remaining === 0
                  ? "Fully allocated"
                  : remaining > 0
                    ? `${money(remaining)} unallocated`
                    : `Over by ${money(-remaining)}`}
              </span>
            )}
          </div>
          {!opts ? (
            <p className="cc-band-sub" style={{ marginTop: 0 }}>
              Loading jobs and account codes…
            </p>
          ) : (
            draft.map((a, index) => (
              <div
                className={`cc-alloc${split ? " cc-alloc--card" : ""}`}
                key={index}
              >
                {split && (
                  <div className="cc-alloc-head">
                    <span className="cc-alloc-title">Split {index + 1}</span>
                    {!readonly && (
                      <button
                        type="button"
                        aria-label={`Remove split ${index + 1}`}
                        className="cc-icon-btn"
                        onClick={() =>
                          setDraft(draft.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
                {r.mode !== "test" && (
                  <div className="cc-seg" role="radiogroup" aria-label="Charge to">
                    {(
                      [
                        ["job", "Job"],
                        ["overhead", "Overhead"],
                      ] as const
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={a.kind === kind}
                        className={`cc-seg-btn${a.kind === kind ? " cc-seg-btn--active" : ""}`}
                        onClick={() =>
                          a.kind !== kind &&
                          edit(index, { kind, destination: "" })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="cc-grid">
                  <label className={`cc-field${split ? "" : " cc-span-all"}`}>
                    <span className="cc-field-label">
                      {a.kind === "job" ? "Job and phase" : "Overhead account"}
                    </span>
                    <select
                      className="cc-input"
                      required
                      value={a.destination}
                      onChange={(e) =>
                        edit(index, { destination: e.target.value })
                      }
                    >
                      <option value="">Choose…</option>
                      {a.kind === "job" ? (
                        <>
                          {ownJobs.length > 0 && (
                            <optgroup label="Your jobs">
                              {ownJobs.map((j) => (
                                <option key={j.id} value={j.id}>
                                  {j.name} · {j.id}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup
                            label={ownJobs.length ? "All other jobs" : "Jobs"}
                          >
                            {otherJobs.map((j) => (
                              <option key={j.id} value={j.id}>
                                {j.name} · {j.id}
                                {j.status !== 4 ? " (not current)" : ""}
                              </option>
                            ))}
                          </optgroup>
                        </>
                      ) : (
                        opts.accounts.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.id} · {o.name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  {split && (
                    <label className="cc-field">
                      <span className="cc-field-label">Amount</span>
                      <input
                        className="cc-input cc-input--money"
                        inputMode="decimal"
                        value={a.amount}
                        onChange={(e) =>
                          edit(index, { amount: e.target.value })
                        }
                      />
                    </label>
                  )}
                  <label className="cc-field">
                    <span className="cc-field-label">Cost code</span>
                    <select
                      className="cc-input"
                      required
                      value={a.costCode}
                      onChange={(e) =>
                        edit(index, { costCode: e.target.value })
                      }
                    >
                      <option value="">Choose…</option>
                      {opts.costCodes.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.id} · {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cc-field">
                    <span className="cc-field-label">Cost type</span>
                    <select
                      className="cc-input"
                      required
                      value={a.costType}
                      onChange={(e) =>
                        edit(index, { costType: e.target.value })
                      }
                    >
                      <option value="">Choose…</option>
                      {opts.costTypes.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ))
          )}
          {!readonly && opts && (
            <button
              type="button"
              className="cc-btn cc-btn--quiet"
              style={{ alignSelf: "flex-start" }}
              onClick={() =>
                setDraft([
                  ...effective,
                  {
                    kind: "job",
                    destination: r.mode === "test" ? "24000100" : "",
                    costCode: "",
                    costType: "",
                    amount: (Math.max(0, remaining) / 100).toFixed(2),
                  },
                ])
              }
            >
              <Plus size={15} aria-hidden="true" />
              Split across another job
            </button>
          )}
        </section>

        {!readonly && (
          <details className="cc-disclosure">
            <summary>Charge canceled or no longer showing?</summary>
            <div className="cc-disclosure-body">
              <label className="cc-field">
                <span className="cc-field-label">What happened</span>
                <textarea
                  className="cc-input"
                  rows={2}
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="cc-btn"
                disabled={!dismissReason.trim()}
                onClick={() =>
                  void relationship("request-dismissal", {
                    reason: dismissReason,
                  })
                }
              >
                Request dismissal
              </button>
            </div>
          </details>
        )}

        {!!r.relatedReceipts?.length && (
          <section className="cc-band">
            <div className="cc-band-head">
              <h3 className="cc-band-title">Related receipts</h3>
            </div>
            {r.relatedReceipts.map((item, i) => (
              <a
                key={item.id}
                className="cc-link"
                href={`/r/${item.token}`}
                rel="noreferrer"
              >
                Open related receipt {r.relatedReceipts!.length > 1 ? i + 1 : ""}
              </a>
            ))}
          </section>
        )}
      </fieldset>

      {(error || notice) && (
        <div className="cc-feedback">
          {error ? (
            <Banner tone="red">{error}</Banner>
          ) : (
            <Banner tone="green">{notice}</Banner>
          )}
        </div>
      )}

      {!readonly && (
        <div className="cc-actionbar">
          <span className="cc-actionbar-note">
            {r.firstSubmittedAt
              ? "Corrections are allowed until approval."
              : "Save anytime and finish later."}
          </span>
          <button
            type="button"
            className="cc-btn"
            disabled={!opts || busy}
            onClick={() => void save(false)}
          >
            Save
          </button>
          <button
            type="button"
            className="cc-btn cc-btn--primary"
            disabled={!opts || busy}
            onClick={() => void save(true)}
          >
            {busy ? "Saving…" : r.firstSubmittedAt ? "Resubmit" : "Submit receipt"}
          </button>
        </div>
      )}
    </div>
  );
}
