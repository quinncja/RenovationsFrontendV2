import { useEffect, useState } from "react";
import { CCModal } from "./CCModal";
import { staffRequest } from "./staffApi";
import { json } from "./api";
interface Mapping {
  cardLast4: string;
  employeeName: string;
  employeeId: number;
  ownerUid: string;
  phone?: string;
  revision: number;
  active: boolean;
  consent?: { status: string };
}
interface Data {
  mappings: Mapping[];
  employees: { id: number; name: string }[];
  users: { id: string; name: string; email: string }[];
}
const blank = {
  cardLast4: "",
  employeeName: "",
  employeeId: "",
  ownerUid: "",
  phone: "",
  revision: 0,
  active: true,
};
export function MappingModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null),
    [draft, setDraft] = useState(blank);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [script, setScript] = useState("");
  const load = () =>
    staffRequest<Data>("cc/mappings")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await staffRequest(
        "cc/mappings",
        json("PUT", {
          ...draft,
          employeeId: Number(draft.employeeId),
          consentGranted: consent,
          consentScript: script,
        }),
      );
      await load();
      setDraft(blank);
      setConsent(false);
      setScript("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <CCModal title="Card & employee mapping" onClose={onClose}>
      <p className="cc-muted">
        Changes apply to future charges. Existing receipts keep their
        responsible employee.
      </p>
      {error && (
        <p role="alert" className="cc-error">
          {error}
        </p>
      )}
      {!data ? (
        <p>Loading mappings…</p>
      ) : (
        <>
          <div className="cc-mapping-list">
            {data.mappings.map((m) => (
              <button
                key={m.cardLast4}
                type="button"
                onClick={() => {
                  setDraft({
                    ...m,
                    employeeId: String(m.employeeId || ""),
                    ownerUid: m.ownerUid || "",
                    phone: m.phone || "",
                  });
                  setConsent(false);
                  setScript("");
                }}
              >
                <span>
                  <strong>{m.employeeName}</strong>
                  <small>
                    {m.phone || "No phone"} ·{" "}
                    {m.consent?.status.replaceAll("_", " ") ||
                      "Consent not recorded"}
                  </small>
                </span>
                <span>•••• {m.cardLast4}</span>
              </button>
            ))}
          </div>
          <h3>
            {data.mappings.some((m) => m.cardLast4 === draft.cardLast4)
              ? "Edit mapping"
              : "Add mapping"}
          </h3>
          <fieldset disabled={busy}>
            <div className="cc-fields">
              <label>
                Card last four
                <input
                  value={draft.cardLast4}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) =>
                    setDraft({ ...draft, cardLast4: e.target.value })
                  }
                />
              </label>
              <label>
                Dashboard user
                <select
                  value={draft.ownerUid}
                  onChange={(e) => {
                    const u = data.users.find((u) => u.id === e.target.value);
                    setDraft({
                      ...draft,
                      ownerUid: e.target.value,
                      employeeName: u?.name || "",
                    });
                  }}
                >
                  <option value="">Choose employee…</option>
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sage employee
                <select
                  value={draft.employeeId}
                  onChange={(e) =>
                    setDraft({ ...draft, employeeId: e.target.value })
                  }
                >
                  <option value="">Choose employee…</option>
                  {data.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Phone (+1…)
                <input
                  type="tel"
                  value={draft.phone}
                  onChange={(e) =>
                    setDraft({ ...draft, phone: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="cc-check">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />
              Active mapping
            </label>
            <label className="cc-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I collected this employee’s explicit SMS consent today.
            </label>
            {consent && (
              <label>
                Exact consent script read to the employee
                <textarea
                  rows={5}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                />
                <small>
                  Your identity and today’s date will be recorded with the
                  script.
                </small>
              </label>
            )}
            <div className="cc-actions">
              <button
                type="button"
                onClick={() => {
                  setDraft(blank);
                  setConsent(false);
                  setScript("");
                }}
              >
                New mapping
              </button>
              <button
                className="cc-primary"
                type="button"
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save mapping"}
              </button>
            </div>
          </fieldset>
        </>
      )}
    </CCModal>
  );
}
