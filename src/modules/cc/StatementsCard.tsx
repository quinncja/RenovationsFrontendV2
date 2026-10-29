import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Widget } from "../../shared/components/Widget/Widget";
import { SkelText } from "../../shared/components/SkelText";
import { staffRequest } from "./staffApi";
import { addDays, iso, mondayOf, short, weekRange } from "./statementWeeks";

export interface StatementSummary {
  id: string;
  weekStart: string;
  weekEnd: string;
  by: string;
  at: string;
}

// Card intake went live the week of Sep 28; no statements before it.
const FIRST_WEEK = "2026-09-28";
const WEEKS = 5;

// The weekly statements card: what to do, and which recent weeks are done.
export function StatementsCard({
  version,
  onUpload,
}: {
  /** Bumped after an upload so the card re-reads its weeks. */
  version: number;
  /** Opens the upload, for one week when a week was picked. */
  onUpload: (week?: string) => void;
}) {
  const [list, setList] = useState<StatementSummary[] | null>(null);
  useEffect(() => {
    let alive = true;
    staffRequest<StatementSummary[]>("cc/statements")
      .then((x) => alive && setList(x))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [version]);

  const thisWeek = mondayOf(iso(new Date()));
  const lastWeek = addDays(thisWeek, -7);
  // Newest first: this week, then last week, then back.
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(thisWeek, -7 * i)).filter(
    (w) => w >= FIRST_WEEK,
  );
  // Newest upload per week (the list arrives newest first).
  const done = (w: string) => list?.find((s) => s.weekStart === w);

  return (
    <Widget
      className="cc-wks-card"
      title="Weekly statements"
      description="Every Monday, click last week below and upload its Capital One transactions. Each charge is checked against its receipt, and anything different is fixed in one step."
    >
      <div className="cc-wks" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w) => {
          const s = done(w);
          const current = w === thisWeek;
          const tone = !list ? "" : s ? "done" : current ? "open" : "due";
          return (
            <button
              type="button"
              key={w}
              className={`cc-wk${tone === "due" ? " cc-wk--due" : ""}${tone === "open" ? " cc-wk--open" : ""}`}
              // The current week isn't over, so there's no statement to upload yet.
              disabled={current}
              onClick={() => onUpload(w)}
              aria-label={current ? `${weekRange(w)}, this week` : `Upload the ${weekRange(w)} statement`}
            >
              <span className="cc-wk-label">{weekRange(w)}</span>
              {!list ? (
                <>
                  <span className="cc-wk-state">
                    <SkelText ch={10} />
                  </span>
                  <span className="cc-wk-meta">
                    <SkelText ch={14} />
                  </span>
                </>
              ) : s ? (
                <>
                  <span className="cc-wk-state cc-wk-state--done">
                    <Check size={14} strokeWidth={2.6} aria-hidden="true" /> Reconciled
                  </span>
                  <span className="cc-wk-meta">
                    {short(iso(new Date(s.at)))}
                    {s.by ? ` · ${s.by}` : ""}
                  </span>
                </>
              ) : current ? (
                <>
                  <span className="cc-wk-state">
                    <span className="cc-wk-dot" aria-hidden="true" /> This week
                  </span>
                  <span className="cc-wk-meta">Upload next Monday</span>
                </>
              ) : (
                <>
                  <span className="cc-wk-state cc-wk-state--due">
                    <span className="cc-wk-dot" aria-hidden="true" /> Ready to upload
                  </span>
                  <span className="cc-wk-meta">
                    {w === lastWeek ? "The week is over" : "Not uploaded yet"}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </Widget>
  );
}
