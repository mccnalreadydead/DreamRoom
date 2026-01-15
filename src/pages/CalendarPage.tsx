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

    // We’ll render 6 weeks (42 cells) for consistent layout
    const cells: { iso: string; day: number; inMonth: boolean }[] = [];
    let dayNum = 1 - firstDow;

    for (let i = 0; i < 42; i++) {
      const d = new Date(year, month, dayNum);
      const inMonth = d.getMonth() === month;
      cells.push({
        iso: isoDate(d.getFullYear(), d.getMonth(), d.getDate()),
        day: d.getDate(),
        inMonth,
      });
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
    <div className="page cal-page cal-earth">
      <style>{`
        /* =========================================================
           EARTH / MOUNTAIN VISUAL THEME (APPEARANCE ONLY)
           Very prominent, obvious, and "alive"
           ========================================================= */

        .cal-earth{
          position: relative;
          isolation: isolate;
          overflow: hidden;
        }
        .cal-earth > *{
          position: relative;
          z-index: 2;
        }

        /* Giant atmospheric aura + earth tones */
        .cal-earth::before{
          content:"";
          position:absolute;
          inset:-60px;
          z-index:0;
          pointer-events:none;

          background:
            radial-gradient(1200px 700px at 18% 0%, rgba(212,175,55,0.20), transparent 62%),
            radial-gradient(950px 640px at 88% 16%, rgba(170,95,30,0.22), transparent 64%),
            radial-gradient(1100px 760px at 50% 120%, rgba(95,55,25,0.32), transparent 62%),
            radial-gradient(780px 520px at 50% 45%, rgba(120,70,30,0.14), transparent 62%),
            linear-gradient(180deg, rgba(18,14,10,0.45), rgba(0,0,0,0.12));

          filter: blur(14px) saturate(1.15);
          mix-blend-mode: screen;
          opacity: 0.95;
          animation: calEarthPulse 6.6s ease-in-out infinite;
          transform: translateZ(0);
        }

        /* Mountains + fog + drifting dust */
        .cal-earth::after{
          content:"";
          position:absolute;
          inset:-80px;
          z-index:1;
          pointer-events:none;

          background:
            /* mountain silhouettes */
            radial-gradient(900px 420px at 18% 92%, rgba(0,0,0,0.58), transparent 70%),
            radial-gradient(1100px 520px at 60% 108%, rgba(0,0,0,0.62), transparent 70%),
            radial-gradient(900px 420px at 92% 96%, rgba(0,0,0,0.56), transparent 72%),

            /* fog veil */
            radial-gradient(900px 420px at 50% 84%, rgba(255,255,255,0.06), transparent 70%),
            radial-gradient(1100px 540px at 50% 96%, rgba(255,255,255,0.04), transparent 72%),

            /* drifting dust specks */
            radial-gradient(circle, rgba(255,220,170,0.16) 0 1px, transparent 5px),
            radial-gradient(circle, rgba(255,200,140,0.12) 0 1px, transparent 5px),
            radial-gradient(circle, rgba(255,170,95,0.10) 0 1px, transparent 5px),
            radial-gradient(circle, rgba(212,175,55,0.10) 0 1px, transparent 5px),

            /* subtle rock texture veil */
            repeating-linear-gradient(
              165deg,
              rgba(255,255,255,0.04) 0px,
              rgba(255,255,255,0.04) 1px,
              transparent 1px,
              transparent 16px
            );

          background-size:
            100% 100%,
            100% 100%,
            100% 100%,

            100% 100%,
            100% 100%,

            220px 520px,
            250px 560px,
            280px 600px,
            310px 640px,

            100% 100%;

          background-position:
            0% 0%,
            0% 0%,
            0% 0%,

            0% 0%,
            0% 0%,

            20% -80%,
            52% -120%,
            76% -100%,
            92% -140%,

            0% 0%;

          mix-blend-mode: screen;
          opacity: 0.85;
          filter: blur(0.14px) saturate(1.15);
          transform: translateZ(0);

          animation:
            calDustFallFast 1.05s linear infinite,
            calDustFallSlow 2.15s linear infinite,
            calDustDrift 1.25s ease-in-out infinite,
            calFogBreath 5.8s ease-in-out infinite;
        }

        @keyframes calEarthPulse{
          0%   { transform: translate3d(0px,0px,0px) scale(1); opacity: 0.86; filter: blur(14px) saturate(1.08); }
          40%  { transform: translate3d(10px,-6px,0px) scale(1.03); opacity: 0.98; filter: blur(15px) saturate(1.22); }
          70%  { transform: translate3d(-8px,4px,0px) scale(1.02); opacity: 0.94; filter: blur(16px) saturate(1.18); }
          100% { transform: translate3d(0px,0px,0px) scale(1); opacity: 0.86; filter: blur(14px) saturate(1.08); }
        }

        @keyframes calDustFallFast{
          0%{
            background-position:
              0% 0%,
              0% 0%,
              0% 0%,

              0% 0%,
              0% 0%,

              20% -80%,
              52% -120%,
              76% -100%,
              92% -140%,

              0% 0%;
          }
          100%{
            background-position:
              0% 0%,
              0% 0%,
              0% 0%,

              0% 0%,
              0% 0%,

              20% 340%,
              52% 360%,
              76% 350%,
              92% 380%,

              0% 0%;
          }
        }

        @keyframes calDustFallSlow{
          0%{ filter: blur(0.12px) saturate(1.10); }
          100%{ filter: blur(0.18px) saturate(1.28); }
        }

        @keyframes calDustDrift{
          0%{ transform: translate3d(0px,0px,0px); }
          25%{ transform: translate3d(10px,-2px,0px); }
          50%{ transform: translate3d(-12px,1px,0px); }
          75%{ transform: translate3d(8px,2px,0px); }
          100%{ transform: translate3d(0px,0px,0px); }
        }

        @keyframes calFogBreath{
          0%,100%{ opacity: 0.78; }
          50%{ opacity: 0.92; }
        }

        @media (prefers-reduced-motion: reduce){
          .cal-earth::before,
          .cal-earth::after{
            animation:none !important;
          }
        }

        /* =========================================================
           TITLE: ROCK / STONE EFFECT (APPEARANCE ONLY)
           ========================================================= */
        .cal-rockTitle{
          margin: 0;
          font-weight: 1000;
          letter-spacing: 0.6px;

          background:
            radial-gradient(18px 18px at 18% 38%, rgba(255,255,255,0.22), transparent 62%),
            radial-gradient(16px 16px at 72% 42%, rgba(255,255,255,0.18), transparent 62%),
            radial-gradient(14px 14px at 45% 70%, rgba(255,255,255,0.10), transparent 62%),
            linear-gradient(180deg, rgba(240,230,215,0.95), rgba(195,170,140,0.88) 45%, rgba(120,85,55,0.92));

          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;

          text-shadow:
            0 2px 0 rgba(0,0,0,0.50),
            0 10px 28px rgba(0,0,0,0.55),
            0 0 26px rgba(212,175,55,0.12),
            0 0 18px rgba(170,95,30,0.14);
          position: relative;
        }

        /* “carved edge” outline using text-shadow style */
        .cal-rockTitle::after{
          content:"";
          position:absolute;
          inset:-2px -2px -2px -2px;
          pointer-events:none;
          filter: blur(0.3px);
        }

        /* =========================================================
           Top layout
           ========================================================= */
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

        /* =========================================================
           Month/Year selects: glowing brown rock effect
           (appearance only; keeps same markup)
           ========================================================= */
        .cal-select{
          min-width: 220px;
          height: 40px;

          border-radius: 16px !important;
          border: 1px solid rgba(255,255,255,0.14) !important;

          background:
            radial-gradient(220px 120px at 20% 15%, rgba(255,220,170,0.12), transparent 62%),
            radial-gradient(260px 140px at 82% 60%, rgba(170,95,30,0.16), transparent 64%),
            linear-gradient(180deg, rgba(30,18,10,0.82), rgba(8,8,12,0.65)) !important;

          box-shadow:
            0 0 0 1px rgba(255,255,255,0.03) inset,
            0 14px 40px rgba(0,0,0,0.35),
            0 0 22px rgba(170,95,30,0.14),
            0 0 18px rgba(212,175,55,0.10) !important;

          color: rgba(255,255,255,0.92) !important;
          font-weight: 950 !important;

          transition: transform .12s ease, box-shadow .18s ease, border-color .14s ease, filter .14s ease;
        }

        .cal-select:focus{
          outline: none !important;
          border-color: rgba(212,175,55,0.35) !important;
          box-shadow:
            0 0 0 2px rgba(212,175,55,0.12),
            0 18px 55px rgba(0,0,0,0.45),
            0 0 28px rgba(170,95,30,0.20),
            0 0 22px rgba(212,175,55,0.14) !important;
          filter: saturate(1.12) brightness(1.08);
        }

        /* Calendar card gets “mountain rock” framing glow */
        .cal-card{
          margin-top: 12px;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(900px 340px at 20% 0%, rgba(212,175,55,0.06), transparent 62%),
            radial-gradient(900px 340px at 85% 30%, rgba(170,95,30,0.08), transparent 66%),
            rgba(0,0,0,0.22);
          box-shadow:
            0 18px 70px rgba(0,0,0,0.42),
            0 0 0 1px rgba(255,255,255,0.03) inset;
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
          font-weight: 950;
          color: rgba(255,235,210,0.72);
          padding: 6px 0;
          text-shadow: 0 10px 22px rgba(0,0,0,0.45);
        }

        /* =========================================================
           Day tiles: mountain/stone vibe (appearance only)
           Shimmer event style is kept and left intact below
           ========================================================= */
        .day{
          position: relative;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);

          background:
            radial-gradient(260px 120px at 18% 10%, rgba(255,235,200,0.08), transparent 62%),
            radial-gradient(320px 160px at 85% 60%, rgba(170,95,30,0.10), transparent 66%),
            linear-gradient(180deg, rgba(12,10,10,0.55), rgba(6,6,10,0.42));

          min-height: 72px;
          padding: 10px;
          cursor: pointer;
          transition: transform .12s ease, border-color .12s ease, background .12s ease, box-shadow .12s ease, filter .12s ease;
          overflow: hidden;

          box-shadow:
            0 12px 36px rgba(0,0,0,0.22),
            0 0 0 1px rgba(255,255,255,0.02) inset;
        }
        .day:hover{
          transform: translateY(-1px);
          border-color: rgba(212,175,55,0.22);
          box-shadow: 0 18px 46px rgba(0,0,0,0.30), 0 0 24px rgba(170,95,30,0.10);
          filter: saturate(1.10) brightness(1.06);
        }

        .day.out{
          opacity: 0.45;
        }

        .daynum{
          font-weight: 950;
          font-size: 14px;
          color: rgba(255,255,255,0.92);
          text-shadow: 0 10px 20px rgba(0,0,0,0.45);
        }

        /* ✅ event indicator: SHINY + MOVING (UNCHANGED) */
        .day.hasEvent{
          border-color: rgba(255,255,255,0.36);
          background:
            radial-gradient(420px 180px at 30% 10%, rgba(255,255,255,0.14), transparent 60%),
            radial-gradient(520px 220px at 70% 30%, rgba(152,90,255,0.28), transparent 62%),
            linear-gradient(180deg, rgba(152,90,255,0.18), rgba(10,10,16,0.45));

          box-shadow:
            0 0 0 2px rgba(152,90,255,0.14),
            0 18px 46px rgba(0,0,0,0.40),
            0 0 26px rgba(152,90,255,0.28);

          filter: saturate(1.25) brightness(1.15);
        }

        /* moving shimmer layer */
        .day.hasEvent::before{
          content:"";
          position:absolute;
          inset:-2px;
          border-radius: 16px;
          pointer-events:none;

          background:
            linear-gradient(
              120deg,
              transparent 0%,
              rgba(255,255,255,0.00) 35%,
              rgba(255,255,255,0.22) 45%,
              rgba(255,255,255,0.05) 55%,
              transparent 70%
            );

          transform: translateX(-60%) rotate(0.001deg);
          mix-blend-mode: screen;
          opacity: 0.85;

          animation: calShineSweep 2.8s linear infinite;
        }

        /* “sparkle glints” layer */
        .day.hasEvent::after{
          content:"";
          position:absolute;
          inset:0;
          border-radius: 16px;
          pointer-events:none;

          background:
            radial-gradient(10px 10px at 18% 28%, rgba(255,255,255,0.65), transparent 60%),
            radial-gradient(12px 12px at 72% 36%, rgba(255,255,255,0.55), transparent 62%),
            radial-gradient(9px 9px at 60% 72%, rgba(152,90,255,0.65), transparent 65%),
            radial-gradient(8px 8px at 30% 78%, rgba(255,255,255,0.45), transparent 65%);

          opacity: 0.55;
          filter: blur(0.2px);
          animation: calSparkle 2.4s ease-in-out infinite;
        }

        /* extra glow when hovering the event day */
        .day.hasEvent:hover{
          border-color: rgba(255,255,255,0.52);
          box-shadow:
            0 0 0 2px rgba(152,90,255,0.18),
            0 22px 58px rgba(0,0,0,0.45),
            0 0 36px rgba(152,90,255,0.42);
          filter: saturate(1.35) brightness(1.22);
        }

        /* dot (keep it clean + bright) */
        .dot{
          position:absolute;
          left: 10px;
          bottom: 10px;

          width: 8px;
          height: 8px;
          border-radius: 999px;

          background: rgba(255,255,255,0.98);
          box-shadow:
            0 0 10px rgba(255,255,255,0.35),
            0 0 20px rgba(152,90,255,0.70);
          opacity: 0.95;
        }

        /* animations */
        @keyframes calShineSweep{
          0%   { transform: translateX(-70%) skewX(-10deg); opacity: 0.55; }
          35%  { opacity: 0.95; }
          60%  { opacity: 0.75; }
          100% { transform: translateX(70%) skewX(-10deg); opacity: 0.55; }
        }

        @keyframes calSparkle{
          0%   { opacity: 0.35; transform: scale(0.98); }
          50%  { opacity: 0.68; transform: scale(1.02); }
          100% { opacity: 0.35; transform: scale(0.98); }
        }

        /* accessibility: respect reduced motion */
        @media (prefers-reduced-motion: reduce){
          .day.hasEvent::before,
          .day.hasEvent::after{
            animation: none !important;
          }
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

          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(880px 340px at 20% 0%, rgba(212,175,55,0.08), transparent 62%),
            radial-gradient(900px 380px at 85% 20%, rgba(170,95,30,0.10), transparent 66%),
            rgba(0,0,0,0.82);
          box-shadow:
            0 24px 90px rgba(0,0,0,0.62),
            0 0 30px rgba(170,95,30,0.14);
          backdrop-filter: blur(12px);
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
          color: rgba(255,235,210,0.72);
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
          <h1 className="cal-rockTitle">Event Calendar</h1>
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
