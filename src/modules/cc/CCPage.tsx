import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Plus,
} from "lucide-react";
import Page from "../../shared/components/Page";
import { Widget } from "../../shared/components/Widget/Widget";
import { SearchField } from "../../shared/components/SearchField";
import { SegmentedControl } from "../../shared/components/SegmentedControl";
import { Badge } from "../../shared/components/Badge";
import { SkelText } from "../../shared/components/SkelText";
import {
  MotionList,
  MotionItem,
} from "../../shared/components/MotionList/MotionList";
import { useAuth } from "../../core/auth/AuthProvider";
import { useJobcostNav } from "../jobcost/useJobcostNav";
import { useEdgeScroll } from "./useEdgeScroll";
import { staffRequest, staffFile, watchReceipts } from "./staffApi";
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
  { key: "all", label: "All" },
  { key: "pending", label: "Missing receipt" },
  { key: "awaiting", label: "Needs approval" },
  { key: "past", label: "Complete" },
] as const;
type Tab = (typeof tabs)[number]["key"];
const PAGE_SIZE = 50;
interface Week {
  start: string;
  count: number;
  totalCents: number;
  dismissedCount: number;
  dismissedCents: number;
}
// Monday (YYYY-MM-DD) of a receipt date's Monday-to-Sunday week; mirrors the
// server's weekStart so rows land under the header that carries their total.
function weekStart(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  if (!date || isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const utc = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  });
// "Sep week 5" (the month and ordinal of its Monday) + "Sep 28 – Oct 4".
function weekLabel(start: string) {
  if (!start) return { name: "No date yet", range: "" };
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const endIso = end.toISOString().slice(0, 10);
  const short = { month: "short", day: "numeric" } as const;
  return {
    name: `${utc(start, { month: "short" })} week ${Math.ceil(Number(start.slice(8)) / 7)}`,
    range: `${utc(start, short)} – ${utc(endIso, short)}`,
  };
}
interface Listing {
  items: Receipt[];
  total: number;
  page: number;
  pageSize: number;
}
const emptyCopy: Record<Tab, string> = {
  pending: "All card charges have receipts.",
  awaiting: "Nothing is waiting for approval.",
  past: "No approved or dismissed receipts yet.",
  all: "No receipts yet.",
};

