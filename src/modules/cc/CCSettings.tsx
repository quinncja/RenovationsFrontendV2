import { useEffect, useState } from "react";
import { staffRequest } from "./staffApi";
import { json } from "./api";
import type { CCSettings as Settings } from "./types";
import "./cc.css";
export function CCSettings() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    staffRequest<Settings>("cc/settings")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);
  const [script, setScript] = useState("");
  async function saveConsent() {
    if (!settings) return;
    setBusy(true);
    setError("");
    try {
      const next = await staffRequest<Settings>(
        "cc/settings",
        json("PATCH", {
          testMode: settings.testMode,
          revision: settings.revision,
          testConsent: true,
          consentScript: script,
        }),
      );
      setSettings({ ...settings, ...next, testConsent: "granted" });
      setScript("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    if (!settings) return;
    setBusy(true);
    setError("");
    try {
      const next = await staffRequest<Settings>(
        "cc/settings",
        json("PATCH", {
          testMode: !settings.testMode,
          revision: settings.revision,
        }),
      );
      setSettings({ ...settings, ...next });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cc">
      <div className="settings-row">
        <div className="settings-row-info">
          <span className="settings-row-label">CC receipt test mode</span>
          <span className="settings-row-description">
            New receipts use Test Job 24000100 and send texts only to Quinn.
            Existing receipts retain their original mode.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings?.testMode || false}
          disabled={busy || !settings?.canEdit}
          onClick={() => void toggle()}
        >
          {settings
            ? settings.testMode
              ? "Test on"
              : "Production"
            : "Loading…"}
        </button>
      </div>
      {settings?.canEdit && (
        <details>
          <summary>
            Test SMS consent: {settings.testConsent.replaceAll("_", " ")}
          </summary>
          <p className="cc-muted">
            Record your actual agreement before test texts are enabled.
          </p>
          <label>
            Exact consent script acknowledged
            <textarea
              rows={4}
              value={script}
              onChange={(e) => setScript(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !script.trim()}
            onClick={() => void saveConsent()}
          >
            I agree to receive the described test texts
          </button>
        </details>
      )}
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
