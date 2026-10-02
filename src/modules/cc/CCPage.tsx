import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Paperclip, Plus } from "lucide-react";
import Page from "../../shared/components/Page";
import { Widget } from "../../shared/components/Widget/Widget";
import { SearchField } from "../../shared/components/SearchField";
import { SegmentedControl } from "../../shared/components/SegmentedControl";
import { Badge } from "../../shared/components/Badge";
import { SkelText } from "../../shared/components/SkelText";
import { MotionList, MotionItem } from "../../shared/components/MotionList/MotionList";
import { useAuth } from "../../core/auth/AuthProvider";
import { staffRequest, staffFile } from "./staffApi";
import { json } from "./api";
import { CCModal } from "./CCModal";
import { MappingModal } from "./MappingModal";
import ReceiptForm, { Banner } from "./ReceiptForm";
import {
  day,
  money,
  statusLabel,
  statusTone,
  type Receipt,
  type CCSettings,
} from "./types";
import "./cc.css";

// Receipts list in the directory pages' language: one co-widget card whose
// toolbar carries the status tabs, search and count, over a spend-rank-table
// whose rows open the receipt. The review modal leads with the receipt's own
// head band (DetailModal voice) and adds the GM Review + Activity bands.

const tabs = [
  { key: "pending", label: "Pending" },
  { key: "awaiting", label: "Awaiting approval" },
  { key: "past", label: "Past" },
] as const;
type Tab = (typeof tabs)[number]["key"];
const PAGE_SIZE = 50;
interface Listing {
  items: Receipt[];
  total: number;
  page: number;
  pageSize: number;
}
const emptyCopy: Record<Tab, string> = {
  pending: "Nothing is waiting on a receipt.",
  awaiting: "Nothing is waiting for approval.",
  past: "No approved or dismissed receipts yet.",
};

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
      pageSize: PAGE_SIZE,
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
  const selecting = gm && tab === "awaiting";
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
      const failed = result.results.filter((r) => !r.ok);
      setNotice(
        `${result.results.length - failed.length} approved.${failed.length ? ` ${failed.length} need attention.` : ""}`,
      );
      setError([...new Set(failed.map((r) => r.message))].join(" "));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const closeReceipt = useCallback(() => {
    setReceipt(null);
    setError("");
    refresh();
  }, [refresh]);

  const allSelected =
    list.items.length > 0 && selected.size === list.items.length;
  const firstRow = page * PAGE_SIZE + 1,
    lastRow = Math.min((page + 1) * PAGE_SIZE, list.total);

  return (
    <Page
      title="CC"
      subtitle="Company card receipts"
      actions={
        <>
          {gm && (
            <button
              className="button secondary-button"
              onClick={() => setMappings(true)}
            >
              <CreditCard size={15} /> Card mapping
            </button>
          )}
          <button
            className="button primary-button"
            onClick={() => setCreate(true)}
          >
            <Plus size={16} /> New receipt
          </button>
        </>
      }
    >
      <MotionList className="cc-page-stack">
        {(settings?.testMode ||
          (gm && intake.length > 0) ||
          (error && !receipt) ||
          notice) && (
          <MotionItem>
            <div className="cc-notes">
              {settings?.testMode && (
                <Banner>
                  <strong>Test mode.</strong> New charges go to Test Job and
                  texts route to Quinn.
                </Banner>
              )}
              {gm && intake.length > 0 && (
                <Banner tone="amber">
                  <strong>
                    {intake.length} incoming email
                    {intake.length > 1 ? "s" : ""} could not be read.
                  </strong>
                  <ul className="cc-intake-list">
                    {intake.map((item) => (
                      <li key={item._id} className="cc-intake-row">
                        <span>
                          {item.receivedAt
                            ? new Date(item.receivedAt).toLocaleString()
                            : item._id}
                          : {item.error}
                        </span>
                        <button
                          className="button secondary-button"
                          disabled={busy}
                          onClick={() => void retryIntake(item._id)}
                        >
                          Retry
                        </button>
                      </li>
                    ))}
                  </ul>
                </Banner>
              )}
              {error && !receipt && <Banner tone="red">{error}</Banner>}
              {notice && <Banner tone="green">{notice}</Banner>}
            </div>
          </MotionItem>
        )}
        <MotionItem>
          <Widget className="co-widget cc-widget">
            <div className="co-widget-toolbar">
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
                placeholder="Search charges, people, jobs..."
              />
              <span className="co-count subheadline text-secondary">
                {loading ? (
                  <SkelText ch={9} />
                ) : (
                  `${list.total} ${list.total === 1 ? "receipt" : "receipts"}`
                )}
              </span>
              {selecting && (
                <button
                  className="button primary-button"
                  disabled={busy || !selected.size || !settings?.sageReady}
                  title={
                    settings && !settings.sageReady
                      ? "Available once Sage posting is verified"
                      : undefined
                  }
                  onClick={() => void approveBatch()}
                >
                  Approve {selected.size || ""} selected
                </button>
              )}
            </div>

            {!loading && !list.items.length ? (
              <div className="cc-empty body-text text-secondary">
                {error
                  ? "Receipts could not be loaded."
                  : query
                    ? `No receipts match "${query}"`
                    : emptyCopy[tab]}
              </div>
            ) : (
              <div className="co-table-scroll">
                <table className="spend-rank-table">
                  <thead>
                    <tr>
                      {selecting && (
                        <th className="cc-col-check">
                          <input
                            type="checkbox"
                            aria-label="Select all on this page"
                            checked={allSelected}
                            disabled={loading}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? new Set(list.items.map((r) => r._id))
                                  : new Set(),
                              )
                            }
                          />
                        </th>
                      )}
                      <th style={{ width: "34%" }}>Charge</th>
                      <th>Date</th>
                      <th>Charged to</th>
                      <th>Receipt</th>
                      {tab === "past" && <th>Status</th>}
                      <th className="spend-rank-table-value">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 6 }, (_, i) => (
                          <tr key={i} className="spend-rank-table-row-plain">
                            {selecting && <td className="cc-col-check" />}
                            <td>
                              <div className="cc-cell-stack">
                                <span className="body-text emphasized">
                                  <SkelText ch={22 - (i % 3) * 4} />
                                </span>
                                <span className="cell-secondary">
                                  <SkelText ch={16} />
                                </span>
                              </div>
                            </td>
                            <td className="subheadline">
                              <SkelText ch={10} />
                            </td>
                            <td className="body-text">
                              <SkelText ch={14 - (i % 2) * 4} />
                            </td>
                            <td className="body-text">
                              <SkelText ch={6} />
                            </td>
                            {tab === "past" && (
                              <td className="body-text">
                                <SkelText ch={8} />
                              </td>
                            )}
                            <td className="spend-rank-table-value body-text">
                              <SkelText ch={8} />
                            </td>
                          </tr>
                        ))
                      : list.items.map((r) => (
                          <ReceiptRow
                            key={r._id}
                            r={r}
                            tab={tab}
                            selecting={selecting}
                            selected={selected.has(r._id)}
                            onSelect={(on) =>
                              setSelected((old) => {
                                const next = new Set(old);
                                if (on) next.add(r._id);
                                else next.delete(r._id);
                                return next;
                              })
                            }
                            onOpen={() => void open(r._id)}
                          />
                        ))}
                  </tbody>
                </table>
              </div>
            )}

            {list.total > PAGE_SIZE && (
              <div className="cc-pager">
                <span className="subheadline text-secondary">
                  {firstRow}–{lastRow} of {list.total}
                </span>
                <div className="cc-pager-buttons">
                  <button
                    className="button secondary-button"
                    disabled={page === 0 || loading}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <button
                    className="button secondary-button"
                    disabled={lastRow >= list.total || loading}
                    onClick={() => setPage(page + 1)}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </Widget>
        </MotionItem>
      </MotionList>

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
        <CCModal onClose={closeReceipt}>
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
            <section className="cc-band">
              <div className="cc-band-head">
                <h3 className="cc-band-title">Review</h3>
                {settings && !settings.sageReady && (
                  <span className="cc-badge cc-badge--muted">
                    Sage posting not enabled yet
                  </span>
                )}
              </div>
              <label className="cc-field">
                <span className="cc-field-label">Reason</span>
                <textarea
                  className="cc-input"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required to return or dismiss a charge"
                />
              </label>
              {error && <Banner tone="red">{error}</Banner>}
              <div className="cc-review-actions">
                {receipt.employeeId == null && receipt.mode !== "test" && (
                  <button
                    className="cc-btn"
                    disabled={busy}
                    onClick={() => void action("assign")}
                  >
                    Assign from card mapping
                  </button>
                )}
                <button
                  className="cc-btn cc-btn--danger"
                  disabled={busy || !reason.trim() || !receipt.canApprove}
                  onClick={() => void action("dismiss")}
                >
                  Dismiss charge
                </button>
                <span className="cc-spacer" />
                {receipt.state === "awaiting" && (
                  <>
                    <button
                      className="cc-btn"
                      disabled={busy || !reason.trim()}
                      onClick={() => void action("return")}
                    >
                      Return for correction
                    </button>
                    <button
                      className="cc-btn cc-btn--primary"
                      disabled={
                        busy || !receipt.canApprove || !settings?.sageReady
                      }
                      onClick={() => void action("approve")}
                    >
                      Approve and post
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
          {!!receipt.audit?.length && (
            <section className="cc-band">
              <div className="cc-band-head">
                <h3 className="cc-band-title">Activity</h3>
              </div>
              <ol className="cc-trail">
                {receipt.audit
                  .slice()
                  .reverse()
                  .map((a, i) => (
                    <li key={i} className="cc-trail-item">
                      <span className="cc-trail-dot" aria-hidden="true" />
                      <span className="cc-trail-action">
                        {a.action.replaceAll("-", " ")}
                      </span>
                      <span className="cc-trail-meta">
                        {a.name} ·{" "}
                        {new Date(a.at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {(a.before !== undefined || a.after !== undefined) && (
                        <details className="cc-disclosure cc-trail-diff">
                          <summary>Show changes</summary>
                          <pre>
                            {JSON.stringify(
                              { before: a.before, after: a.after },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      )}
                    </li>
                  ))}
              </ol>
            </section>
          )}
        </CCModal>
      )}
    </Page>
  );
}

function ReceiptRow({
  r,
  tab,
  selecting,
  selected,
  onSelect,
  onOpen,
}: {
  r: Receipt;
  tab: Tab;
  selecting: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
}) {
  const unassigned = r.employeeId == null && r.mode !== "test";
  const syncNote = r.dropboxError
    ? "Dropbox retry pending"
    : r.firstSubmittedAt && r.dropboxRevision !== r.dropboxSyncedRevision
      ? "Dropbox sync pending"
      : "";
  return (
    <tr
      className="spend-rank-table-row"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      {selecting && (
        <td className="cc-col-check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select ${r.description}`}
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
          />
        </td>
      )}
      <td>
        <div className="cc-cell-stack">
          <span className="body-text emphasized cc-cell-primary">
            {r.description}
          </span>
          <span className="cell-secondary">
            {unassigned ? (
              <Badge tone="red" size="compact">
                Unassigned
              </Badge>
            ) : (
              r.employeeName
            )}{" "}
            · •••• {r.cardLast4}
            {r.mode === "test" ? " · Test" : ""}
          </span>
        </div>
      </td>
      <td className="subheadline text-secondary" style={{ whiteSpace: "nowrap" }}>
        {day(r.receiptDate)}
      </td>
      <td className="body-text">
        {r.allocations.length ? (
          <span className="cc-cell-alloc" style={{ display: "block" }}>
            {r.allocations.map((a) => a.name || a.destination).join(", ")}
          </span>
        ) : (
          <span className="text-secondary">Not categorized</span>
        )}
      </td>
      <td className="body-text">
        <div className="cc-cell-stack">
          {r.files.length ? (
            <span className="cc-cell-icon">
              <Paperclip size={13} />
              {r.files.length} {r.files.length === 1 ? "file" : "files"}
            </span>
          ) : r.missingReceipt ? (
            <span className="text-secondary">Explained</span>
          ) : (
            <span>
              <Badge tone="amber" size="compact">
                Missing
              </Badge>
            </span>
          )}
          {syncNote && <span className="cell-secondary">{syncNote}</span>}
        </div>
      </td>
      {tab === "past" && (
        <td>
          <div className="cc-cell-stack">
            <span>
              <Badge tone={statusTone(r.state)}>{statusLabel(r.state)}</Badge>
            </span>
            {r.invoiceNumber && (
              <span className="cell-secondary">#{r.invoiceNumber}</span>
            )}
          </div>
        </td>
      )}
      <td className="spend-rank-table-value body-text emphasized">
        {money(r.amountCents)}
      </td>
    </tr>
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
    setError("");
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
  const valid = /^\d{4}$/.test(card);
  return (
    <CCModal
      eyebrow="Company card"
      title="New receipt"
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
            onClick={() => void create()}
          >
            {busy ? "Creating…" : "Create receipt"}
          </button>
        </>
      }
    >
      <p className="body-text text-secondary" style={{ margin: 0, lineHeight: 1.5 }}>
        Start a receipt before the card notification arrives.
      </p>
      <label className="cc-field">
        <span className="cc-field-label">Card last four digits</span>
        <input
          className="cc-input cc-input--money"
          inputMode="numeric"
          autoFocus
          maxLength={4}
          placeholder="1234"
          value={card}
          onChange={(e) => setCard(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && valid && void create()}
        />
      </label>
      {error && <Banner tone="red">{error}</Banner>}
    </CCModal>
  );
}
