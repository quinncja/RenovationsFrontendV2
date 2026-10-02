import { useEffect, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { CCModal } from "./CCModal";
import { Banner } from "./ReceiptForm";
import { staffRequest } from "./staffApi";
import { json } from "./api";
interface Mapping {
  cardLast4: string;
  employeeName: string;
  employeeId: number;
  ownerUid?: string | null;
  phone?: string;
  revision: number;
  active: boolean;
}
interface Data {
  mappings: Mapping[];
  employees: { id: number; name: string }[];
  users: { id: string; name: string; email: string }[];
}
type Draft = {
  cardLast4: string;
  employeeName: string;
  employeeId: string;
  ownerUid: string;
  phone: string;
  revision: number;
  active: boolean;
};
const blank: Draft = {
  cardLast4: "",
  employeeName: "",
  employeeId: "",
  ownerUid: "",
  phone: "",
  revision: 0,
  active: true,
};

// The card list is the whole sheet: each row reads card → person. Clicking a
// row (or Add card) opens the editor as a second, smaller modal on top.
export function MappingModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<Draft | null>(null),
    [isNew, setIsNew] = useState(false);
  const load = () =>
    staffRequest<Data>("cc/mappings")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <CCModal
      eyebrow="Company card"
      title="Card mapping"
      narrow
      onClose={onClose}
      footer={
        <button
          className="button primary-button"
          disabled={!data}
          onClick={() => {
            setIsNew(true);
            setEditing(blank);
          }}
        >
          <Plus size={15} /> Add card
        </button>
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
      ) : data.mappings.length ? (
        <div className="cc-map-list cc-map-list--full">
          {data.mappings.map((m) => (
            <button
              key={m.cardLast4}
              type="button"
              className="cc-map-row"
              onClick={() => {
                setIsNew(false);
                setEditing({
                  ...blank,
                  ...m,
                  employeeId: String(m.employeeId || ""),
                  ownerUid: m.ownerUid || "",
                  phone: m.phone || "",
                });
              }}
            >
              <span className="cc-card-num cc-map-card">•••• {m.cardLast4}</span>
              <span className="cc-map-name">{m.employeeName}</span>
              {!m.active && (
                <span className="cc-badge cc-badge--muted">Inactive</span>
              )}
              <ChevronRight size={15} className="cc-map-go" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <p className="cc-band-sub" style={{ marginTop: 0 }}>
          No cards mapped yet.
        </p>
      )}
      {editing && data && (
        <CardEditor
          initial={editing}
          isNew={isNew}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </CCModal>
  );
}

function CardEditor({
  initial,
  isNew,
  data,
  onClose,
  onSaved,
}: {
  initial: Draft;
  isNew: boolean;
  data: Data;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = /^\d{4}$/.test(draft.cardLast4) && !!draft.employeeId;
  async function save() {
    setBusy(true);
    setError("");
    try {
      await staffRequest(
        "cc/mappings",
        json("PUT", { ...draft, employeeId: Number(draft.employeeId) }),
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <CCModal
      eyebrow={isNew ? "Card mapping" : `Card •••• ${initial.cardLast4}`}
      title={isNew ? "Add card" : initial.employeeName || "Edit card"}
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
            onClick={() => void save()}
          >
            {busy ? "Saving…" : isNew ? "Add card" : "Save"}
          </button>
        </>
      }
    >
      <fieldset className="cc-fieldset" disabled={busy}>
        <div className="cc-grid">
          <label className="cc-field">
            <span className="cc-field-label">Card last four</span>
            <input
              className="cc-input cc-input--money"
              value={draft.cardLast4}
              inputMode="numeric"
              maxLength={4}
              autoFocus={isNew}
              disabled={!isNew}
              onChange={(e) =>
                set({ cardLast4: e.target.value.replace(/\D/g, "") })
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
              onChange={(e) => set({ phone: e.target.value })}
            />
          </label>
          <label className="cc-field cc-span-all">
            <span className="cc-field-label">Sage employee</span>
            <select
              className="cc-input"
              value={draft.employeeId}
              onChange={(e) =>
                set({
                  employeeId: e.target.value,
                  employeeName:
                    data.employees.find((x) => String(x.id) === e.target.value)
                      ?.name || "",
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
          <label className="cc-field cc-span-all">
            <span className="cc-field-label">Dashboard login (optional)</span>
            <select
              className="cc-input"
              value={draft.ownerUid}
              onChange={(e) => set({ ownerUid: e.target.value })}
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
        {!isNew && (
          <label className="cc-check">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => set({ active: e.target.checked })}
            />
            Active
          </label>
        )}
        {error && <Banner tone="red">{error}</Banner>}
      </fieldset>
    </CCModal>
  );
}
