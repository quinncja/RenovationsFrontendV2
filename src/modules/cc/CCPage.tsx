import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Users, RefreshCw } from "lucide-react";
import Page from "../../shared/components/Page";
import { Widget } from "../../shared/components/Widget/Widget";
import { SearchField } from "../../shared/components/SearchField";
import { SegmentedControl } from "../../shared/components/SegmentedControl";
import { useAuth } from "../../core/auth/AuthProvider";
import { staffRequest, staffFile } from "./staffApi";
import { json } from "./api";
import { CCModal } from "./CCModal";
import { MappingModal } from "./MappingModal";
import ReceiptForm, { FilePreview } from "./ReceiptForm";
import { money, statusLabel, type Receipt, type CCSettings } from "./types";
import "./cc.css";
const tabs = [
  { key: "pending", label: "Pending Submission" },
  { key: "awaiting", label: "Awaiting Approval" },
  { key: "past", label: "Past Receipts" },
] as const;
type Tab = (typeof tabs)[number]["key"];
interface Listing {
  items: Receipt[];
  total: number;
  page: number;
  pageSize: number;
}
export default function CCPage() {
  const { claims } = useAuth(),
    gm = ["generalManager", "admin", "executive", "owner", "tech"].includes(
      String(claims.role),
    );
  const [tab, setTab] = useState<Tab>("pending"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [list, setList] = useState<Listing>({
      items: [],
      total: 0,
      page: 0,
      pageSize: 50,
    }),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0);
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [mappings, setMappings] = useState(false),
    [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [formVersion, setFormVersion] = useState(0);
  const [settings, setSettings] = useState<CCSettings | null>(null);
  const [intake, setIntake] = useState<
    { _id: string; mode: string; error: string; receivedAt?: string }[]
  >([]);
  useEffect(() => {
    if (gm)
      staffRequest<typeof intake>("cc/intake-errors")
        .then(setIntake)
        .catch(() => {});
  }, [gm, version]);
  async function retryIntake(id: string) {
    setBusy(true);
    try {
      const result = await staffRequest<{ error: string | null }>(
        "cc/intake-errors/" + encodeURIComponent(id) + "/retry",
        json("POST", {}),
      );
      if (result.error) setError(result.error);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: list.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76,
    overscan: 5,
  });
  const refresh = useCallback(() => {
    setSelected(new Set());
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    staffRequest<CCSettings>("cc/settings")
      .then(setSettings)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelected(new Set());
    staffRequest<Listing>(
      `cc/receipts?state=${tab}&page=${page}&search=${encodeURIComponent(query)}`,
      { signal: controller.signal },
    )
      .then(setList)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, page, query, version]);
  async function open(id: string) {
    setError("");
    try {
      setReceipt(await staffRequest<Receipt>(`cc/receipts/${id}`));
      setReason("");
      setFormVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function action(action: string) {
    if (!receipt) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await staffRequest(
        `cc/receipts/${receipt._id}/actions`,
        json("POST", { revision: receipt.revision, action, reason }),
      );
      await open(receipt._id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function approveBatch() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await staffRequest<{
        results: { id: string; ok: boolean; message?: string }[];
      }>(
        "cc/approve-batch",
        json("POST", {
          receipts: list.items
            .filter((r) => selected.has(r._id))
            .map((r) => ({ id: r._id, revision: r.revision })),
        }),
      );
      setNotice(
        `${result.results.filter((r) => r.ok).length} approved. ${result.results.filter((r) => !r.ok).length} need attention.`,
      );
      setError(
        [
          ...new Set(result.results.filter((r) => !r.ok).map((r) => r.message)),
        ].join(" "),
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      title="CC"
      subtitle="Company card receipts and reconciliation"
      actions={
        <div className="cc cc-actions">
          {gm && (
            <button onClick={() => setMappings(true)}>
              <Users size={16} />
              Card mapping
            </button>
          )}
          <button onClick={() => setCreate(true)}>
            <Plus size={16} />
            New receipt
          </button>
        </div>
      }
    >
      <div className="cc">
        {gm && intake.length > 0 && (
          <details className="cc-notice">
            <summary>
              {intake.length} incoming email{intake.length > 1 ? "s" : ""} need
              review
            </summary>
            {intake.map((item) => (
              <div key={item._id} className="cc-actions">
                <span>
                  {item.receivedAt
                    ? new Date(item.receivedAt).toLocaleString()
                    : item._id}{" "}
                  · {item.error}
                </span>
                <button
                  disabled={busy}
                  onClick={() => void retryIntake(item._id)}
                >
                  Retry parsing
                </button>
              </div>
            ))}
          </details>
        )}
        {settings?.testMode && (
          <div className="cc-notice">
            Test mode · New charges are limited to Test Job and texts route to
            Quinn.
          </div>
        )}
        {error && !receipt && (
          <p className="cc-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="cc-notice" role="status">
            {notice}
          </p>
        )}
        <Widget
          title="Receipts"
          actions={
            <button
              aria-label="Refresh receipts"
              className="cc-icon-button"
              onClick={refresh}
            >
              <RefreshCw size={16} />
            </button>
          }
        >
          <div className="cc-toolbar">
            <SegmentedControl
              variant="ohr"
              value={tab}
              options={tabs}
              onChange={(t) => {
                setTab(t);
                setPage(0);
              }}
              layoutId="cc-tabs"
              ariaLabel="Receipt status"
            />
            <SearchField
              variant="co"
              value={search}
              onChange={setSearch}
              placeholder="Search charges, employees, jobs…"
            />
          </div>
          {gm && tab === "awaiting" && (
            <div className="cc-batch">
              <label className="cc-check">
                <input
                  type="checkbox"
                  checked={
                    list.items.length > 0 && selected.size === list.items.length
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(list.items.map((r) => r._id))
                        : new Set(),
                    )
                  }
                />
                Select this page
              </label>
              <button
                className="cc-primary"
                disabled={busy || !selected.size || !settings?.sageReady}
                onClick={() => void approveBatch()}
              >
                Approve selected ({selected.size})
              </button>
              {settings && !settings.sageReady && (
                <span className="cc-muted">Sage posting setup pending</span>
              )}
            </div>
          )}
          <div ref={scrollRef} className="cc-table-scroll" aria-busy={loading}>
            <table className="spend-rank-table cc-table">
              <thead>
                <tr>
                  {gm && tab === "awaiting" && <th aria-label="Select" />}
                  <th>Charge / employee</th>
                  <th>Receipt date</th>
                  <th>Allocation</th>
                  <th>Receipt</th>
                  <th>Status</th>
                  <th className="cc-number">Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="cc-empty">
                      Loading receipts…
                    </td>
                  </tr>
                ) : !list.items.length ? (
                  <tr>
                    <td colSpan={7} className="cc-empty">
                      {error
                        ? "Receipts could not be loaded."
                        : query
                          ? "No receipts match your search."
                          : `No ${tab === "past" ? "past receipts" : tab === "awaiting" ? "receipts awaiting approval" : "receipts pending submission"}.`}
                    </td>
                  </tr>
                ) : (
                  <>
                    {virtual.getVirtualItems()[0]?.start > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={7}
                          style={{
                            height: virtual.getVirtualItems()[0].start,
                            padding: 0,
                          }}
                        />
                      </tr>
                    )}
                    {virtual.getVirtualItems().map((v) => {
                      const r = list.items[v.index];
                      return (
                        <tr
                          key={r._id}
                          data-index={v.index}
                          ref={virtual.measureElement}
                        >
                          {gm && tab === "awaiting" && (
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Select ${r.description}`}
                                checked={selected.has(r._id)}
                                onChange={(e) =>
                                  setSelected((old) => {
                                    const next = new Set(old);
                                    if (e.target.checked) next.add(r._id);
                                    else next.delete(r._id);
                                    return next;
                                  })
                                }
                              />
                            </td>
                          )}
                          <td>
                            <button
                              className="cc-link"
                              onClick={() => void open(r._id)}
                            >
                              {r.description}
                            </button>
                            <small>
                              {r.employeeName} · •••• {r.cardLast4}
                              {r.mode === "test" ? " · Test" : ""}
                            </small>
                          </td>
                          <td>{r.receiptDate}</td>
                          <td>
                            {r.allocations.length ? (
                              r.allocations
                                .map((a) => a.name || a.destination)
                                .join(", ")
                            ) : (
                              <span className="cc-muted">Not categorized</span>
                            )}
                          </td>
                          <td>
                            {r.files[0] ? (
                              <>
                                <InlineReceipt receipt={r} />
                                <button
                                  className="cc-link"
                                  onClick={() => void open(r._id)}
                                >
                                  View {r.files.length} file
                                  {r.files.length > 1 ? "s" : ""}
                                </button>
                              </>
                            ) : (
                              <span className="cc-muted">
                                {r.missingReceipt
                                  ? "Missing receipt explained"
                                  : "Not uploaded"}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="cc-status">
                              {!r.ownerUid && r.mode !== "test"
                                ? "Unassigned"
                                : statusLabel(r.state)}
                            </span>
                            <small>
                              {r.invoiceNumber ||
                                (r.dropboxError
                                  ? "Dropbox retry pending"
                                  : r.firstSubmittedAt &&
                                      r.dropboxRevision !==
                                        r.dropboxSyncedRevision
                                    ? "Dropbox pending"
                                    : "")}
                            </small>
                          </td>
                          <td className="cc-number">{money(r.amountCents)}</td>
                        </tr>
                      );
                    })}
                    {!!virtual.getVirtualItems().length && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={7}
                          style={{
                            height: Math.max(
                              0,
                              virtual.getTotalSize() -
                                (virtual.getVirtualItems().at(-1)?.end || 0),
                            ),
                            padding: 0,
                          }}
                        />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
          <div className="cc-pagination">
            <span>
              {list.total} receipts
              {list.total > 0
                ? ` · ${page * 50 + 1}–${Math.min((page + 1) * 50, list.total)}`
                : ""}
            </span>
            <div className="cc-actions">
              <button
                disabled={page === 0 || loading}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                disabled={(page + 1) * 50 >= list.total || loading}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </Widget>
      </div>
      {mappings && <MappingModal onClose={() => setMappings(false)} />}
      {create && (
        <NewReceipt
          onClose={() => setCreate(false)}
          onCreated={(r) => {
            setCreate(false);
            setReceipt(r);
            refresh();
          }}
        />
      )}
      {receipt && (
        <CCModal
          title="Receipt review"
          onClose={() => {
            setReceipt(null);
            setError("");
            refresh();
          }}
        >
          {error && (
            <p className="cc-error" role="alert">
              {error}
            </p>
          )}
          <ReceiptForm
            key={`${receipt._id}-${formVersion}`}
            initial={receipt}
            path={`cc/receipts/${receipt._id}`}
            request={staffRequest}
            loadFile={staffFile}
            onChange={(r) =>
              setReceipt({ ...r, canApprove: receipt.canApprove })
            }
          />
          {gm && ["pending", "awaiting"].includes(receipt.state) && (
            <section className="cc-section">
              <h3>Review</h3>
              <label>
                Reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required for returning or dismissing a charge."
                />
              </label>
              <div className="cc-actions">
                {!receipt.ownerUid && receipt.mode !== "test" && (
                  <button disabled={busy} onClick={() => void action("assign")}>
                    Assign from card mapping
                  </button>
                )}
                {receipt.state === "awaiting" && (
                  <>
                    <button
                      disabled={busy || !reason.trim()}
                      onClick={() => void action("return")}
                    >
                      Return for correction
                    </button>
                    <button
                      className="cc-primary"
                      disabled={
                        busy || !receipt.canApprove || !settings?.sageReady
                      }
                      onClick={() => void action("approve")}
                    >
                      Approve & post to Sage
                    </button>
                  </>
                )}
                <button
                  disabled={busy || !reason.trim() || !receipt.canApprove}
                  onClick={() => void action("dismiss")}
                >
                  Dismiss charge
                </button>
              </div>
              {!settings?.sageReady && (
                <p className="cc-muted">
                  Approval becomes available after Sage posting is verified.
                </p>
              )}
            </section>
          )}
          <section className="cc-section">
            <h3>Audit trail</h3>
            <ol className="cc-audit">
              {receipt.audit
                ?.slice()
                .reverse()
                .map((a, i) => (
                  <li key={i}>
                    <strong>{a.action.replaceAll("-", " ")}</strong>
                    <span>
                      {a.name} · {new Date(a.at).toLocaleString()}
                    </span>
                    <details>
                      <summary>Changes</summary>
                      <pre>
                        {JSON.stringify(
                          { before: a.before, after: a.after },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </li>
                ))}
            </ol>
          </section>
        </CCModal>
      )}
    </Page>
  );
}
function InlineReceipt({ receipt }: { receipt: Receipt }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="cc-link"
        aria-expanded={show}
        onClick={() => setShow(!show)}
      >
        {show ? "Hide image" : "Preview image"}
      </button>
      {show && (
        <FilePreview
          file={receipt.files[0]}
          path={`cc/receipts/${receipt._id}`}
          loadFile={staffFile}
        />
      )}
    </div>
  );
}
function NewReceipt({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: Receipt) => void;
}) {
  const [card, setCard] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      onCreated(
        await staffRequest<Receipt>(
          "cc/receipts",
          json("POST", { cardLast4: card }),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <CCModal title="New receipt" onClose={onClose}>
      <p className="cc-muted">
        Start a receipt before the card notification arrives.
      </p>
      {error && (
        <p role="alert" className="cc-error">
          {error}
        </p>
      )}
      <label>
        Card last four digits
        <input
          inputMode="numeric"
          maxLength={4}
          value={card}
          onChange={(e) => setCard(e.target.value)}
        />
      </label>
      <div className="cc-actions">
        <button
          className="cc-primary"
          disabled={busy || !/^\d{4}$/.test(card)}
          onClick={() => void create()}
        >
          Create receipt
        </button>
      </div>
    </CCModal>
  );
}
