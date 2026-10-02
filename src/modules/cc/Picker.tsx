import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";

// One chooser for the receipt form (rendered by the isolated /r/:token bundle
// too, so no dependencies beyond React). The list opens ABOVE the field so a
// phone keyboard never covers it, flipping below only when there is no room.
// Rows lead with the name; the number rides small beneath it.
//
// searchable: the field becomes a search box (long job list). Typing only
// filters; a value is set solely by choosing a row, and leaving the field
// without choosing restores the current selection.

export interface PickerItem {
  id: string;
  name: string;
  /** Secondary line under the name, e.g. the job or account number. */
  meta?: string;
  /** Rows sharing a group render under one small heading, in list order. */
  group?: string;
}

const clipping = /(auto|scroll|hidden|clip)/;
// The nearest ancestor that would cut the list off (the review modal's scroll
// body), or the visible viewport.
function room(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  let top = 0,
    bottom = window.visualViewport?.height ?? window.innerHeight;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (clipping.test(s.overflowY) || clipping.test(s.overflow)) {
      const r = p.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
      break;
    }
  }
  return { above: rect.top - top - 12, below: bottom - rect.bottom - 12 };
}

export function Picker({
  items,
  value,
  onChange,
  placeholder = "Choose…",
  searchable,
  label,
  disabled,
}: {
  items: PickerItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  searchable?: boolean;
  /** Accessible name (the visible field label's text). */
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    [place, setPlace] = useState<{ up: boolean; max: number }>({
      up: true,
      max: 320,
    });
  const wrap = useRef<HTMLDivElement>(null),
    field = useRef<HTMLInputElement & HTMLButtonElement>(null),
    list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = items.find((i) => i.id === value);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter((i) => {
      const hay = `${i.name} ${i.id} ${i.meta || ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, query]);

  function show() {
    if (disabled) return;
    const { above, below } = room(wrap.current!);
    const up = above >= 200 || above >= below;
    setPlace({ up, max: Math.max(160, Math.min(352, up ? above : below)) });
    setQuery("");
    setActive(
      Math.max(
        0,
        items.findIndex((i) => i.id === value),
      ),
    );
    setOpen(true);
  }
  function close() {
    setOpen(false);
    setQuery("");
  }
  function choose(item: PickerItem) {
    onChange(item.id);
    close();
    field.current?.blur();
  }

  // Close when a tap lands anywhere outside the field and its list.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // Keep the highlighted row in view while arrowing through the list.
  useLayoutEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (
        ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key) &&
        !searchable
      ) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  const popover = open && (
    <div
      className={`cc-pick-pop${place.up ? " cc-pick-pop--up" : ""}`}
      style={{ maxHeight: place.max }}
    >
      {shown.length ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className="cc-pick-list"
        >
          {shown.map((item, i) => {
            const heading =
              item.group && item.group !== shown[i - 1]?.group
                ? item.group
                : null;
            return (
              <li key={item.id} role="presentation">
                {heading && <div className="cc-pick-group">{heading}</div>}
                <div
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={item.id === value}
                  className={`cc-pick-row${i === active ? " cc-pick-row--active" : ""}${item.id === value ? " cc-pick-row--selected" : ""}${item.meta ? "" : " cc-pick-row--single"}`}
                  // pointerdown keeps focus in the search box until the choice lands.
                  onPointerDown={(e) => e.preventDefault()}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  <span className="cc-pick-text">
                    <span className="cc-pick-name">{item.name}</span>
                    {item.meta && (
                      <span className="cc-pick-meta">{item.meta}</span>
                    )}
                  </span>
                  {item.id === value && (
                    <Check
                      size={16}
                      className="cc-pick-check"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cc-pick-empty">No matches for “{query}”</p>
      )}
    </div>
  );

  return (
    <div className="cc-pick" ref={wrap}>
      {searchable ? (
        <div
          className={`cc-input cc-pick-field${open ? " cc-pick-field--open" : ""}`}
        >
          <Search size={15} className="cc-pick-icon" aria-hidden="true" />
          <input
            ref={field}
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && shown[active] ? `${listId}-${active}` : undefined
            }
            className="cc-pick-search"
            disabled={disabled}
            placeholder={selected ? selected.name : placeholder}
            // Closed, it shows the choice; open, it is the search text.
            value={open ? query : selected?.name || ""}
            onFocus={show}
            // iOS can blur before a row's click lands; let the choice win.
            onBlur={() => setTimeout(close, 150)}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              if (!open) setOpen(true);
            }}
            onKeyDown={onKey}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        </div>
      ) : (
        <button
          ref={field}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={selected ? `${label}: ${selected.name}` : label}
          className={`cc-input cc-pick-field cc-pick-button${open ? " cc-pick-field--open" : ""}`}
          disabled={disabled}
          onClick={() => (open ? close() : show())}
          onKeyDown={onKey}
        >
          <span className={selected ? "cc-pick-value" : "cc-pick-placeholder"}>
            {selected?.name || placeholder}
          </span>
          <ChevronDown size={14} className="cc-pick-icon" aria-hidden="true" />
        </button>
      )}
      {popover}
    </div>
  );
}
