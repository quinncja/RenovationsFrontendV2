import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Receipt as ReceiptIcon, RotateCcw } from "lucide-react";
import ReceiptForm from "../modules/cc/ReceiptForm";
import { publicRequest } from "../modules/cc/api";
import { day, money, type Receipt } from "../modules/cc/types";
import { appRequest, json, session, SignedOut, type Me, type Row } from "./api";

type View =
  | { name: "home" }
  | { name: "start"; kind: "purchase" | "return" }
  | { name: "receipt"; token: string };

export function App() {
  const [signedIn, setSignedIn] = useState(() => !!session.get());
  return signedIn ? (
    <Signed onSignedOut={() => setSignedIn(false)} />
  ) : (
    <SignIn onSignedIn={() => setSignedIn(true)} />
  );
}

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
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const out = await appRequest<{ token: string }>("cc/app/verify", json("POST", { phone, code }));
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
            If {phone} is on a company card, a 6-digit code is on its way. It works for 10 minutes.
          </p>
          <label className="rde-field">
            <span>Code</span>
            <input
              className="rde-input rde-input--code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </label>
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
  const [view, setView] = useState<View>({ name: "home" });
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
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
  const home = (note = "") => {
    setFlash(note);
    setView({ name: "home" });
    load();
    window.scrollTo(0, 0);
  };

  if (view.name === "start")
    return (
      <Start
        kind={view.kind}
        onBack={() => home()}
        onStarted={(token) => setView({ name: "receipt", token })}
      />
    );
  if (view.name === "receipt")
    return <ReceiptView token={view.token} onBack={() => home()} onSubmitted={() => home("Sent for approval. Thank you!")} />;

  return (
    <main className="rde-shell">
      <Brand />
      {me?.testMode && <p className="rde-test">Test mode: receipts go to Test Job and nothing is sent.</p>}
      <h1 className="rde-title">{me ? `Hi, ${me.name.split(" ")[0]}` : " "}</h1>
      {flash && <p className="rde-flash" role="status">{flash}</p>}
      {error && <p className="rde-error" role="alert">{error}</p>}

      <div className="rde-actions">
        <button type="button" className="rde-action" onClick={() => setView({ name: "start", kind: "purchase" })}>
          <span className="rde-action-icon"><ReceiptIcon size={22} aria-hidden="true" /></span>
          <span className="rde-action-text">
            <b>Add a receipt</b>
            <span>A purchase on your card</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button type="button" className="rde-action" onClick={() => setView({ name: "start", kind: "return" })}>
          <span className="rde-action-icon"><RotateCcw size={22} aria-hidden="true" /></span>
          <span className="rde-action-text">
            <b>Log a return</b>
            <span>Money back on your card</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <section className="rde-section">
        <h2 className="rde-section-title">
          To finish{me && me.todo.length ? ` · ${me.todo.length}` : ""}
        </h2>
        {!me ? (
          <p className="rde-empty">Loading…</p>
        ) : me.todo.length ? (
          <List rows={me.todo} onOpen={(token) => setView({ name: "receipt", token })} />
        ) : (
          <p className="rde-empty">You're all caught up.</p>
        )}
      </section>

      {!!me?.recent.length && (
        <section className="rde-section">
          <h2 className="rde-section-title">Recently sent</h2>
          <List rows={me.recent} onOpen={(token) => setView({ name: "receipt", token })} />
        </section>
      )}

      <footer className="rde-footer">
        {me && <span>Card •••• {me.cardLast4}</span>}
        <button
          type="button"
          className="rde-link"
          onClick={() => {
            void appRequest("cc/app/signout", { method: "POST" }).catch(() => {});
            session.clear();
            onSignedOut();
          }}
        >
          Sign out
        </button>
      </footer>
    </main>
  );
}

const stateLabel: Record<string, string> = {
  awaiting: "Waiting for approval",
  posting: "Approving",
  approved: "Approved",
};

function List({ rows, onOpen }: { rows: Row[]; onOpen: (token: string) => void }) {
  return (
    <ul className="rde-list">
      {rows.map((r) => (
        <li key={r.token}>
          <button type="button" className="rde-row" onClick={() => onOpen(r.token)}>
            <span className="rde-row-text">
              <b>{r.description}</b>
              <span>
                {day(r.receiptDate)}
                {r.correction ? " · Needs a fix" : stateLabel[r.state] ? ` · ${stateLabel[r.state]}` : ""}
              </span>
            </span>
            <span className={`rde-row-amt${r.amountCents < 0 ? " rde-row-amt--credit" : ""}`}>
              {money(r.amountCents)}
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The few facts asked up front (a return is negative from the start); the
// receipt form then takes the photo and the job.
function Start({
  kind,
  onBack,
  onStarted,
}: {
  kind: "purchase" | "return";
  onBack: () => void;
  onStarted: (token: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [store, setStore] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ret = kind === "return";
  async function go() {
    setBusy(true);
    setError("");
    try {
      const out = await appRequest<{ token: string }>(
        "cc/app/receipts",
        json("POST", { kind, amount, date, store }),
      );
      onStarted(out.token);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="rde-shell">
      <Back onBack={onBack} />
      <h1 className="rde-title">{ret ? "Log a return" : "Add a receipt"}</h1>
      <p className="rde-sub">
        {ret
          ? "Money back on your card. Next you'll add a photo of the return slip and pick the job."
          : "Next you'll add a photo of the receipt and pick the job."}
      </p>
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
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            autoFocus
          />
        </label>
        <label className="rde-field">
          <span>Store</span>
          <input
            className="rde-input"
            placeholder="Home Depot"
            value={store}
            maxLength={200}
            onChange={(e) => setStore(e.target.value)}
          />
        </label>
        <label className="rde-field">
          <span>Date</span>
          <input className="rde-input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {error && <p className="rde-error" role="alert">{error}</p>}
        <button className="rde-btn rde-btn--primary" disabled={busy || !Number(amount.replace(/,/g, ""))}>
          {busy ? "Starting…" : "Next"}
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
  onSubmitted: () => void;
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
