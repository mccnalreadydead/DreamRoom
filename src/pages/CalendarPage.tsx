import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type CalNoteRow = {
  id?: number;
  note_date: string; // YYYY-MM-DD (DATE in DB)
  bullets: string[] | null; // text[] in DB (recommended) OR we handle fallback
  details?: string | null; // optional text column
  updated_at?: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, mIndex: number, d: number) {
  return `${y}-${pad2(mIndex + 1)}-${pad2(d)}`;
}

function todayISO() {
  const d = new Date();
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

function monthName(mi: number) {
  return new Date(2000, mi, 1).toLocaleString(undefined, { month: "long" });
}

function cleanBullets(lines: string[]) {
  return lines
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0)
    .slice(0, 25);
}

export default function CalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth()); // 0-11
  const [year, setYear] = useState<number>(now.getFullYear());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // loaded notes for visible month
  const [notes, setNotes] = useState<Record<string, CalNoteRow>>({});

  // modal
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draftBullets, setDraftBullets] = useState<string>(""); // textarea bullets
  const [draftDetails, setDraftDetails] = useState<string>("");

  const monthStart = useMemo(() => {
    const d = new Date(year, month, 1);
    return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  }, [year, month]);

  const monthEndExclusive = useMemo(() => {
    const d = new Date(year, month + 1, 1);
    return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
  }, [year, month]);

  async function loadMonth() {
    setLoading(true);
    setErr("");
    try {
      const res = await supabase
        .from("calendar_notes")
        .select("id,note_date,bullets,details,updated_at")
        .gte("note_date", monthStart)
        .lt("note_date", monthEndExclusive)
        .order("note_date", { ascending: true });

      if (res.error) throw res.error;

      const map: Record<string, CalNoteRow> = {};
      for (const r of (res.data as any[]) ?? []) {
        const key = String(r.note_date);
        // bullets could come back null or as array
        const b = Array.isArray(r.bullets) ? (r.bullets as string[]) : null;
        map[key] = { ...r, note_date: key, bullets: b };
      }
      setNotes(map);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  // calendar grid math
  const grid = useMemo(() => {
    const first = new Date(year, month, 1);
    const firstDow = first.getDay(); // 0 Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // We’ll render 6 weeks (42 cells) for consistent layout
    const cells: { iso: string; day: number; inMonth: boolean }[] = [];
    let dayNum = 1 - firstDow;

    for (let i = 0; i < 42; i++) {
      const d = new Date(year, month, dayNum);
      const inMonth = d.getMonth() === month;
      cells.push({ iso: isoDate(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth });
      dayNum++;
    }
    return cells;
  }, [year, month]);

  function openDay(iso: string) {
    setErr("");
    setSelectedDate(iso);

    const existing = notes[iso];
    const bullets = existing?.bullets ?? [];
    setDraftBullets((bullets ?? []).join("\n"));
    setDraftDetails(String(existing?.details ?? ""));
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  async function saveNote() {
    if (!selectedDate) {
      setErr("No date selected.");
      return;
    }

    setLoading(true);
    setErr("");

    const bullets = cleanBullets(draftBullets.split("\n"));
    const details = String(draftDetails ?? "").trim();

    // ✅ IMPORTANT: never allow null note_date
    const payload: CalNoteRow = {
      note_date: selectedDate,
      bullets: bullets.length ? bullets : [],
      details: details.length ? details : null,
    };

    try {
      // Use upsert so same date is updated (requires UNIQUE constraint on note_date recommended)
      const res = await supabase.from("calendar_notes").upsert(payload as any, { onConflict: "note_date" }).select();

      if (res.error) throw res.error;

      // update local map
      setNotes((prev) => ({
        ...prev,
        [selectedDate]: {
          ...(prev[selectedDate] ?? {}),
          note_date: selectedDate,
          bullets: payload.bullets ?? [],
          details: payload.details ?? null,
        },
      }));

      setOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteNote() {
    if (!selectedDate) return;

    const ok = confirm("Delete this event note?");
    if (!ok) return;

    setLoading(true);
    setErr("");
    try {
      const res = await supabase.from("calendar_notes").delete().eq("note_date", selectedDate);
      if (res.error) throw res.error;

      setNotes((prev) => {
        const next = { ...prev };
        delete next[selectedDate];
        return next;
      });

      setOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const monthLabel = `${monthName(month)} ${year}`;

  return (
    <div className="page cal-page">
      <style>{`
        .cal-top{
          display:flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .cal-right{
          display:flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items:center;
          justify-content:flex-end;
        }
        .cal-select{
          min-width: 220px;
          height: 40px;
        }

        .cal-card{
          margin-top: 12px;
          padding: 12px;
        }

        .cal-grid{
          display:grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 10px;
          margin-top: 10px;
        }

        .cal-dow{
          text-align:center;
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,0.70);
          padding: 6px 0;
        }

        .day{
          position: relative;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(10,10,16,0.45);
          min-height: 72px;
          padding: 10px;
          cursor: pointer;
          transition: transform .12s ease, border-color .12s ease, background .12s ease, box-shadow .12s ease;
          overflow: hidden;
        }
        .day:hover{
          transform: translateY(-1px);
          border-color: rgba(152,90,255,0.28);
          box-shadow: 0 16px 34px rgba(0,0,0,0.30);
        }

        .day.out{
          opacity: 0.45;
        }

        .daynum{
          font-weight: 950;
          font-size: 14px;
          color: rgba(255,255,255,0.92);
        }

        /* ✅ event indicator: dot + subtle highlight */
        .day.hasEvent{
          border-color: rgba(152,90,255,0.26);
          background: linear-gradient(180deg, rgba(152,90,255,0.10), rgba(10,10,16,0.45));
        }
        .dot{
          position:absolute;
          top: 10px;
          right: 10px;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: rgba(255,255,255,0.85);
          box-shadow: 0 0 14px rgba(152,90,255,0.35);
          opacity: 0.9;
        }

        .todayRing{
          position:absolute;
          inset: 6px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 0 0 3px rgba(152,90,255,0.10);
          pointer-events:none;
        }

        /* Modal */
        .overlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.72);
          display:flex;
          align-items:center;
          justify-content:center;
          padding: 14px;
          z-index: 80;
        }
        .modal{
          width: min(780px, 100%);
          padding: 14px;
          border-radius: 18px;
        }
        .modalGrid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 12px;
        }
        .label{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.70);
          margin-bottom: 6px;
        }

        textarea.input{
          min-height: 130px;
        }

        .hint{
          font-size: 12px;
          color: rgba(255,255,255,0.60);
          margin-top: 8px;
        }

        @media (max-width: 820px){
          .cal-select{ min-width: 160px; }
          .cal-grid{ gap: 8px; }
          .day{ min-height: 66px; padding: 9px; }
          .modalGrid{ grid-template-columns: 1fr; }
          input.input, select.input, textarea.input{ font-size: 16px; } /* iOS zoom fix */
        }
      `}</style>

      <div className="row cal-top">
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Event Calendar</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            Tap a day to add bullets (mobile-safe).
          </div>
        </div>

        <div className="cal-right">
          <select className="input cal-select" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i} value={String(i)}>
                {monthName(i)}
              </option>
            ))}
          </select>

          <select className="input cal-select" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 7 }).map((_, i) => {
              const y = now.getFullYear() - 3 + i;
              return (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              );
            })}
          </select>

          <button className="btn" type="button" onClick={() => void loadMonth()} disabled={loading} title="Refresh">
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        Viewing: <b>{monthLabel}</b>
      </div>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)", marginTop: 12 }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      <div className="card cal-card">
        <div className="cal-grid" style={{ marginTop: 0 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="cal-dow">
              {d}
            </div>
          ))}
        </div>

        <div className="cal-grid">
          {grid.map((c) => {
            const has = (notes[c.iso]?.bullets?.length ?? 0) > 0 || (notes[c.iso]?.details?.trim?.()?.length ?? 0) > 0;
            const isToday = c.iso === todayISO();
            return (
              <div
                key={c.iso}
                className={`day ${c.inMonth ? "" : "out"} ${has ? "hasEvent" : ""}`}
                onClick={() => openDay(c.iso)}
                title={has ? "Has event" : "Add event"}
              >
                <div className="daynum">{c.day}</div>
                {has ? <div className="dot" /> : null}
                {isToday ? <div className="todayRing" /> : null}
              </div>
            );
          })}
        </div>
      </div>

      {open && selectedDate ? (
        <div className="overlay" onClick={closeModal}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h2 style={{ margin: 0 }}>Event — {selectedDate}</h2>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  Bullets show as a dot on the calendar. Keeps mobile clean.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn" type="button" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>

            <div className="modalGrid">
              <div>
                <div className="label">Bullets (one per line)</div>
                <textarea
                  className="input"
                  value={draftBullets}
                  onChange={(e) => setDraftBullets(e.target.value)}
                  placeholder={`Example:\n• Meet Chad @ 3pm\n• Bring WA-87\n• Follow up on pricing`}
                />
                <div className="hint">Tip: keep each bullet short — the calendar stays clean.</div>
              </div>

              <div>
                <div className="label">Details (optional)</div>
                <textarea
                  className="input"
                  value={draftDetails}
                  onChange={(e) => setDraftDetails(e.target.value)}
                  placeholder="Extra context, address, links, etc."
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn primary" type="button" onClick={() => void saveNote()} disabled={loading}>
                {loading ? "Saving…" : "Save Event"}
              </button>
              <button className="btn" type="button" onClick={() => void deleteNote()} disabled={loading}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