export default function CCPage() {
  const { goToJobcost } = useJobcostNav();
  const { claims, user } = useAuth(),
    gm = ["generalManager", "admin", "executive", "owner", "tech"].includes(
      String(claims.role),
    );
  const [tab, setTab] = useState<Tab>("all"),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const [list, setList] = useState<Listing>({
      items: [],
      total: 0,
      page: 0,
      pageSize: PAGE_SIZE,
    }),
    [loading, setLoading] = useState(true),
    [weeks, setWeeks] = useState<Map<string, Week>>(new Map());
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [toast, setToast] = useState<{ id: number; text: string } | null>(null),
    [version, setVersion] = useState(0);
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [mappings, setMappings] = useState(false),
    [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(false),
    [formVersion, setFormVersion] = useState(0);
  const [settings, setSettings] = useState<CCSettings | null>(null);
  const [intake, setIntake] = useState<
    { _id: string; mode: string; error: string; receivedAt?: string }[]
  >([]);
  const selecting = gm && tab === "awaiting";
  const edge = useEdgeScroll(`${tab}|${page}|${query}|${list.items.length}`);
  // Live updates: a receipt written anywhere (email intake, phone form, another
  // reviewer) bumps this, and the list reloads quietly in place.
  const [live, setLive] = useState(0);
  useEffect(() => watchReceipts(() => setLive((n) => n + 1)), []);
  useEffect(() => {
    if (gm)
      staffRequest<typeof intake>("cc/intake-errors")
        .then(setIntake)
        .catch(() => {});
  }, [gm, version, live]);
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
  // Brief confirmation pill, bottom center; re-keyed so a repeat restarts it.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string) => {
    setToast({ id: Date.now(), text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
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
    Promise.all([
      staffRequest<Listing>(
        `cc/receipts?state=${tab}&page=${page}&search=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      ),
      // Totals are extra: if they fail, the list still loads without them.
      staffRequest<Week[]>(
        `cc/receipts/weeks?state=${tab}&search=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      ).catch(() => [] as Week[]),
    ])
      .then(([next, w]) => {
        setList(next);
        setWeeks(new Map(w.map((x) => [x.start, x])));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, page, query, version]);
  // Quiet reload on live updates: no skeleton, selection kept where possible.
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    Promise.all([
      staffRequest<Listing>(
        `cc/receipts?state=${tab}&page=${page}&search=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      ),
      // Totals are extra: if they fail, the list still loads without them.
      staffRequest<Week[]>(
        `cc/receipts/weeks?state=${tab}&search=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      ).catch(() => [] as Week[]),
    ])
      .then(([next, w]) => {
        setList(next);
        setWeeks(new Map(w.map((x) => [x.start, x])));
        setSelected(
          (old) =>
            new Set(next.items.filter((r) => old.has(r._id)).map((r) => r._id)),
        );
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  async function open(id: string) {
    setError("");
    try {
      setReceipt(await staffRequest<Receipt>(`cc/receipts/${id}`));
      setFormVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function action(action: string, reason = "") {
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

  // Past and All mix states, so their rows say which.
  const showStatus = tab === "past" || tab === "all";
  // Week headers span every column but Amount, which carries the total.
  const columns = (selecting ? 1 : 0) + 6 + (showStatus ? 1 : 0);
  const allSelected =
    list.items.length > 0 && selected.size === list.items.length;
  const firstRow = page * PAGE_SIZE + 1,
    lastRow = Math.min((page + 1) * PAGE_SIZE, list.total);

  return (
    <Page
      title="Card Receipts"
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
                  disabled={busy || !selected.size}
                  onClick={() =>
                    settings && !settings.sageReady
                      ? setError(
                          "Receipts can't be approved until Sage posting is turned on.",
                        )
                      : void approveBatch()
                  }
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
              <div ref={edge.frameRef} className={edge.frameClass}>
                <div
                  ref={edge.scrollRef}
                  className="co-table-scroll cc-table-scroll"
                  onScroll={edge.onScroll}
                >
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
                        <th style={{ width: "30%" }}>Charge</th>
                        {showStatus && <th>Status</th>}
                        <th>Charged to</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th>Receipt</th>
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
                              {showStatus && (
                                <td className="body-text">
                                  <SkelText ch={8} />
                                </td>
                              )}
                              <td className="body-text">
                                <SkelText ch={14 - (i % 2) * 4} />
                              </td>
                              <td className="body-text">
                                <SkelText ch={8} />
                              </td>
                              <td className="subheadline">
                                <SkelText ch={10} />
                              </td>
                              <td className="body-text">
                                <SkelText ch={6} />
                              </td>
                              <td className="spend-rank-table-value body-text">
                                <SkelText ch={8} />
                              </td>
                            </tr>
                          ))
                        : list.items.map((r, i) => {
                            const wk = weekStart(r.receiptDate);
                            const first =
                              i === 0 ||
                              weekStart(list.items[i - 1].receiptDate) !== wk;
                            return (
                              <Fragment key={r._id}>
                                {first && (
                                  <WeekRow
                                    start={wk}
                                    week={weeks.get(wk)}
                                    span={columns - 1}
                                  />
                                )}
                                <ReceiptRow
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
                                  onOpenJob={(recnum) => goToJobcost(recnum)}
                                />
                              </Fragment>
                            );
                          })}
                    </tbody>
                  </table>
                </div>
                {edge.affordances}
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

      {toast && (
        <div key={toast.id} className="cc-toast callout" role="status">
          <CheckCircle2 size={14} aria-hidden="true" />
          <span>{toast.text}</span>
        </div>
      )}
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
            alert={
              gm &&
              receipt.employeeId == null &&
              receipt.mode !== "test" &&
              !["approved", "dismissed"].includes(receipt.state) && (
                <Banner tone="amber">
                  <span className="cc-banner-row">
                    <span>
                      <strong>Unassigned.</strong> Nobody is mapped to card ••••{" "}
                      {receipt.cardLast4}.
                    </span>
                    <button
                      className="cc-btn"
                      disabled={busy}
                      onClick={() => void action("assign")}
                    >
                      Assign from card mapping
                    </button>
                  </span>
                </Banner>
              )
            }
            onOpenJob={(recnum) => goToJobcost(recnum)}
            onDelete={
              gm ||
              (receipt.manual &&
                !receipt.charges.length &&
                receipt.ownerUid === user?.uid)
                ? async () => {
                    await staffRequest(
                      `cc/receipts/${receipt._id}/actions`,
                      json("POST", {
                        revision: receipt.revision,
                        action: "delete",
                      }),
                    );
                    setReceipt(null);
                    showToast("Receipt deleted");
                    refresh();
                  }
                : undefined
            }
            onDismiss={
              gm && receipt.canApprove
                ? (why) => action("dismiss", why)
                : undefined
            }
            verdict={
              gm && (
                <ReviewBar
                  busy={busy}
                  error={error}
                  canApprove={!!receipt.canApprove}
                  sageReady={!!settings?.sageReady}
                  onAction={action}
                />
              )
            }
          />
          {!!receipt.audit?.length && <Activity audit={receipt.audit} />}
        </CCModal>
      )}
    </Page>
  );
}

// A week's header row: name and dates on the left, its total under Amount.
// Totals come from the server, so they cover the whole week across pages.
function WeekRow({
  start,
  week,
  span,
}: {
  start: string;
  week: Week | undefined;
  span: number;
}) {
  const { name, range } = weekLabel(start);
  return (
    <tr className="cc-week-row">
      <td colSpan={span}>
        <span className="cc-week-name">{name}</span>
        {range && <span className="cc-week-range">{range}</span>}
        {week && (
          <span className="cc-week-meta">
            {week.count} {week.count === 1 ? "receipt" : "receipts"}
            {week.dismissedCount > 0 &&
              ` · ${week.dismissedCount} dismissed (${money(week.dismissedCents)}, not in total)`}
          </span>
        )}
      </td>
      <td className="spend-rank-table-value cc-week-total">
        {week ? money(week.totalCents) : ""}
      </td>
    </tr>
  );
}

function ReceiptRow({
  r,
  tab,
  selecting,
  selected,
  onSelect,
  onOpen,
  onOpenJob,
}: {
  r: Receipt;
  tab: Tab;
  selecting: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
  onOpenJob: (recnum: string) => void;
}) {
  const showStatus = tab === "past" || tab === "all";
  const unassigned = r.employeeId == null && r.mode !== "test";
  // Cost type per job line, "Overhead" for GL lines; each named once.
  const categories = [
    ...new Set(
      r.allocations
        .map((a) => (a.kind === "overhead" ? "Overhead" : a.costTypeName))
        .filter(Boolean),
    ),
  ].join(", ");
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
      {showStatus && (
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
      <td className="body-text">
        {r.allocations.length ? (
          // Each job opens its Job Costing page; overhead accounts have none.
          <span className="cc-cell-alloc" style={{ display: "block" }}>
            {r.allocations.map((a, i) => (
              <span key={`${a.destination}-${i}`}>
                {i > 0 && ", "}
                {a.kind === "job" ? (
                  <span
                    className="cc-job-link"
                    role="link"
                    tabIndex={0}
                    title="Open job costing"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenJob(a.destination);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        onOpenJob(a.destination);
                      }
                    }}
                  >
                    {a.name || a.destination}
                  </span>
                ) : (
                  a.name || a.destination
                )}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-secondary">Not categorized</span>
        )}
      </td>
      <td className="body-text">
        {categories && (
          <span className="cc-cell-alloc" style={{ display: "block" }}>
            {categories}
          </span>
        )}
      </td>
      <td
        className="subheadline text-secondary"
        style={{ whiteSpace: "nowrap" }}
      >
        {day(r.receiptDate)}
      </td>
      <td className="body-text">
        <div className="cc-cell-stack">
          {r.files.length ? (
            <span>
              <Badge tone="green" size="compact">
                {r.files.length === 1 ? "Attached" : `${r.files.length} files`}
              </Badge>
            </span>
          ) : r.missingReceipt ? (
            <span>
              <Badge tone="gray" size="compact">
                Explained
              </Badge>
            </span>
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
      <p
        className="body-text text-secondary"
        style={{ margin: 0, lineHeight: 1.5 }}
      >
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

// The GM's verdict, in the receipt's sticky bar. Return and Dismiss need a
// reason, so they swap the bar for one field instead of keeping it on screen.
function ReviewBar({
  busy,
  error,
  canApprove,
  sageReady,
  onAction,
}: {
  busy: boolean;
  error: string;
  canApprove: boolean;
  sageReady: boolean;
  onAction: (action: string, reason?: string) => Promise<void>;
}) {
  const [asking, setAsking] = useState<"return" | "dismiss" | null>(null),
    [reason, setReason] = useState("");
  if (asking)
    return (
      <div className="cc-verdict-ask">
        <input
          className="cc-input"
          autoFocus
          value={reason}
          placeholder={
            asking === "return" ? "What needs fixing?" : "Why dismiss it?"
          }
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && reason.trim())
              void onAction(asking, reason);
            if (e.key === "Escape") {
              e.stopPropagation();
              setAsking(null);
            }
          }}
        />
        <button className="cc-btn" onClick={() => setAsking(null)}>
          Cancel
        </button>
        <button
          className={`cc-btn ${asking === "return" ? "cc-btn--primary" : "cc-btn--danger"}`}
          disabled={busy || !reason.trim()}
          onClick={() => void onAction(asking, reason)}
        >
          {asking === "return" ? "Send back" : "Dismiss"}
        </button>
      </div>
    );
  return (
    <>
      <span className="cc-actionbar-note">
        {error ? (
          <span className="cc-error-text">{error}</span>
        ) : !sageReady ? (
          "Sage posting is not enabled yet."
        ) : !canApprove ? (
          "Not ready to approve."
        ) : (
          ""
        )}
      </span>
      {canApprove && (
        <button
          className="cc-btn cc-btn--quiet cc-btn--danger"
          disabled={busy}
          onClick={() => setAsking("dismiss")}
        >
          Dismiss
        </button>
      )}
      <button
        className="cc-btn"
        disabled={busy}
        onClick={() => setAsking("return")}
      >
        Return for correction
      </button>
      <button
        className="cc-btn cc-btn--primary"
        disabled={busy || !canApprove || !sageReady}
        onClick={() => void onAction("approve")}
      >
        Approve and post
      </button>
    </>
  );
}

// Latest event up front; the full trail (and its raw diffs) on request.
function Activity({ audit }: { audit: NonNullable<Receipt["audit"]> }) {
  const events = audit.slice().reverse();
  const when = (at: string) =>
    new Date(at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const what = (action: string) => {
    const text = action.replaceAll("-", " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  return (
    <details className="cc-disclosure cc-activity">
      <summary>
        <span>
          {what(events[0].action)} by {events[0].name} · {when(events[0].at)}
        </span>
        {events.length > 1 && (
          <span className="cc-activity-more">
            Show all {events.length} events
          </span>
        )}
      </summary>
      <ol className="cc-trail">
        {events.map((a, i) => (
          <li key={i} className="cc-trail-item">
            <span className="cc-trail-dot" aria-hidden="true" />
            <span className="cc-trail-action">{what(a.action)}</span>
            <span className="cc-trail-meta">
              {a.name} · {when(a.at)}
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
    </details>
  );
}
