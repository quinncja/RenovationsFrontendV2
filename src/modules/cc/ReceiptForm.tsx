import { useEffect, useState, useRef } from "react";
import { Camera, FileUp, Plus, Trash2 } from "lucide-react";
import { json, base } from "./api";
import {
  money,
  statusLabel,
  type Receipt,
  type Options,
  type Request,
  type ReceiptFile,
  type Allocation,
} from "./types";
import "./cc.css";

type Draft = Omit<Allocation, "amountCents"> & { amount: string };
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
  return (
    <a
      className="cc-file"
      href={url || undefined}
      target="_blank"
      rel="noopener noreferrer"
    >
      {error ? (
        <span>{error}</span>
      ) : url &&
        file.mime.startsWith("image/") &&
        file.mime !== "image/heic" ? (
        <img src={url} alt={file.name} loading="lazy" />
      ) : (
        <FileUp size={24} />
      )}
      <span>{file.name}</span>
      <small>
        {file.mime === "image/heic" ? "Open original" : "View receipt"}
      </small>
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
            allocations: draft,
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
  const allocated = draft.reduce(
    (sum, a) => sum + Math.round(Number(a.amount || 0) * 100),
    0,
  );
  const remaining = Math.round(Number(amount || 0) * 100) - allocated;
  return (
    <div className="cc cc-form">
      <div className="cc-receipt-heading">
        <div>
          <span className="cc-eyebrow">
            {r.mode === "test" ? "Test receipt" : "Company card"} ·{" "}
            {r.cardLast4}
          </span>
          <h2>{r.employeeName}</h2>
          <span className="cc-muted">{statusLabel(r.state)}</span>
        </div>
        <strong className="cc-total">{money(r.amountCents)}</strong>
      </div>
      {r.correctionReason && (
        <div className="cc-notice">
          Correction requested: {r.correctionReason}
        </div>
      )}
      {r.state === "awaiting" && (
        <p className="cc-notice">
          Submitted for approval. Saving changes will return this receipt to
          Pending Submission.
        </p>
      )}
      {readonly && (
        <p className="cc-notice">
          This receipt is {statusLabel(r.state).toLowerCase()} and cannot be
          edited here.
        </p>
      )}
      {!!r.matchCandidates?.length && (
        <p className="cc-error">
          A possible manual receipt match needs to be resolved before
          submission.
        </p>
      )}
      {error && (
        <p role="alert" className="cc-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="cc-notice">
          {notice}
        </p>
      )}
      <fieldset disabled={readonly || busy}>
        <div className="cc-fields">
          <label>
            Description
            <input
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Total ($)
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Receipt date
            <input
              type="date"
              value={date}
              disabled={!r.manual}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        {!!r.charges.length && (
          <div className="cc-charge-lines">
            <span className="cc-eyebrow">Original charges</span>
            {r.charges.map((c) => (
              <div key={c.messageId}>
                <span>{c.merchant}</span>
                <strong>{money(c.amountCents)}</strong>
                {!readonly && r.charges.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      void relationship("separate", { messageId: c.messageId })
                    }
                  >
                    Separate receipt
                  </button>
                )}
              </div>
            ))}
            {r.charges.length > 1 && (
              <label className="cc-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                These charges belong to one receipt.
              </label>
            )}
          </div>
        )}
        {!!r.matchCandidates?.length && (
          <section className="cc-section">
            <h3>Possible existing receipt</h3>
            <p className="cc-muted">
              These match the card, date and amount. Confirm the existing
              receipt to avoid a duplicate invoice.
            </p>
            {candidates
              .filter((c) => r.matchCandidates?.includes(c.id))
              .map((c) => (
                <div className="cc-actions" key={c.id}>
                  <span>
                    {c.description} · {c.receiptDate} · {money(c.amountCents)} ·{" "}
                    {c.state}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void relationship("match-confirm", { receiptId: c.id })
                    }
                  >
                    Use existing receipt
                  </button>
                </div>
              ))}
            <button
              type="button"
              onClick={() => void relationship("match-reject")}
            >
              These are different purchases
            </button>
          </section>
        )}
        {r.amountCents < 0 && (
          <section className="cc-section">
            <h3>Original purchase</h3>
            {r.originalReceiptId ? (
              <p className="cc-muted">
                Linked to original receipt {r.originalReceiptId}. Review the
                return allocations below.
              </p>
            ) : (
              <label>
                Link this return
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value)
                      void relationship("link-return", {
                        receiptId: e.target.value,
                      });
                  }}
                >
                  <option value="">Choose an original receipt…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.receiptDate} · {c.description} · {money(c.amountCents)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        )}
        <section className="cc-section">
          <h3>Receipt images</h3>
          <p className="cc-muted">
            Photos or PDFs · up to 15 MB each · 20 files maximum
          </p>
          <div className="cc-files">
            {r.files.map((f) => (
              <FilePreview
                key={f.id}
                file={f}
                path={path}
                loadFile={loadFile}
              />
            ))}
          </div>
          {!readonly && (
            <div className="cc-actions">
              <button type="button" onClick={() => cameraRef.current?.click()}>
                <Camera size={16} />
                Take photo
              </button>
              <button type="button" onClick={() => uploadRef.current?.click()}>
                <FileUp size={16} />
                Choose files
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
            </div>
          )}
          <label>
            Missing receipt explanation
            <textarea
              value={missing}
              rows={2}
              maxLength={2000}
              placeholder="Only needed if you cannot provide a receipt."
              onChange={(e) => setMissing(e.target.value)}
            />
          </label>
        </section>
        <section className="cc-section">
          <div className="cc-section-heading">
            <h3>Categorization</h3>
            <span className={remaining ? "cc-error-text" : "cc-muted"}>
              {money(remaining)} remaining
            </span>
          </div>
          {!opts ? (
            <p className="cc-muted">Loading jobs and account codes…</p>
          ) : (
            draft.map((a, index) => (
              <div className="cc-allocation" key={index}>
                <div className="cc-section-heading">
                  <strong>Allocation {index + 1}</strong>
                  {draft.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove allocation ${index + 1}`}
                      className="cc-icon-button"
                      onClick={() =>
                        setDraft(draft.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="cc-fields">
                  <label>
                    Charge to
                    <select
                      value={a.kind}
                      onChange={(e) =>
                        edit(index, {
                          kind: e.target.value as Draft["kind"],
                          destination: "",
                        })
                      }
                    >
                      <option value="job">Job / phase</option>
                      {r.mode !== "test" && (
                        <option value="overhead">Overhead account</option>
                      )}
                    </select>
                  </label>
                  <label>
                    {a.kind === "job" ? "Job / phase" : "Account code"}
                    <select
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
                            label={ownJobs.length ? "Rest of jobs" : "Jobs"}
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
                  <label>
                    Amount ($)
                    <input
                      inputMode="decimal"
                      value={a.amount}
                      onChange={(e) => edit(index, { amount: e.target.value })}
                    />
                  </label>
                  <label>
                    Cost code
                    <select
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
                  <label>
                    Cost type
                    <select
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
          {!readonly && (
            <button
              type="button"
              onClick={() =>
                setDraft([
                  ...draft,
                  {
                    kind: "job",
                    destination: r.mode === "test" ? "24000100" : "",
                    costCode: "",
                    costType: "",
                    amount: (remaining / 100).toFixed(2),
                  },
                ])
              }
            >
              <Plus size={16} />
              Split allocation
            </button>
          )}
        </section>
        {!readonly && (
          <div className="cc-actions cc-submit">
            <button
              type="button"
              disabled={!opts}
              onClick={() => void save(false)}
            >
              Save changes
            </button>
            <button
              type="button"
              className="cc-primary"
              disabled={!opts}
              onClick={() => void save(true)}
            >
              {busy ? "Saving…" : "Submit receipt"}
            </button>
          </div>
        )}
        {!readonly && (
          <details className="cc-section">
            <summary>Charge canceled or authorization disappeared?</summary>
            <label>
              Explain what happened
              <textarea
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!dismissReason.trim()}
              onClick={() =>
                void relationship("request-dismissal", {
                  reason: dismissReason,
                })
              }
            >
              Request dismissal
            </button>
          </details>
        )}
      </fieldset>
      {!!r.relatedReceipts?.length && (
        <section className="cc-section">
          <h3>Related receipts</h3>
          {r.relatedReceipts.map((item) => (
            <p key={item.id}>
              <a href={`/r/${item.token}`} rel="noreferrer">
                Open related receipt
              </a>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
