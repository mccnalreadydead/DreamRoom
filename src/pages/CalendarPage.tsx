import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type NotesMap = Record<string, string>; // key: YYYY-MM-DD -> note text

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, mIndex: number, d: number) {
  return `${y}-${pad2(mIndex + 1)}-${pad2(d)}`;
}

function loadNotesLocal(): NotesMap {
  try {
    const raw = localStorage.getItem("calendarNotes");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveNotesLocal(notes: NotesMap) {
  localStorage.setItem("calendarNotes", JSON.stringify(notes));
  window.dispatchEvent(new Event("ad-storage-updated"));
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SalesCalendar() {
  const today = new Date();

  const [notes, setNotes] = useState<NotesMap>({});
  const [year, setYear] = useState<number>(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState<number>(today.getMonth()); // 0-11

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // editor modal/state
  const [selectedDate, setSelectedDate] = useState<string>(""); // YYYY-MM-DD
  const [editorValue, setEditorValue] = useState<string>("");

  // Build calendar grid (we use this to know the visible date range)
  const grid = useMemo(() => {
    const firstDay = new Date(year, monthIndex, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const prevMonthDays = new Date(year, monthIndex, 0).getDate();

    const cells: Array<{
      y: number;
      m: number;
      d: number;
      inMonth: boolean;
      key: string;
      isToday: boolean;
      note: string;
    }> = [];

    for (let i = 0; i < 42; i++) {
      const dayNum = i - startWeekday + 1;

      let y = year;
      let m = monthIndex;
      let d = dayNum;
      let inMonth = true;

      if (dayNum < 1) {
        inMonth = false;
        const prev = new Date(year, monthIndex - 1, 1);
        y = prev.getFullYear();
        m = prev.getMonth();
        d = prevMonthDays + dayNum;
      } else if (dayNum > daysInMonth) {
        inMonth = false;
        const nxt = new Date(year, monthIndex + 1, 1);
        y = nxt.getFullYear();
        m = nxt.getMonth();
        d = dayNum - daysInMonth;
      }

      const key = isoDate(y, m, d);
      const isToday =
        y === today.getFullYear() &&
        m === today.getMonth() &&
        d === today.getDate();

      cells.push({
        y,
        m,
        d,
        inMonth,
        key,
        isToday,
        note: notes[key] ?? "",
      });
    }

    return cells;
  }, [year, monthIndex, notes]);

  const visibleRange = useMemo(() => {
    const first = grid[0]?.key;
    const last = grid[grid.length - 1]?.key;
    return { first, last };
  }, [grid]);

  async function loadNotesFromDB(first: string, last: string) {
    setLoading(true);
    setErr("");
    try {
      // load a local cache first (instant UI)
      const cached = loadNotesLocal();
      setNotes(cached);

      const { data, error } = await supabase
        .from("calendar_notes")
        .select("day,note")
        .gte("day", first)
        .lte("day", last);

      if (error) throw error;

      const next: NotesMap = { ...cached };
      for (const row of data ?? []) {
        const k = String((row as any).day);
        next[k] = String((row as any).note ?? "");
      }

      setNotes(next);
      saveNotesLocal(next);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      // still keep local cache if DB fails
      setNotes(loadNotesLocal());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial load (and whenever month changes)
    if (visibleRange.first && visibleRange.last) {
      void loadNotesFromDB(visibleRange.first, visibleRange.last);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthIndex, visibleRange.first, visibleRange.last]);

  function goPrevMonth() {
    const d = new Date(year, monthIndex - 1, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
  }

  function goNextMonth() {
    const d = new Date(year, monthIndex + 1, 1);
    setYear(d.getFullYear());
    setMonthIndex(d.getMonth());
  }

  function openDay(dateKey: string) {
    setSelectedDate(dateKey);
    setEditorValue(notes[dateKey] ?? "");
  }

  function closeEditor() {
    setSelectedDate("");
    setEditorValue("");
  }

  async function saveEditor() {
    if (!selectedDate) return;

    const trimmed = editorValue.trim();
    const next = { ...notes };

    setErr("");

    try {
      if (!trimmed) {
        // delete note
        delete next[selectedDate];
        setNotes(next);
        saveNotesLocal(next);

        const { error } = await supabase.from("calendar_notes").delete().eq("day", selectedDate);
        if (error) throw error;

        closeEditor();
        return;
      }

      // upsert note
      next[selectedDate] = trimmed;
      setNotes(next);
      saveNotesLocal(next);

      const { error } = await supabase
        .from("calendar_notes")
        .upsert([{ day: selectedDate, note: trimmed }], { onConflict: "day" });

      if (error) throw error;

      closeEditor();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function clearNote() {
    if (!selectedDate) return;

    setErr("");
    const next = { ...notes };
    delete next[selectedDate];
    setNotes(next);
    saveNotesLocal(next);

    const { error } = await supabase.from("calendar_notes").delete().eq("day", selectedDate);
    if (error) setErr(error.message);

    closeEditor();
  }

  const yearOptions = useMemo(() => {
    const base = today.getFullYear();
    const arr: number[] = [];
    for (let y = base - 5; y <= base + 5; y++) arr.push(y);
    return arr;
  }, [today]);

  return (
    <div className="page">
      <style>{`
        .calHeaderRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .calControls {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
        }

        .weekdaySticky {
          position: sticky;
          top: 70px;
          z-index: 10;
          background: rgba(10,10,10,0.85);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 12px;
          padding: 8px;
        }

        .weekdayGrid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
        }

        .daysGrid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
        }

        .dayCell {
          text-align: left;
          padding: 10px;
          min-height: 90px;
          cursor: pointer;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.0);
          color: #fff;
        }

        @media (max-width: 700px) {
          .calHeaderRow { flex-direction: column; align-items: flex-start; }
          .calControls { width: 100%; justify-content: space-between; }
          .calControls .input { width: 100% !important; }
          .weekdaySticky { top: 92px; padding: 10px; }
          .dayCell { min-height: 104px; padding: 12px; }
          .dayNum { font-size: 18px !important; }
          .notePreview { font-size: 13px !important; }
          button.btn { min-height: 44px; padding: 10px 12px; }
          select.input, textarea.input, input.input { min-height: 44px; font-size: 16px; }
        }

        @media (max-width: 420px) {
          .weekdayGrid, .daysGrid { gap: 6px; }
          .dayCell { min-height: 96px; padding: 10px; }
        }
      `}</style>

      <div className="calHeaderRow">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Sales Calendar</h1>
          <span className="muted" style={{ fontSize: 12 }}>
            {loading ? "Loading…" : "Saved to cloud"}
          </span>
        </div>

        <div className="calControls">
          <button className="btn" onClick={goPrevMonth}>◀</button>

          <select
            className="input"
            style={{ width: 170 }}
            value={monthIndex}
            onChange={(e) => setMonthIndex(Number(e.target.value))}
          >
            {MONTHS.map((name, idx) => (
              <option key={name} value={idx}>{name}</option>
            ))}
          </select>

          <select
            className="input"
            style={{ width: 120 }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button className="btn" onClick={goNextMonth}>▶</button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        Tap any day to add a note. Notes save to your Supabase database.
      </p>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)", marginTop: 12 }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      <div className="card" style={{ padding: 12 }}>
        <div className="weekdaySticky" style={{ marginBottom: 10 }}>
          <div className="weekdayGrid">
            {WEEKDAYS.map((w) => (
              <div key={w} className="muted" style={{ fontWeight: 800, textAlign: "center" }}>
                {w}
              </div>
            ))}
          </div>
        </div>

        <div className="daysGrid">
          {grid.map((cell) => {
            const hasNote = !!cell.note?.trim();

            return (
              <button
                key={cell.key}
                className="dayCell"
                onClick={() => openDay(cell.key)}
                style={{
                  opacity: cell.inMonth ? 1 : 0.45,
                  border: cell.isToday
                    ? "1px solid rgba(255,255,255,0.45)"
                    : "1px solid rgba(255,255,255,0.08)",
                  background: hasNote ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.0)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div className="dayNum" style={{ fontWeight: 900, color: "#ffffff", fontSize: 16 }}>
                    {cell.d}
                  </div>

                  {hasNote ? (
                    <span className="pill" style={{ fontSize: 12 }}>
                      NOTE
                    </span>
                  ) : null}
                </div>

                <div
                  className="muted notePreview"
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    lineHeight: 1.25,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {hasNote ? cell.note : " "}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 50,
          }}
          onClick={closeEditor}
        >
          <div className="card" style={{ width: "min(720px, 100%)", padding: 14 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Note for {selectedDate}</h2>
              <button className="btn" onClick={closeEditor}>Close</button>
            </div>

            <label className="label" style={{ marginTop: 10 }}>
              Your note
            </label>
            <textarea
              className="input"
              style={{ height: 160, resize: "vertical" }}
              value={editorValue}
              onChange={(e) => setEditorValue(e.target.value)}
              placeholder="Example: Customer wants SM7B. Meet at 6pm. Bring cash app info."
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button className="btn primary" onClick={() => void saveEditor()}>
                Save Note
              </button>
              <button className="btn" onClick={() => void clearNote()}>
                Delete Note
              </button>
            </div>

            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Tip: leaving it blank and saving will remove the note.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
