import { useEffect, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { appRequest, json } from "./api";

type Status = "checking" | "unsupported" | "off" | "on" | "denied";
const LATER = "rd-expenses:reminders-later";

const supported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// The server's public key arrives base64url; subscribe() wants raw bytes.
function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.getRegistration("/card/");
}

// "Turn on reminders": asks once (iPhone allows it only from a tap, inside
// the installed app), subscribes this phone, and tells the server. While CC
// test mode is on the server sends none, which the card says.
export function Reminders({ testMode }: { testMode: boolean }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(LATER) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supported()) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("denied");
      const sub = await (await registration())?.pushManager.getSubscription();
      if (!alive) return;
      if (sub && Notification.permission === "granted") {
        setStatus("on");
        // Keep the server's copy current (it drops ones that stop working).
        void appRequest("cc/app/push", json("POST", { subscription: sub.toJSON() })).catch(() => {});
      } else setStatus("off");
    })().catch(() => alive && setStatus("off"));
    return () => {
      alive = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = (await registration()) || (await navigator.serviceWorker.register("/card-sw.js", { scope: "/card/" }));
      await navigator.serviceWorker.ready;
      const { publicKey } = await appRequest<{ publicKey: string }>("cc/app/push-key");
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      await appRequest("cc/app/push", json("POST", { subscription: sub.toJSON() }));
      setStatus("on");
    } catch (e) {
      setError((e as Error).message || "Reminders couldn't be turned on. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking" || status === "unsupported") return null;
  if (status === "on")
    return (
      <span className="rde-reminders-on" title={testMode ? "While testing, none are sent." : undefined}>
        <Bell size={14} aria-hidden="true" />
        Reminders on{testMode ? " (paused while testing)" : ""}
      </span>
    );
  if (status === "denied")
    return (
      <span className="rde-reminders-on rde-reminders-on--off">
        <BellOff size={14} aria-hidden="true" />
        Reminders blocked in Settings
      </span>
    );
  if (hidden)
    return (
      <button type="button" className="rde-reminders-on rde-reminders-link" onClick={() => setHidden(false)}>
        <Bell size={14} aria-hidden="true" />
        Turn on reminders
      </button>
    );
  const later = () => {
    try {
      localStorage.setItem(LATER, "1");
    } catch {
      // Hidden for this visit only.
    }
    setHidden(true);
  };
  return (
    <section className="rde-reminders">
      <span className="rde-reminders-icon">
        <Bell size={17} aria-hidden="true" />
      </span>
      <span className="rde-reminders-text">
        Get a reminder when a receipt needs you
        {error && <span className="rde-reminders-error">{error}</span>}
      </span>
      <button type="button" className="rde-reminders-on-btn" disabled={busy} onClick={() => void turnOn()}>
        {busy ? "Turning on…" : "Turn on"}
      </button>
      <button type="button" className="rde-reminders-x" aria-label="Not now" onClick={later}>
        <X size={17} aria-hidden="true" />
      </button>
    </section>
  );
}
