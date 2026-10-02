import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { CCModal } from "./CCModal";
import { Banner } from "./ReceiptForm";
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
const consentLabel = (m: Mapping) => {
  const status = m.consent?.status;
  if (!status) return "No SMS consent";
  return `SMS ${status.replaceAll("_", " ")}`;
};

// Card list on top (rows in the change-order project picker's voice; copper
// marks the one being edited), the add/edit form beneath, Save in the footer.
export function MappingModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null),
    [draft, setDraft] = useState(blank);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [script, setScript] = useState(""),
    [editingCard, setEditingCard] = useState<string | null>(null);
  const load = () =>
    staffRequest<Data>("cc/mappings")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  function reset() {
    setDraft(blank);
    setEditingCard(null);
    setConsent(false);
    setScript("");
  }
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
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const editing = editingCard !== null;
  return (
    <CCModal
      eyebrow="Company card"
      title="Card mapping"
      onClose={onClose}
      footer={
        <>
          <span className="subheadline text-secondary">
            Applies to future charges only.
          </span>
          <button
            className="button primary-button"
            disabled={
              busy ||
              !data ||
              !/^\d{4}$/.test(draft.cardLast4) ||
              !draft.employeeId
            }
            onClick={() => void save()}
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Add card"}
          </button>
        </>
      }
    >
      {!data ? (
        error ? (
          <Banner tone="red">{error}</Banner>
        ) : (
          <p className="body-text text-secondary" style={{ margin: 0 }}>
            Loading cards…
          </p>
        )
      ) : (
        <>
          <section className="cc-band">
            <div className="cc-band-head">
              <h3 className="cc-band-title">Cards</h3>
              {editing && (
                <button
                  type="button"
                  className="cc-btn cc-btn--quiet"
                  onClick={reset}
                >
                  <Plus size={15} aria-hidden="true" />
                  Add another card
                </button>
              )}
            </div>
            {data.mappings.length ? (
              <div className="cc-map-list">
                {data.mappings.map((m) => (
                  <button
                    key={m.cardLast4}
                    type="button"
                    className={`cc-map-row${editingCard === m.cardLast4 ? " cc-map-row--active" : ""}`}
                    onClick={() => {
                      setDraft({
                        ...m,
                        employeeId: String(m.employeeId || ""),
                        ownerUid: m.ownerUid || "",
                        phone: m.phone || "",
                      });
                      setEditingCard(m.cardLast4);
                      setConsent(false);
                      setScript("");
                    }}
                  >
                    <span className="cc-map-text">
                      <span className="cc-map-name">{m.employeeName}</span>
                      <span className="cc-map-meta">
                        {m.phone || "No phone"} · {consentLabel(m)}
                      </span>
                    </span>
                    {!m.active && (
                      <span className="cc-badge cc-badge--muted">Inactive</span>
                    )}
                    <span className="cc-card-num">•••• {m.cardLast4}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="cc-band-sub" style={{ marginTop: 0 }}>
                No cards mapped yet.
              </p>
            )}
          </section>

          <fieldset className="cc-fieldset" disabled={busy}>
            <section className="cc-band">
              <div className="cc-band-head">
                <h3 className="cc-band-title">
                  {editing ? `Card •••• ${draft.cardLast4}` : "Add a card"}
                </h3>
              </div>
              <div className="cc-grid">
                <label className="cc-field">
                  <span className="cc-field-label">Card last four</span>
                  <input
                    className="cc-input cc-input--money"
                    value={draft.cardLast4}
                    inputMode="numeric"
                    maxLength={4}
                    disabled={editing}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        cardLast4: e.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                </label>
                <label className="cc-field">
                  <span className="cc-field-label">Mobile number</span>
                  <input
                    className="cc-input"
                    type="tel"
                    placeholder="+1"
                    value={draft.phone}
                    onChange={(e) =>
                      setDraft({ ...draft, phone: e.target.value })
                    }
                  />
                </label>
                <label className="cc-field">
                  <span className="cc-field-label">Sage employee</span>
                  <select
                    className="cc-input"
                    value={draft.employeeId}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        employeeId: e.target.value,
                        employeeName:
                          data.employees.find(
                            (x) => String(x.id) === e.target.value,
                          )?.name || "",
                      })
                    }
                  >
                    <option value="">Choose an employee…</option>
                    {data.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · {e.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cc-field">
                  <span className="cc-field-label">
                    Dashboard login (optional)
                  </span>
                  <select
                    className="cc-input"
                    value={draft.ownerUid}
                    onChange={(e) =>
                      setDraft({ ...draft, ownerUid: e.target.value })
                    }
                  >
                    <option value="">No login, texted links only</option>
                    {data.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
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
                Active
              </label>
              <label className="cc-check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I collected this employee’s explicit SMS consent today
              </label>
              {consent && (
                <label className="cc-field">
                  <span className="cc-field-label">
                    Exact consent script read to the employee
                  </span>
                  <textarea
                    className="cc-input"
                    rows={4}
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                  />
                  <span className="cc-field-hint">
                    Your name and today’s date are recorded with the script.
                  </span>
                </label>
              )}
              {error && <Banner tone="red">{error}</Banner>}
            </section>
          </fieldset>
        </>
      )}
    </CCModal>
  );
}
