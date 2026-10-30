import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, ScanLine, Undo2 } from "lucide-react";
import ReceiptForm from "../modules/cc/ReceiptForm";
import { publicRequest } from "../modules/cc/api";
import { money, tidyName, type Receipt } from "../modules/cc/types";
import { appRequest, appUpload, json, session, SignedOut, type Me, type Row, type ScanFields } from "./api";
import { prepare } from "./photo";
import { Reminders } from "./Reminders";
import { CodeInput } from "./CodeInput";

type View =
  | { name: "home" }
  | { name: "start"; kind: "purchase" | "return"; photo?: File }
  | { name: "receipt"; token: string };

export function App() {
  const [signedIn, setSignedIn] = useState(() => !!session.get());
  return signedIn ? (
    <Signed onSignedOut={() => setSignedIn(false)} />
  ) : (
    <SignIn onSignedIn={() => setSignedIn(true)} />
  );
}

// "7738967084" -> "(773) 896-7084" (anything else is shown as typed).
const pretty = (raw: string) => {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
};

// Phone number, then the texted code. The number must be the one on the
// card mapping; any other number is told the same thing, so the app never
// reveals who has a card.
function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    setBusy(true);
    setError("");
    try {
      await appRequest("cc/app/code", json("POST", { phone }));
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(entered = code) {
    setBusy(true);
    setError("");
    try {
      const out = await appRequest<{ token: string }>("cc/app/verify", json("POST", { phone, code: entered }));
      session.set(out.token);
      onSignedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="rde-shell">
      <Brand />
      <h1 className="rde-title">Sign in</h1>
      {!sent ? (
        <form
          className="rde-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <p className="rde-sub">Enter the mobile number on your company card. We'll text you a code.</p>
          <label className="rde-field">
            <span>Mobile number</span>
            <input
              className="rde-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(312) 555-0100"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </label>
          {error && <p className="rde-error" role="alert">{error}</p>}
          <button className="rde-btn rde-btn--primary" disabled={busy || phone.replace(/\D/g, "").length < 10}>
            {busy ? "Sending…" : "Text me a code"}
          </button>
        </form>
      ) : (
        <form
          className="rde-form"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p className="rde-sub">
            If {pretty(phone)} is on a company card, a 6-digit code is on its way. It works for 10 minutes.
          </p>
          <CodeInput
            value={code}
            disabled={busy}
            onChange={(c) => {
              setCode(c);
              if (error) setError("");
            }}
            onComplete={(c) => void verify(c)}
          />
          {error && <p className="rde-error" role="alert">{error}</p>}
          <button className="rde-btn rde-btn--primary" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            type="button"
            className="rde-link"
            onClick={() => {
              setSent(false);
              setCode("");
              setError("");
            }}
          >
            Use a different number or send a new code
          </button>
        </form>
      )}
    </main>
  );
}

function Signed({ onSignedOut }: { onSignedOut: () => void }) {
  // A notification opens /card/?r=<receipt link token>: start on that receipt.
  const [view, setView] = useState<View>(() => {
    const token = new URLSearchParams(location.search).get("r");
    if (token && /^[A-Za-z0-9_-]{22}$/.test(token)) {
      history.replaceState(null, "", "/card/");
      return { name: "receipt", token };
    }
    return { name: "home" };
  });
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  // A short confirmation that slides up and fades (never shifts the page).
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const load = useCallback(() => {
    appRequest<Me>("cc/app/me")
      .then((m) => {
        setMe(m);
        setError("");
        // Home-screen badge: receipts still to finish.
        const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
        if (m.todo.length) void nav.setAppBadge?.(m.todo.length).catch(() => {});
        else void nav.clearAppBadge?.().catch(() => {});
      })
      .catch((e) => (e instanceof SignedOut ? onSignedOut() : setError(e.message)));
  }, [onSignedOut]);
  useEffect(() => {
    load();
    // Coming back to the app refreshes the list.
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [load]);
  const camera = useRef<HTMLInputElement>(null);
  const shooting = useRef<"purchase" | "return">("purchase");
  const home = (note = "") => {
    setToast(note);
    setView({ name: "home" });
    load();
    window.scrollTo(0, 0);
  };

  if (view.name === "start")
    return (
      <Start
        kind={view.kind}
        photo={view.photo}
        onBack={() => home()}
        onStarted={(token) => setView({ name: "receipt", token })}
      />
    );
  if (view.name === "receipt")
    return (
      <ReceiptView
        token={view.token}
        onBack={() => home()}
        onSubmitted={(r) => home(`${tidyName(r.description || "Receipt")} sent for approval`)}
      />
    );

  const snap = (kind: "purchase" | "return") => {
    shooting.current = kind;
    camera.current?.click();
  };
  const signOut = () => {
    void appRequest("cc/app/signout", { method: "POST" }).catch(() => {});
    session.clear();
    onSignedOut();
  };
  return (
    <main className="rde-shell">
      <header className="rde-top">
        <Brand />
        {me?.testMode && <span className="rde-pill">Test mode</span>}
      </header>
      <h1 className="rde-title">{me ? `Hi, ${me.name.split(" ")[0]}` : "\u00a0"}</h1>
      {me?.tester && me.cardholders ? (
        <label className="rde-actas">
          Testing as{" "}
          <b>
            {me.actingAs} · •••• {me.cardLast4}
          </b>
          <ChevronDown size={14} aria-hidden="true" />
          <select
            aria-label="Testing as"
            value={me.cardLast4}
            onChange={(e) =>
              void appRequest("cc/app/act-as", json("POST", { cardLast4: e.target.value }))
                .then(load)
                .catch((err) => setError((err as Error).message))
            }
          >
            {me.cardholders.map((c) => (
              <option key={c.cardLast4} value={c.cardLast4}>
                {c.name} · •••• {c.cardLast4}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="rde-greet-sub">{me ? `Company card •••• ${me.cardLast4}` : "\u00a0"}</p>
      )}
      {error && <p className="rde-error" role="alert">{error}</p>}

      {/* The tiles open the camera first; the photo leads the next screen. */}
      <input
        ref={camera}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) setView({ name: "start", kind: shooting.current, photo: file });
        }}
      />
      <div className="rde-acts">
        <button type="button" className="rde-act rde-act--primary" onClick={() => snap("purchase")}>
          <Camera size={26} aria-hidden="true" />
          <span>
            <b>Add receipt</b>
            <small>Snap a purchase</small>
          </span>
        </button>
        <button type="button" className="rde-act" onClick={() => snap("return")}>
          <Undo2 size={26} aria-hidden="true" />
          <span>
            <b>Log return</b>
            <small>Money back</small>
          </span>
        </button>
      </div>

      <button type="button" className="rde-link rde-noshot" onClick={() => setView({ name: "start", kind: "purchase" })}>
        No receipt to photograph? Enter it by hand
      </button>

      <section className="rde-section">
        <div className="rde-section-head">
          <h2 className="rde-section-title">To finish</h2>
          {!!me?.todo.length && <span>{me.todo.length}</span>}
        </div>
        {!me ? (
          <p className="rde-empty">Loading…</p>
        ) : me.todo.length ? (
          <List rows={me.todo} onOpen={(token) => setView({ name: "receipt", token })} />
        ) : (
          <p className="rde-empty rde-empty--done">
            <Check size={16} aria-hidden="true" /> You're all caught up.
          </p>
        )}
      </section>

      {!!me?.recent.length && (
        <section className="rde-section">
          <div className="rde-section-head">
            <h2 className="rde-section-title">Recently sent</h2>
          </div>
          <List rows={me.recent} onOpen={(token) => setView({ name: "receipt", token })} />
        </section>
      )}

      <footer className="rde-footer">
        {me && <Reminders testMode={me.testMode} />}
        <button type="button" className="rde-link" onClick={signOut}>
          Sign out
        </button>
      </footer>

      {toast && (
        <div className="rde-toast" role="status" key={toast}>
          <span className="rde-toast-mark">
            <Check size={13} strokeWidth={3} aria-hidden="true" />
          </span>
          {toast}
        </div>
      )}
    </main>
  );
}

// Each row says what it's waiting on: a dot (amber needs you, red sent
// back, blue with a GM, green done) and the same words beside the date.
function status(r: Row): { tone: string; text: string } {
  if (r.correction) return { tone: "red", text: r.correctionReason ? `Sent back: ${r.correctionReason}` : "Sent back" };
  if (r.state === "pending") return { tone: "amber", text: r.amountCents < 0 ? "Return · needs slip" : "Needs receipt" };
  if (r.state === "approved") return { tone: "green", text: "Approved" };
  return { tone: "blue", text: "Waiting for approval" };
}

function List({ rows, onOpen }: { rows: Row[]; onOpen: (token: string) => void }) {
  return (
    <ul className="rde-list">
      {rows.map((r) => {
        const st = status(r);
        return (
          <li key={r.token}>
            <button type="button" className="rde-row" onClick={() => onOpen(r.token)}>
              <span className={`rde-dot rde-dot--${st.tone}`} aria-hidden="true" />
              <span className="rde-row-text">
                <b>{tidyName(r.description)}</b>
                <span>
                  {shortDay(r.receiptDate)} · {st.text}
                </span>
              </span>
              <span className={`rde-row-amt${r.amountCents < 0 ? " rde-row-amt--credit" : ""}`}>
                {money(r.amountCents)}
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The few facts asked up front (a return is negative from the start); the
// receipt form then takes the photo and the job.
// After the photo: the reader fills total, store and date for a quick check
// (or the cardholder types them), then the receipt is created with the photo
// already attached and opens on the job step.
function Start({
  kind,
  photo,
  onBack,
  onStarted,
}: {
  kind: "purchase" | "return";
  photo?: File;
  onBack: () => void;
  onStarted: (token: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [reading, setReading] = useState(Boolean(photo));
  const [read, setRead] = useState<"filled" | "partial" | "none" | "">("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [store, setStore] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const retake = useRef<HTMLInputElement>(null);
  const ret = kind === "return";

  async function take(raw: File) {
    setReading(true);
    setRead("");
    setError("");
    const ready = await prepare(raw);
    setFile(ready);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return ready.type.startsWith("image/") ? URL.createObjectURL(ready) : "";
    });
    try {
      const { fields } = await appUpload<{ fields: ScanFields | null }>("cc/app/scan", ready);
      if (fields) {
        if (fields.total) setAmount(fields.total);
        if (fields.merchant) setStore(tidyName(fields.merchant));
        if (fields.date) setDate(fields.date);
        setRead(fields.total && fields.merchant && fields.date ? "filled" : fields.total || fields.merchant ? "partial" : "none");
      } else setRead("none");
    } catch {
      setRead("none");
    } finally {
      setReading(false);
    }
  }
  useEffect(() => {
    if (photo) void take(photo);
    // Runs once for the photo the camera handed over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function go() {
    setBusy(true);
    setError("");
    try {
      const out = await appRequest<{ token: string }>(
        "cc/app/receipts",
        json("POST", { kind, amount, date, store }),
      );
      if (file) {
        const path = `cc/public/${encodeURIComponent(out.token)}`;
        const r = await publicRequest<Receipt>(path);
        await publicRequest<Receipt>(`${path}/files`, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name || "receipt.jpg"),
            "X-Receipt-Revision": String(r.revision),
          },
          body: file,
        }).catch(() => {
          // The receipt exists; the photo can be added again on the next screen.
        });
      }
      onStarted(out.token);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const note = reading
    ? "Reading your receipt…"
    : read === "filled"
      ? "Filled in from your photo. Check them before you continue."
      : read === "partial"
        ? "Some of it was readable. Fill in the rest."
        : read === "none"
          ? "Couldn't read this one. Fill it in below."
          : "";
  return (
    <main className="rde-shell">
      <Back onBack={onBack} />
      <h1 className="rde-title">{ret ? "Log a return" : "Add a receipt"}</h1>
      {photo || file ? (
        <div className="rde-shot">
          {preview ? (
            <img src={preview} alt="Your receipt" />
          ) : (
            <span className="rde-shot-pdf">{file?.name || "Receipt"}</span>
          )}
          <button type="button" className="rde-shot-retake" onClick={() => retake.current?.click()} disabled={reading || busy}>
            <RefreshCw size={14} aria-hidden="true" /> Retake
          </button>
          <input
            ref={retake}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void take(f);
            }}
          />
        </div>
      ) : (
        <p className="rde-sub">
          {ret ? "Money back on your card. Next you'll pick the job." : "Next you'll pick the job."}
        </p>
      )}
      {note && (
        <p className={`rde-read${reading ? " is-reading" : ""}`} role="status">
          <ScanLine size={15} aria-hidden="true" /> {note}
        </p>
      )}
      <form
        className="rde-form"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <label className="rde-field">
          <span>{ret ? "Amount refunded" : "Total"}</span>
          <input
            className="rde-input"
            inputMode="decimal"
            placeholder={reading ? "…" : "0.00"}
            value={amount}
            disabled={reading}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
          />
        </label>
        <label className="rde-field">
          <span>Store</span>
          <input
            className="rde-input"
            placeholder={reading ? "…" : "Home Depot"}
            value={store}
            maxLength={200}
            disabled={reading}
            onChange={(e) => setStore(e.target.value)}
          />
        </label>
        <label className="rde-field">
          <span>Date</span>
          <input
            className="rde-input"
            type="date"
            max={today()}
            value={date}
            disabled={reading}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {error && <p className="rde-error" role="alert">{error}</p>}
        <button className="rde-btn rde-btn--primary" disabled={busy || reading || !Number(amount.replace(/,/g, ""))}>
          {busy ? "Saving…" : "Next: pick the job"}
        </button>
      </form>
    </main>
  );
}

function ReceiptView({
  token,
  onBack,
  onSubmitted,
}: {
  token: string;
  onBack: () => void;
  onSubmitted: (r: Receipt) => void;
}) {
  const path = `cc/public/${encodeURIComponent(token)}`;
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    publicRequest<Receipt>(path)
      .then(setReceipt)
      .catch((e) => setError(e.message));
  }, [path]);
  return (
    <main className="rde-shell rde-shell--form">
      <Back onBack={onBack} />
      <div className="cc-shell-card">
        {receipt ? (
          <ReceiptForm
            initial={receipt}
            path={path}
            request={publicRequest}
            onChange={setReceipt}
            onSubmitted={onSubmitted}
            phone
          />
        ) : (
          <p className="cc-shell-status" role={error ? "alert" : "status"}>
            {error || "Loading…"}
          </p>
        )}
      </div>
    </main>
  );
}

function Brand() {
  return (
    <header className="rde-brand">
      <img src="/card/icons/apple-touch-icon.png" alt="" />
      <b>RD Expenses</b>
    </header>
  );
}

function Back({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="rde-back" onClick={onBack}>
      <ChevronLeft size={18} aria-hidden="true" /> Back
    </button>
  );
}
