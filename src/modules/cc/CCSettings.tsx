import { useEffect, useState } from "react";
import { SegmentedControl } from "../../shared/components/SegmentedControl";
import { staffRequest } from "./staffApi";
import { json } from "./api";
import type { CCSettings as Settings } from "./types";
import "./cc.css";

// Rows for the Settings modal's "Company card" group: same settings-row +
// settings-seg grammar as Appearance and the other toggles.
export function CCSettings() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consentOpen, setConsentOpen] = useState(false),
    [script, setScript] = useState("");
  useEffect(() => {
    staffRequest<Settings>("cc/settings")
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);
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
      setConsentOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setMode(testMode: boolean) {
    if (!settings || settings.testMode === testMode || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await staffRequest<Settings>(
        "cc/settings",
        json("PATCH", { testMode, revision: settings.revision }),
      );
      setSettings({ ...settings, ...next });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const granted = settings?.testConsent === "granted";
  return (
    <>
      <div className="settings-row">
        <div className="settings-row-info">
          <span className="settings-row-label">Receipt test mode</span>
          <span className="settings-row-description">
            {error ||
              "New receipts use Test Job 24000100 and text only you. Existing receipts keep their mode."}
          </span>
        </div>
        {settings?.canEdit ? (
          <SegmentedControl
            variant="settings"
            role="radiogroup"
            ariaLabel="Receipt test mode"
            layoutId="ccTestModeThumb"
            value={settings.testMode ? "test" : "live"}
            options={[
              { key: "test", label: "Test" },
              { key: "live", label: "Live" },
            ]}
            onChange={(k) => void setMode(k === "test")}
          />
        ) : (
          <span className="settings-pill">
            {settings ? (settings.testMode ? "Test" : "Live") : "Loading…"}
          </span>
        )}
      </div>
      {settings?.canEdit && (
        <>
          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-label">Test text consent</span>
              <span className="settings-row-description">
                {granted
                  ? "Recorded. Test texts can be sent to you."
                  : "Record your agreement before test texts are enabled."}
              </span>
            </div>
            {granted ? (
              <span className="settings-pill settings-pill--ok">Granted</span>
            ) : (
              <button
                type="button"
                className="settings-toggle"
                onClick={() => setConsentOpen((o) => !o)}
              >
                {consentOpen ? "Cancel" : "Record"}
              </button>
            )}
          </div>
          {consentOpen && !granted && (
            <div className="cc-settings-consent">
              <label className="cc-field">
                <span className="cc-field-label">
                  Exact consent script acknowledged
                </span>
                <textarea
                  className="cc-input"
                  rows={3}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="button primary-button"
                disabled={busy || !script.trim()}
                onClick={() => void saveConsent()}
              >
                I agree to receive these test texts
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
