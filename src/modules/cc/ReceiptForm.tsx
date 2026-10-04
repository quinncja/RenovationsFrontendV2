import {
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  FileUp,
  Info,
  Pencil,
  Plus,
  Trash2,
  Smartphone,
  Tag,
  X,
  ZoomIn,
  ZoomOut,
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
import { Picker, type PickerItem } from "./Picker";
import "./cc.css";

// Shared by the dashboard review modal and the isolated /r/:token page, so it
// draws only `cc-*` classes (cc.css), never App.css ones. Layout, top to
// bottom: head band (merchant, who/when, amount + status), state banners,
// then Details, Receipt, Charged to bands, and a sticky verdict bar.

type Draft = Omit<Allocation, "amountCents"> & { amount: string };

export function Banner({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: "neutral" | "amber" | "red" | "green";
  /** Overrides the tone's default icon. */
  icon?: typeof Info;
  children: ReactNode;
}) {
  const Icon =
    icon ??
    (tone === "green"
      ? CheckCircle2
      : tone === "neutral"
        ? Info
        : AlertTriangle);
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
  onOpen,
}: {
  file: ReceiptFile;
  path: string;
  loadFile?: (path: string) => Promise<string>;
  /** Opens the file in the in-app viewer (never a new window). */
  onOpen: (file: ReceiptFile, url: string) => void;
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
  const isImage = file.mime.startsWith("image/") && file.mime !== "image/heic";
  const image = url && isImage;
  return (
    // A link, not a button: the form's read-only <fieldset disabled> would
    // otherwise disable it, and a receipt must stay viewable after submit.
    <a
      className="cc-file"
      href={url || undefined}
      title={error || `View ${file.name}`}
      onClick={(e) => {
        e.preventDefault();
        if (url) onOpen(file, url);
      }}
    >
      <span className="cc-file-thumb">
        {image ? (
          <img src={url} alt={file.name} loading="lazy" />
        ) : (
          <FileText size={26} aria-hidden="true" />
        )}
      </span>
      {(error || !isImage) && (
        <span className="cc-file-name">{error || file.name}</span>
      )}
    </a>
  );
}

// Full-screen in-app viewer for a receipt file: images open fitted to the
// screen and zoom (wheel, pinch, double-click, or the bar's buttons), PDFs
// render inline, anything the browser can't draw (HEIC outside Safari) gets
// a plain "open" link. Escape closes it without closing the receipt modal.
const MIN_ZOOM = 1,
  MAX_ZOOM = 8;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function FileViewer({
  file,
  url,
  onClose,
  nav,
}: {
  file: ReceiptFile;
  url: string;
  onClose: () => void;
  /** Several files on the receipt: arrows, a counter and a thumbnail strip. */
  nav?: {
    index: number;
    count: number;
    onPrev: () => void;
    onNext: () => void;
    strip: ReactNode;
  };
}) {
  // view.x/y pan the image (px from centered); view.z = 1 is "fit".
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; z: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (nav && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.stopPropagation();
        e.preventDefault();
        if (e.key === "ArrowLeft") nav.onPrev();
        else nav.onNext();
        return;
      }
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    // Capture phase: runs before the modal's own window-level Escape handler.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, nav]);
  const kind =
    file.mime === "application/pdf"
      ? "pdf"
      : file.mime.startsWith("image/")
        ? "image"
        : "other";

  // Zoom to `next`, keeping the stage point (cx, cy) under the cursor/fingers.
  const zoomAt = (next: number, cx = 0, cy = 0) =>
    setView((v) => {
      const z = clampZoom(next);
      if (z === 1) return { z, x: 0, y: 0 };
      const k = z / v.z;
      return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  const fromCenter = (clientX: number, clientY: number) => {
    const box = stageRef.current!.getBoundingClientRect();
    return {
      cx: clientX - box.left - box.width / 2,
      cy: clientY - box.top - box.height / 2,
    };
  };
  // Wheel needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || kind !== "image") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { cx, cy } = fromCenter(e.clientX, e.clientY);
      setView((v) => {
        const z = clampZoom(v.z * Math.exp(-e.deltaY * 0.001));
        if (z === 1) return { z, x: 0, y: 0 };
        const k = z / v.z;
        return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [kind]);

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2)
      pinch.current = { dist: spread(), z: view.z };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const { cx, cy } = fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt((pinch.current.z * spread()) / pinch.current.dist, cx, cy);
    } else if (pointers.current.size === 1 && view.z > 1) {
      const dx = e.clientX - last.x,
        dy = e.clientY - last.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  return createPortal(
    <div
      className="cc-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
    >
      <div className="cc-viewer-bar">
        <span className="cc-viewer-name">{file.name}</span>
        {nav && (
          <span className="cc-viewer-count">
            {nav.index + 1} of {nav.count}
          </span>
        )}
        {kind === "image" && (
          <div className="cc-viewer-zoom">
            <button
              type="button"
              className="cc-viewer-btn"
              aria-label="Zoom out"
              disabled={view.z <= MIN_ZOOM}
              onClick={() => zoomAt(view.z / 1.5)}
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              className="cc-viewer-pct"
              title="Fit to screen"
              onClick={() => zoomAt(1)}
            >
              {Math.round(view.z * 100)}%
            </button>
            <button
              type="button"
              className="cc-viewer-btn"
              aria-label="Zoom in"
              disabled={view.z >= MAX_ZOOM}
              onClick={() => zoomAt(view.z * 1.5)}
            >
              <ZoomIn size={16} />
            </button>
          </div>
        )}
        <a
          className="cc-viewer-btn"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in a new tab"
          title="Open in a new tab"
        >
          <ExternalLink size={16} />
        </a>
        <button
          type="button"
          className="cc-viewer-btn"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div
        ref={stageRef}
        className="cc-viewer-stage"
        onClick={(e) => {
          // A tap on the dark surround closes; the file itself doesn't.
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {kind === "pdf" ? (
          <iframe className="cc-viewer-pdf" src={url} title={file.name} />
        ) : kind === "image" ? (
          <img
            className={`cc-viewer-img${view.z > 1 ? " cc-viewer-img--zoomed" : ""}`}
            src={url}
            alt={file.name}
            draggable={false}
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={(e) => {
              const { cx, cy } = fromCenter(e.clientX, e.clientY);
              zoomAt(view.z > 1 ? 1 : 2.5, cx, cy);
            }}
          />
        ) : (
          <p className="cc-viewer-note">
            This file type can't be previewed here.{" "}
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open it
            </a>
          </p>
        )}
        {nav && (
          <>
            <button
              type="button"
              className="cc-viewer-nav cc-viewer-nav--prev"
              aria-label="Previous file"
              onClick={nav.onPrev}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              className="cc-viewer-nav cc-viewer-nav--next"
              aria-label="Next file"
              onClick={nav.onNext}
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>
      {nav?.strip}
    </div>,
    document.body,
  );
}

// The viewer over every file on a receipt: opens on the file that was tapped,
// steps with the arrows (or arrow keys, wrapping around) and the thumbnail
// strip. Files load as they come into view (the neighbors are fetched ahead);
// staff copies are blob URLs, revoked when the gallery closes.
export function FileGallery({
  files,
  startId,
  startUrl,
  path,
  loadFile,
  onClose,
}: {
  files: ReceiptFile[];
  startId: string;
  /** The tapped thumbnail's already-loaded URL (owned by its preview). */
  startUrl?: string;
  path: string;
  loadFile?: (path: string) => Promise<string>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      files.findIndex((f) => f.id === startId),
    ),
  );
  const [urls, setUrls] = useState<Record<string, string>>(() =>
    startUrl ? { [startId]: startUrl } : {},
  );
  const made = useRef<string[]>([]);
  const asked = useRef(new Set<string>(startUrl ? [startId] : []));
  useEffect(() => {
    const want = [index, index + 1, index - 1 + files.length].map(
      (i) => files[i % files.length],
    );
    for (const f of want) {
      if (!f || asked.current.has(f.id)) continue;
      asked.current.add(f.id);
      if (!loadFile) {
        setUrls((u) => ({ ...u, [f.id]: `${base}/${path}/files/${f.id}` }));
        continue;
      }
      loadFile(`${path}/files/${f.id}`)
        .then((value) => {
          made.current.push(value);
          setUrls((u) => ({ ...u, [f.id]: value }));
        })
        .catch(() => asked.current.delete(f.id));
    }
  }, [index, files, path, loadFile]);
  useEffect(
    () => () => made.current.forEach((u) => URL.revokeObjectURL(u)),
    [],
  );
  const file = files[index];
  const url = urls[file.id];
  const many = files.length > 1;
  const step = (d: number) =>
    setIndex((i) => (i + d + files.length) % files.length);
  const nav = many
    ? {
        index,
        count: files.length,
        onPrev: () => step(-1),
        onNext: () => step(1),
        strip: (
          <div className="cc-viewer-strip" role="tablist" aria-label="Files">
            {files.map((f, i) => {
              const image =
                f.mime.startsWith("image/") && f.mime !== "image/heic";
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={f.name}
                  className={`cc-viewer-thumb${i === index ? " cc-viewer-thumb--on" : ""}`}
                  onClick={() => setIndex(i)}
                >
                  {image && urls[f.id] ? (
                    <img src={urls[f.id]} alt="" draggable={false} />
                  ) : (
                    <FileText size={18} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        ),
      }
    : undefined;
  if (!url)
    return createPortal(
      <div
        className="cc-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={file.name}
      >
        <div className="cc-viewer-stage">
          <p className="cc-viewer-note">Loading {file.name}…</p>
        </div>
      </div>,
      document.body,
    );
  // key: a new file starts at "fit", not the last file's zoom.
  return (
    <FileViewer
      key={file.id}
      file={file}
      url={url}
      onClose={onClose}
      nav={nav}
    />
  );
}

export default function ReceiptForm({
  initial,
  path,
  request,
  onChange,
  onSubmitted,
  loadFile,
  alert,
  verdict,
  onDismiss,
  onDelete,
  onOpenJob,
  cardholder,
}: {
  /** Set when a reviewer opens someone else's pending receipt: the form says
   *  it is that cardholder's to fill out and opens view-only, with a "Fill out
   *  on their behalf" override. Holds the cardholder's name. */
  cardholder?: string;
  initial: Receipt;
  path: string;
  request: Request;
  onChange: (receipt: Receipt) => void;
  /** Called after a successful submit (the link portal swaps to its done screen). */
  onSubmitted?: (receipt: Receipt) => void;
  loadFile?: (path: string) => Promise<string>;
  /** Extra note for the notes stack (the GM's unassigned-card prompt). */
  alert?: ReactNode;
  /** Replaces Submit in the sticky bar while the receipt awaits approval. */
  verdict?: ReactNode;
  /** Dashboard only: soft-deletes the receipt (asks first). */
  onDelete?: () => Promise<void>;
  /** Dashboard only: opens a job line's Job Cost page. */
  onOpenJob?: (recnum: string) => void;
  /** Dismiss outright (GM) instead of asking a GM to dismiss. */
  onDismiss?: (reason: string) => Promise<void>;
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
  // Description and total ride the head band; their fields open on request.
  // A receipt started by hand has no card alert behind it, so they lead.
  const [editing, setEditing] = useState(initial.manual);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewing, setViewing] = useState<{
    file: ReceiptFile;
    url: string;
  } | null>(null);
  // Flips on the first Submit; from then on an incomplete section is marked
  // red until it's filled in (checked live, so the red clears as they fix it).
  const [attempted, setAttempted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const receiptRef = useRef<HTMLElement>(null),
    codingRef = useRef<HTMLElement>(null);
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await onDelete!();
    } catch (e) {
      setError((e as Error).message);
      setConfirmDelete(false);
      setBusy(false);
    }
  }
  const touch =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(pointer: coarse)").matches;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null),
    cameraRef = useRef<HTMLInputElement>(null);
  // A GM reviewing a submitted receipt reads it; fixes go back via Return.
  const reviewing = !!verdict && r.state === "awaiting";
  const [onBehalf, setOnBehalf] = useState(false);
  const theirs = !!cardholder && r.state === "pending";
  const cardholderFirst = cardholder?.split(" ")[0] || "the cardholder";
  const readonly =
    reviewing ||
    (theirs && !onBehalf) ||
    ["approved", "posting", "dismissed"].includes(r.state);
  useEffect(() => {
    let alive = true;
    request<Options>(`${path}/options`)
      .then((value) => {
        if (!alive) return;
        setOpts(value);
        // A fresh form starts on the cardholder's last job and cost type.
        const last = value.last;
        if (last && !initial.allocations.length)
          setDraft((d) =>
            d.length === 1 && d[0].kind === "job" && !d[0].costType
              ? [
                  {
                    ...d[0],
                    destination:
                      initial.mode === "test"
                        ? d[0].destination
                        : last.destination,
                    costType: value.costTypes.some(
                      (t) => t.id === last.costType,
                    )
                      ? last.costType
                      : "",
                  },
                ]
              : d,
          );
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
  // One way out of the form: submit. Incomplete sections are flagged here
  // first; the server repeats every check.
  async function submit() {
    setAttempted(true);
    setNotice("");
    const first = receiptProblem
      ? receiptRef
      : codingProblem
        ? codingRef
        : null;
    if (first) {
      first.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await request<Receipt>(
        path,
        json("PATCH", {
          revision: r.revision,
          amount,
          description,
          receiptDate: date,
          allocations: effective,
          missingReceipt: missing,
          combinedConfirmed: confirmed,
          submit: true,
        }),
      );
      update(next);
      if (onSubmitted) return onSubmitted(next);
      setNotice(
        "Receipt submitted. You can make corrections until it is approved.",
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
      setNotice("Files added. Submit once it's charged to a job or account.");
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
  // Picker rows: the name leads, the number is reference. Test receipts list
  // Test Job in its own group above the user's jobs and everything else.
  const jobs = opts?.jobs || [];
  const hasGroups = jobs.some((j) => j.test || j.own);
  const jobItems: PickerItem[] = [
    ...jobs.filter((j) => j.test).map((j) => ({ ...j, group: "Test" })),
    ...jobs
      .filter((j) => j.own && !j.test)
      .map((j) => ({ ...j, group: "Your jobs" })),
    ...jobs
      .filter((j) => !j.own && !j.test)
      .map((j) => ({ ...j, group: hasGroups ? "All other jobs" : undefined })),
  ].map((j) => ({
    id: j.id,
    name: j.name,
    group: j.group,
    meta: `Job ${j.id}${j.status !== undefined && j.status !== 4 && !j.test ? " · not current" : ""}`,
  }));
  const accountItems: PickerItem[] = (opts?.accounts || []).map((o) => ({
    id: o.id,
    name: o.name,
    meta: `Account ${o.id}`,
  }));
  const costTypeItems: PickerItem[] = (opts?.costTypes || []).map((o) => ({
    id: o.id,
    name: o.name,
  }));
  const split = draft.length > 1;
  // A lone allocation has no amount field: it always carries the full total.
  const effective = split ? draft : draft.map((a) => ({ ...a, amount }));
  const allocated = effective.reduce(
    (sum, a) => sum + Math.round(Number(a.amount || 0) * 100),
    0,
  );
  const remaining = Math.round(Number(amount || 0) * 100) - allocated;
  const receiptProblem =
    !r.files.length && !missing.trim()
      ? "Add a photo, or explain why there isn't one."
      : "";
  const codingProblem = effective.some(
    (a) => !a.destination || (a.kind === "job" && !a.costType),
  )
    ? "Categorize this charge before submitting."
    : remaining !== 0
      ? "The splits must add up to the receipt total."
      : "";
  const invalid = (problem: string) =>
    attempted && problem ? " cc-band--invalid" : "";
  // Editing, the two jobs read as numbered cards that tick off when done.
  const step = (done: boolean) =>
    readonly ? "" : ` cc-step${done ? " cc-step--done" : ""}`;
  const stepMark = (n: number, done: boolean) =>
    !readonly && (
      <span className="cc-step-mark" aria-hidden="true">
        {done ? <Check size={13} strokeWidth={3} /> : n}
      </span>
    );
  const label = (
    list: { id: string; name: string }[] | undefined,
    id: string,
  ) => list?.find((o) => o.id === id)?.name || id;
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
              {r.invoiceNumber ? ` · #${r.invoiceNumber}` : ""}
            </p>
          </div>
          <div className="cc-figure-block">
            <p className="cc-figure">{money(r.amountCents)}</p>
            <span className={`cc-badge cc-badge--${statusTone(r.state)}`}>
              {theirs ? `Waiting on ${cardholderFirst}` : statusLabel(r.state)}
            </span>
          </div>
        </div>
        {!readonly && !editing && (
          <button
            type="button"
            className="cc-btn cc-btn--quiet cc-head-edit"
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} aria-hidden="true" />
            Edit description or total
          </button>
        )}
      </header>

      {(r.correctionReason ||
        r.dismissalRequested ||
        alert ||
        theirs ||
        !!r.matchCandidates?.length) && (
        <div className="cc-notes">
          {/* One quiet line: the badge above already says who it waits on. */}
          {theirs && (
            <Banner icon={Smartphone}>
              <span className="cc-banner-row">
                <span>
                  {onBehalf
                    ? `You're filling this out for ${cardholderFirst}.`
                    : `${cardholderFirst} fills this out from their phone.`}
                </span>
                {!onBehalf && (
                  <button
                    type="button"
                    className="cc-btn"
                    onClick={() => setOnBehalf(true)}
                  >
                    Fill out instead
                  </button>
                )}
              </span>
            </Banner>
          )}
          {r.correctionReason && !readonly && (
            <Banner tone="amber">
              <strong>Correction requested.</strong> {r.correctionReason}
            </Banner>
          )}
          {r.dismissalRequested && (
            <Banner tone="amber">
              <strong>Dismissal requested.</strong> {r.dismissalRequested}
            </Banner>
          )}
          {alert}
          {!!r.matchCandidates?.length && (
            <Banner tone="amber">
              This may duplicate a receipt you already started. Resolve it below
              before submitting.
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

        {editing && !readonly && (
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
          </section>
        )}

        {r.charges.length > 1 && (
          <section className="cc-band">
            <div className="cc-band-head">
              <h3 className="cc-band-title">{r.charges.length} card charges</h3>
            </div>
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
              {!readonly && (
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
              )}
            </div>
          </section>
        )}

        {r.amountCents < 0 && !r.originalReceiptId && !readonly && (
          <section className="cc-band">
            <div className="cc-band-head">
              <h3 className="cc-band-title">Original purchase</h3>
            </div>
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
          </section>
        )}

        <section
          ref={receiptRef}
          className={`cc-band${readonly ? "" : invalid(receiptProblem)}${step(!receiptProblem)}`}
        >
          {!readonly && attempted && receiptProblem && (
            <p className="cc-band-error" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              {receiptProblem}
            </p>
          )}
          <div className="cc-band-head">
            <h3 className="cc-band-title">
              {stepMark(1, !receiptProblem)}
              Receipt
            </h3>
          </div>
          {!readonly && (
            <>
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
          {!readonly && !r.files.length && !showMissing && (
            // Nothing yet: one wide target. Phones lead with the camera;
            // desktops can drop a photo or PDF straight onto it.
            <div
              className={`cc-drop${dragging ? " cc-drop--over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void upload(e.dataTransfer.files);
              }}
            >
              <div className="cc-drop-actions">
                {touch && (
                  <button
                    type="button"
                    className="cc-btn cc-drop-btn"
                    onClick={() => cameraRef.current?.click()}
                  >
                    <Camera size={17} aria-hidden="true" />
                    Take photo
                  </button>
                )}
                <button
                  type="button"
                  className="cc-btn cc-drop-btn"
                  onClick={() => uploadRef.current?.click()}
                >
                  <FileUp size={17} aria-hidden="true" />
                  {touch ? "Upload" : "Upload receipt"}
                </button>
              </div>
              {!touch && (
                <span className="cc-drop-hint">
                  or drop a photo or PDF here
                </span>
              )}
            </div>
          )}
          {r.files.length > 0 && (
            <div className="cc-files">
              {r.files.map((f) => (
                <FilePreview
                  key={f.id}
                  file={f}
                  path={path}
                  loadFile={loadFile}
                  onOpen={(file, url) => setViewing({ file, url })}
                />
              ))}
              {!readonly && (
                <>
                  {touch && (
                    <button
                      type="button"
                      className="cc-add-tile"
                      onClick={() => cameraRef.current?.click()}
                    >
                      <Camera size={20} aria-hidden="true" />
                      Take photo
                    </button>
                  )}
                  <button
                    type="button"
                    className="cc-add-tile"
                    title="Photos or PDFs, up to 15 MB each"
                    onClick={() => uploadRef.current?.click()}
                  >
                    <Plus size={20} aria-hidden="true" />
                    {touch ? "Upload" : "Add another"}
                  </button>
                </>
              )}
            </div>
          )}
          {readonly ? (
            r.missingReceipt ? (
              <p className="cc-quote">No receipt: {r.missingReceipt}</p>
            ) : (
              !r.files.length && (
                <p className="cc-empty-slot">
                  <FileUp size={16} aria-hidden="true" />
                  {theirs ? "No receipt uploaded yet" : "No receipt"}
                </p>
              )
            )
          ) : showMissing ? (
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
            !r.files.length && (
              <button
                type="button"
                className="cc-link-btn"
                onClick={() => setShowMissing(true)}
              >
                Can&apos;t provide a receipt?
              </button>
            )
          )}
        </section>

        <section
          ref={codingRef}
          className={`cc-band${readonly || !opts ? "" : invalid(codingProblem)}${step(!!opts && !codingProblem)}`}
        >
          {!readonly && opts && attempted && codingProblem && (
            <p className="cc-band-error" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              {codingProblem}
            </p>
          )}
          <div className="cc-band-head">
            <h3 className="cc-band-title">
              {stepMark(2, !!opts && !codingProblem)}
              Charged to
            </h3>
            {opts && !readonly && (split || remaining !== 0) && (
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
          {readonly ? (
            r.allocations.length ? (
              <div className="cc-ledger">
                {r.allocations.map((a, i) => (
                  <div className="cc-ledger-line" key={i}>
                    <span className="cc-ledger-desc">
                      {a.kind === "job" && onOpenJob ? (
                        // A link: the read-only <fieldset disabled> would
                        // disable a button here.
                        <a
                          className="cc-ledger-name cc-ledger-link"
                          href={`/jobcost/${a.destination}`}
                          onClick={(e) => {
                            e.preventDefault();
                            onOpenJob(a.destination);
                          }}
                        >
                          {a.name || a.destination}
                          <ChevronRight size={14} aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="cc-ledger-name">
                          {a.name || a.destination}
                        </span>
                      )}
                      <span className="cc-ledger-meta">
                        {a.kind === "job"
                          ? `Job ${a.destination} · ${label(opts?.costTypes, a.costType)}`
                          : `Overhead account ${a.destination}`}
                      </span>
                    </span>
                    {r.allocations.length > 1 && (
                      <span className="cc-ledger-amt">
                        {money(a.amountCents)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="cc-empty-slot">
                <Tag size={16} aria-hidden="true" />
                {theirs ? "Not charged anywhere yet" : "Not categorized"}
              </p>
            )
          ) : !opts ? (
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
                  </div>
                )}
                <div
                  className="cc-seg"
                  role="radiogroup"
                  aria-label="Charge to"
                >
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
                        edit(index, { kind, destination: "", costType: "" })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="cc-grid">
                  <div
                    className={`cc-field${split || a.kind === "job" ? "" : " cc-span-all"}`}
                  >
                    <span className="cc-field-label">
                      {a.kind === "job" ? "Job and phase" : "Overhead account"}
                    </span>
                    {a.kind === "job" ? (
                      <Picker
                        searchable
                        label="Job and phase"
                        placeholder="Search by address or job name"
                        items={jobItems}
                        value={a.destination}
                        onChange={(id) => edit(index, { destination: id })}
                      />
                    ) : (
                      <Picker
                        label="Overhead account"
                        items={accountItems}
                        value={a.destination}
                        onChange={(id) => edit(index, { destination: id })}
                      />
                    )}
                  </div>
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
                  {a.kind === "job" && (
                    <div className="cc-field">
                      <span className="cc-field-label">Cost type</span>
                      {costTypeItems.length <= 4 ? (
                        // Two or three choices: tap targets, not a menu.
                        <div
                          className="cc-chips"
                          role="radiogroup"
                          aria-label="Cost type"
                        >
                          {costTypeItems.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              role="radio"
                              aria-checked={a.costType === o.id}
                              className={`cc-chip${a.costType === o.id ? " cc-chip--on" : ""}`}
                              onClick={() => edit(index, { costType: o.id })}
                            >
                              {o.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Picker
                          label="Cost type"
                          items={costTypeItems}
                          value={a.costType}
                          onChange={(id) => edit(index, { costType: id })}
                        />
                      )}
                    </div>
                  )}
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

        {!!r.relatedReceipts?.length && (
          <div className="cc-related">
            {r.relatedReceipts.map((item, i) => (
              <a
                key={item.id}
                className="cc-link"
                href={`/r/${item.token}`}
                rel="noreferrer"
              >
                Open related receipt{" "}
                {r.relatedReceipts!.length > 1 ? i + 1 : ""}
              </a>
            ))}
          </div>
        )}
        {!readonly && (onDismiss || !r.dismissalRequested) && (
          <details className="cc-disclosure cc-disclosure--end">
            <summary>
              {onDismiss
                ? "Dismiss this charge"
                : "Was this charge canceled or refunded?"}
            </summary>
            <div className="cc-disclosure-body">
              <label className="cc-field">
                <span className="cc-field-label">
                  {onDismiss ? "Reason" : "What happened"}
                </span>
                <textarea
                  className="cc-input"
                  rows={2}
                  value={dismissReason}
                  onChange={(e) => setDismissReason(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="cc-btn cc-btn--danger"
                disabled={!dismissReason.trim()}
                onClick={() =>
                  void (onDismiss
                    ? onDismiss(dismissReason)
                    : relationship("request-dismissal", {
                        reason: dismissReason,
                      }))
                }
              >
                {onDismiss ? "Dismiss charge" : "Request dismissal"}
              </button>
            </div>
          </details>
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

      {reviewing ? (
        <div className="cc-actionbar">{verdict}</div>
      ) : (
        !readonly && (
          <div className="cc-actionbar">
            {confirmDelete ? (
              <>
                <span className="cc-actionbar-note cc-actionbar-note--strong">
                  Delete this receipt? It will be removed from every list.
                </span>
                <button
                  type="button"
                  className="cc-btn"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="cc-btn cc-btn--destructive"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {busy ? "Deleting…" : "Delete receipt"}
                </button>
              </>
            ) : (
              <>
                <span className="cc-actionbar-note">
                  {r.firstSubmittedAt
                    ? "Corrections are allowed until approval."
                    : "Add the receipt and where it's charged, then submit."}
                </span>
                {onDelete && (
                  <button
                    type="button"
                    className="cc-btn cc-btn--danger"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  className="cc-btn cc-btn--primary"
                  disabled={!opts || busy}
                  onClick={() => void submit()}
                >
                  {busy
                    ? "Submitting…"
                    : r.firstSubmittedAt
                      ? "Resubmit"
                      : "Submit receipt"}
                </button>
              </>
            )}
          </div>
        )
      )}
      {viewing && (
        <FileGallery
          files={r.files}
          startId={viewing.file.id}
          startUrl={viewing.url}
          path={path}
          loadFile={loadFile}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
