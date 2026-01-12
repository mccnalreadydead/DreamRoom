import { useEffect, useMemo, useState } from "react";

type NotesMap = Record<string, string>; // key: YYYY-MM-DD -> note text

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, mIndex: number, d: number) {
  // mIndex is 0-11
  return `${y}-${pad2(mIndex + 1)}-${pad2(d)}`;
}

function loadNotes(): NotesMap {
  try {
    const raw = localStorage.getItem("calendarNotes");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveNotes(notes: NotesMap) {
  localStorage.setItem("calendarNotes", JSON.stringify(notes));
  window.dispatchEvent(new Event("ad-storage-updated"));
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SalesCalendar() {
  const today = new Date();

  const [notes, setNotes] = useState<NotesMap>({});
  const [year, setYear] = useState<number>(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState<number>(today.getMonth()); // 0-11

  // editor modal/state
  const [selectedDate, setSelectedDate] = useState<string>(""); // YYYY-MM-DD
  const [editorValue, setEditorValue] = useState<string>("");

  useEffect(() => {
    setNotes(loadNotes());

    const onUpdate = () => setNotes(loadNotes());
    window.addEventListener("ad-storage-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("ad-storage-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

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

  function saveEditor() {
    if (!selectedDate) return;
    const next = { ...notes };

    const trimmed = editorValue.trim();
    if (!trimmed) {
      delete next[selectedDate];
    } else {
      next[selectedDate] = trimmed;
    }

    setNotes(next);
    saveNotes(next);
    closeEditor();
  }

  function clearNote() {
    if (!selectedDate) return;
    const next = { ...notes };
    delete next[selectedDate];
    setNotes(next);
    saveNotes(next);
    closeEditor();
  }

  // Build calendar grid
  const grid = useMemo(() => {
    const firstDay = new Date(year, monthIndex, 1);
    const startWeekday = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    // previous month
    const prevMonthDays = new Date(year, monthIndex, 0).getDate();

    const cells: Array<{
      y: number;
      m: number; // 0-11
      d: number;
      inMonth: boolean;
      key: string; // YYYY-MM-DD
      isToday: boolean;
      note: string;
    }> = [];

    // 42 cells (6 weeks) so it always looks like a real calendar
    for (let i = 0; i < 42; i++) {
      const dayNum = i - startWeekday + 1;

      let y = year;
      let m = monthIndex;
      let d = dayNum;
      let inMonth = true;

      if (dayNum < 1) {
        // previous month
        inMonth = false;
        const prev = new Date(year, monthIndex - 1, 1);
        y = prev.getFullYear();
        m = prev.getMonth();
        d = prevMonthDays + dayNum;
      } else if (dayNum > daysInMonth) {
        // next month
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

  const yearOptions = useMemo(() => {
    // simple range around current year
    const base = today.getFullYear();
    const arr: number[] = [];
    for (let y = base - 5; y <= base + 5; y++) arr.push(y);
    return arr;
  }, [today]);

  return (
    <div className="page">
      <style>{`
        /* Make controls and calendar easier on mobile */
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
          top: 70px; /* below your top nav bar */
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

        /* Day cells default (desktop/tablet) */
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

        /* Better tap targets on mobile */
        @media (max-width: 700px) {
          .calHeaderRow {
            flex-direction: column;
            align-items: flex-start;
          }

          .calControls {
            width: 100%;
            justify-content: space-between;
          }

          .calControls .input {
            width: 100% !important;
          }

          .weekdaySticky {
            top: 92px; /* a bit lower on mobile due to stacked tabs */
            padding: 10px;
          }

          .dayCell {
            min-height: 104px;
            padding: 12px;
          }

          .dayNum {
            font-size: 18px !important;
          }

          .notePreview {
            font-size: 13px !important;
          }

          button.btn {
            min-height: 44px;
            padding: 10px 12px;
          }

          select.input, textarea.input, input.input {
            min-height: 44px;
            font-size: 16px; /* prevents iOS zoom */
          }
        }

        /* Very small phones: slightly tighter grid gaps */
        @media (max-width: 420px) {
          .weekdayGrid, .daysGrid { gap: 6px; }
          .dayCell { min-height: 96px; padding: 10px; }
        }
      `}</style>

      <div className="calHeaderRow">
        <h1 style={{ margin: 0 }}>Sales Calendar</h1>

        <div className="calControls">
          <button className="btn" onClick={goPrevMonth}>
            ◀
          </button>

          <select
            className="input"
            style={{ width: 170 }}
            value={monthIndex}
            onChange={(e) => setMonthIndex(Number(e.target.value))}
          >
            {MONTHS.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>

          <select
            className="input"
            style={{ width: 120 }}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button className="btn" onClick={goNextMonth}>
            ▶
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        Tap any day to add a note. Notes auto-save to this browser (local).
      </p>

      <div className="card" style={{ padding: 12 }}>
        {/* Weekday header (sticky on mobile) */}
        <div className="weekdaySticky" style={{ marginBottom: 10 }}>
          <div className="weekdayGrid">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="muted"
                style={{ fontWeight: 800, textAlign: "center" }}
              >
                {w}
              </div>
            ))}
          </div>
        </div>

        {/* Calendar grid */}
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
                  background: hasNote
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.0)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <div
                    className="dayNum"
                    style={{ fontWeight: 900, color: "#ffffff", fontSize: 16 }}
                  >
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
                  {hasNote
                    ? cell.note
                    : " "}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Note editor (simple modal) */}
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
          <div
            className="card"
            style={{ width: "min(720px, 100%)", padding: 14 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Note for {selectedDate}</h2>
              <button className="btn" onClick={closeEditor}>
                Close
              </button>
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
              <button className="btn primary" onClick={saveEditor}>
                Save Note
              </button>
              <button className="btn" onClick={clearNote}>
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
