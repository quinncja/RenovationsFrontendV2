import { useEffect, useState } from "react";
import { Copy, PlusSquare, Share } from "lucide-react";

// The beforeinstallprompt event Chrome on Android raises when it can install.
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const ua = navigator.userAgent;
const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const android = /Android/.test(ua);
// Browsers inside other apps (Gmail, Facebook, Instagram...) can't install.
const inApp = /FBAN|FBAV|Instagram|Line\/|GSA\/|; wv\)|LinkedInApp|Snapchat/.test(ua);

// Shown when /card is opened in a browser tab: how to put RD Expenses on the
// home screen. Opening the installed app skips straight to sign-in.
export function Install({ onUseInBrowser }: { onUseInBrowser: () => void }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const url = `${location.origin}/card/`;
  return (
    <main className="rde-shell rde-install">
      <img className="rde-appicon" src="/card/icons/apple-touch-icon.png" alt="" />
      <h1 className="rde-title">Get RD Expenses</h1>
      <p className="rde-sub">
        Add it to your home screen to submit receipts and returns in a tap. It updates itself, so you only do
        this once.
      </p>

      {installed ? (
        <p className="rde-note rde-note--done">
          Installed. Open <b>RD Expenses</b> from your home screen.
        </p>
      ) : inApp ? (
        <>
          <p className="rde-note">
            This page is open inside another app, which can't add it to your home screen. Open it in{" "}
            {ios ? "Safari" : "Chrome"} instead.
          </p>
          <button
            type="button"
            className="rde-btn rde-btn--primary"
            onClick={() =>
              void navigator.clipboard?.writeText(url).then(() => setCopied(true))
            }
          >
            <Copy size={17} aria-hidden="true" /> {copied ? "Link copied" : "Copy the link"}
          </button>
          <p className="rde-note">Then paste it into {ios ? "Safari" : "Chrome"}'s address bar.</p>
        </>
      ) : ios ? (
        <ol className="rde-steps">
          <li>
            <span className="rde-num">1</span>
            <span>
              Tap{" "}
              <span className="rde-chip">
                <Share size={16} aria-hidden="true" /> Share
              </span>{" "}
              in Safari's bottom bar (or under <b>•••</b>)
            </span>
          </li>
          <li>
            <span className="rde-num">2</span>
            <span>
              Scroll down and tap{" "}
              <span className="rde-chip">
                <PlusSquare size={16} aria-hidden="true" /> Add to Home Screen
              </span>
            </span>
          </li>
          <li>
            <span className="rde-num">3</span>
            <span>
              Tap <b>Add</b>, then open <b>RD Expenses</b> from your home screen
            </span>
          </li>
        </ol>
      ) : android ? (
        prompt ? (
          <>
            <button
              type="button"
              className="rde-btn rde-btn--primary"
              onClick={() => {
                void prompt.prompt();
                void prompt.userChoice.then((c) => c.outcome === "accepted" && setInstalled(true));
              }}
            >
              Install RD Expenses
            </button>
            <p className="rde-note">
              Then open <b>RD Expenses</b> from your home screen. You'll sign in with the phone number on your
              company card.
            </p>
          </>
        ) : (
          <ol className="rde-steps">
            <li>
              <span className="rde-num">1</span>
              <span>
                Tap <b>⋮</b> at the top right of Chrome
              </span>
            </li>
            <li>
              <span className="rde-num">2</span>
              <span>
                Tap <b>Install app</b> (or <b>Add to Home screen</b>)
              </span>
            </li>
            <li>
              <span className="rde-num">3</span>
              <span>
                Open <b>RD Expenses</b> from your home screen
              </span>
            </li>
          </ol>
        )
      ) : (
        <p className="rde-note">
          RD Expenses is made for your phone. On your phone, open <b>{url.replace(/^https?:\/\//, "")}</b> in the
          browser and follow the steps there.
        </p>
      )}

      <button type="button" className="rde-link rde-install-skip" onClick={onUseInBrowser}>
        Use it in this browser instead
      </button>
    </main>
  );
}
