// src/pages/Clients.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

type ClientRow = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  last_spoken_to: string | null; // YYYY-MM-DD
  notes: string | null;
  created_at?: string | null;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clean(s: any) {
  const v = String(s ?? "").trim();
  return v.length ? v : null;
}

function normPhone(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // keep digits + plus
  const cleaned = s.replace(/[^\d+]/g, "");
  return cleaned;
}

function isEmail(s: any) {
  const v = String(s ?? "").trim();
  return v.includes("@") && v.includes(".");
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// Escape % and _ for ILIKE patterns
function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

export default function Clients() {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // search
  const [q, setQ] = useState("");

  // pagination (30 per page)
  const PAGE_SIZE = 30;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // add/edit sheet
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [lastSpoken, setLastSpoken] = useState<string>(todayISO());
  const [notes, setNotes] = useState("");

  // toast
  const [toast, setToast] = useState<string>("");
  const toastTimer = useRef<number | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200) as unknown as number;
  }

  // ✅ Server-side: load ONLY the current page (and search results), plus total count
  async function load(opts?: { nextPage?: number; nextQ?: string }) {
    const nextPage = opts?.nextPage ?? page;
    const nextQ = (opts?.nextQ ?? q).trim();

    setLoading(true);
    setErr("");

    try {
      const from = (Math.max(1, nextPage) - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Base query: select with count so pager stays accurate
      let query = supabase
        .from("clients")
        .select("id,name,phone,email,last_spoken_to,notes,created_at", { count: "exact" })
        .order("name", { ascending: true });

      // ✅ Search across multiple fields (server-side)
      if (nextQ) {
        const safe = escapeLike(nextQ.toLowerCase());
        const pattern = `%${safe}%`;

        // Use OR with ilike across columns
        // Note: "or()" takes a string expression
        query = query.or(
          [
            `name.ilike.${pattern}`,
            `phone.ilike.${pattern}`,
            `email.ilike.${pattern}`,
            `notes.ilike.${pattern}`,
          ].join(",")
        );
      }

      const res = await query.range(from, to);

      if (res.error) throw res.error;

      setRows(((res.data as any) ?? []) as ClientRow[]);
      setTotalCount(res.count ?? 0);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    void load({ nextPage: 1, nextQ: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAdd() {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setLastSpoken(todayISO());
    setNotes("");
    setOpen(true);
  }

  function openEdit(r: ClientRow) {
    setEditing(r);
    setName(r.name ?? "");
    setPhone(r.phone ?? "");
    setEmail(r.email ?? "");
    setLastSpoken(r.last_spoken_to ?? todayISO());
    setNotes(r.notes ?? "");
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  async function save() {
    setErr("");
    setLoading(true);

    const payload = {
      name: clean(name),
      phone: clean(phone),
      email: clean(email),
      last_spoken_to: clean(lastSpoken),
      notes: clean(notes),
    };

    try {
      if (editing?.id) {
        const upd = await supabase.from("clients").update(payload).eq("id", editing.id);
        if (upd.error) throw upd.error;
      } else {
        const ins = await supabase.from("clients").insert([payload]);
        if (ins.error) throw ins.error;
      }

      setOpen(false);
      showToast(editing ? "Client updated" : "Client added");

      // Reload current view (keeps same “how it works”)
      // If you were searching, it stays in search mode.
      await load({ nextPage: 1, nextQ: q });
      setPage(1);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // ✅ Fix delete "not deleting" visually: remove locally immediately + still reload
  async function del(id: number) {
    const ok = confirm("Delete this client?");
    if (!ok) return;

    setErr("");
    setLoading(true);

    try {
      const res = await supabase.from("clients").delete().eq("id", id);
      if (res.error) throw res.error;

      // instant UI update
      setRows((prev) => prev.filter((r) => r.id !== id));
      setTotalCount((n) => Math.max(0, n - 1));

      showToast("Client deleted");

      // reload page to keep counts/paging perfect (and handle edge cases)
      // e.g., if you delete the last item on a page
      const newTotalPages = Math.max(1, Math.ceil((totalCount - 1) / PAGE_SIZE));
      const nextPage = Math.min(page, newTotalPages);
      if (nextPage !== page) setPage(nextPage);
      await load({ nextPage, nextQ: q });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      showToast("Delete failed");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Pager calculations now come from server count
  const totalPages = useMemo(() => Math.max(1, Math.ceil((totalCount || 0) / PAGE_SIZE)), [totalCount]);
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, totalPages]);

  // ✅ When q changes: keep same behavior (search still instant), but now server-based
  useEffect(() => {
    // Reset to page 1 on search change
    setPage(1);
    void load({ nextPage: 1, nextQ: q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // ✅ When page changes: load that page from server
  useEffect(() => {
    void load({ nextPage: page, nextQ: q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // For display only (current page)
  const paged = rows;

  // ✅ Copy Phones/Emails should still work for the FULL filtered result (server-side),
  // without loading all clients into the UI.
  async function fetchAllPhonesForCurrentFilter(): Promise<string[]> {
    const s = q.trim();
    let query = supabase.from("clients").select("phone").order("name", { ascending: true });
    if (s) {
      const safe = escapeLike(s.toLowerCase());
      const pattern = `%${safe}%`;
      query = query.or(
        [`name.ilike.${pattern}`, `phone.ilike.${pattern}`, `email.ilike.${pattern}`, `notes.ilike.${pattern}`].join(",")
      );
    }

    const res = await query;
    if (res.error) throw res.error;

    const list = ((res.data as any[]) ?? []).map((r) => normPhone(r?.phone)).filter((x) => x.length > 0);
    return Array.from(new Set(list));
  }

  async function fetchAllEmailsForCurrentFilter(): Promise<string[]> {
    const s = q.trim();
    let query = supabase.from("clients").select("email").order("name", { ascending: true });
    if (s) {
      const safe = escapeLike(s.toLowerCase());
      const pattern = `%${safe}%`;
      query = query.or(
        [`name.ilike.${pattern}`, `phone.ilike.${pattern}`, `email.ilike.${pattern}`, `notes.ilike.${pattern}`].join(",")
      );
    }

    const res = await query;
    if (res.error) throw res.error;

    const list = ((res.data as any[]) ?? [])
      .map((r) => String(r?.email ?? "").trim())
      .filter((x) => x.length > 0 && isEmail(x));

    return Array.from(new Set(list.map((x) => x.toLowerCase())));
  }

  async function copyPhones(mode: "lines" | "comma") {
    try {
      const allPhones = await fetchAllPhonesForCurrentFilter();
      if (!allPhones.length) return showToast("No phone numbers to copy");
      const text = mode === "lines" ? allPhones.join("\n") : allPhones.join(", ");
      const ok = await copyToClipboard(text);
      showToast(ok ? `Copied ${allPhones.length} phone(s)` : "Couldn’t copy (browser blocked)");
    } catch (e: any) {
      showToast("Couldn’t copy (query failed)");
      setErr(e?.message ?? String(e));
    }
  }

  async function copyEmails(mode: "lines" | "comma") {
    try {
      const allEmails = await fetchAllEmailsForCurrentFilter();
      if (!allEmails.length) return showToast("No emails to copy");
      const text = mode === "lines" ? allEmails.join("\n") : allEmails.join(", ");
      const ok = await copyToClipboard(text);
      showToast(ok ? `Copied ${allEmails.length} email(s)` : "Couldn’t copy (browser blocked)");
    } catch (e: any) {
      showToast("Couldn’t copy (query failed)");
      setErr(e?.message ?? String(e));
    }
  }

  // For KPIs in header (server-based)
  const shownCount = totalCount;

  return (
    <div className="page clM-page clX-purple">
      <style>{`
        /* =========================================================
           PURPLE ATMOSPHERE x10 (VERY INTENSE)
           ========================================================= */

        .clX-purple{
          position: relative;
          isolation: isolate;
          padding-bottom: calc(132px + env(safe-area-inset-bottom));
          overflow: hidden;
        }
        .clX-purple > *{ position: relative; z-index: 2; }

        .clX-purple::before{
          content:"";
          position:absolute;
          inset:-60px;
          z-index:0;
          pointer-events:none;

          background:
            radial-gradient(1400px 760px at 18% 0%, rgba(185,120,255,0.55), transparent 62%),
            radial-gradient(1200px 720px at 88% 16%, rgba(120,70,255,0.48), transparent 64%),
            radial-gradient(1200px 780px at 55% 115%, rgba(90,35,220,0.55), transparent 62%),
            radial-gradient(980px 560px at 50% 44%, rgba(255,255,255,0.12), transparent 62%),
            radial-gradient(860px 520px at 12% 82%, rgba(0,210,255,0.10), transparent 68%),
            linear-gradient(180deg, rgba(20,8,40,0.42), rgba(0,0,0,0.16)),

            radial-gradient(circle,
              rgba(255,255,255,0.18) 0 7px,
              rgba(210,150,255,0.82) 18px,
              rgba(140,90,255,0.44) 44px,
              rgba(90,35,220,0.26) 86px,
              transparent 140px),
            radial-gradient(circle,
              rgba(255,255,255,0.16) 0 7px,
              rgba(190,120,255,0.78) 18px,
              rgba(120,70,255,0.40) 42px,
              rgba(90,35,220,0.24) 84px,
              transparent 138px),
            radial-gradient(circle,
              rgba(255,255,255,0.16) 0 7px,
              rgba(220,160,255,0.76) 18px,
              rgba(150,100,255,0.40) 42px,
              rgba(95,45,230,0.24) 84px,
              transparent 138px),
            radial-gradient(circle,
              rgba(255,255,255,0.14) 0 6px,
              rgba(170,110,255,0.72) 16px,
              rgba(120,70,255,0.36) 40px,
              rgba(90,35,220,0.22) 78px,
              transparent 130px);

          background-size:
            100% 100%,
            100% 100%,
            100% 100%,
            100% 100%,
            100% 100%,
            100% 100%,

            720px 1600px,
            760px 1700px,
            740px 1650px,
            680px 1500px;

          background-position:
            50% 50%,
            50% 50%,
            50% 50%,
            50% 50%,
            50% 50%,
            50% 50%,

            12% 150%,
            46% 175%,
            78% 165%,
            92% 160%;

          filter: blur(16px) saturate(1.45);
          opacity: 1;
          mix-blend-mode: screen;
          transform: translateZ(0);

          animation:
            clAuraPulse 6.0s ease-in-out infinite,
            clOrbsRise 26s linear infinite;
        }

        .clX-purple::after{
          content:"";
          position:absolute;
          inset:-70px;
          z-index:1;
          pointer-events:none;

          background:
            radial-gradient(circle, rgba(210,150,255,0.30) 0 1px, transparent 6px),
            radial-gradient(circle, rgba(170,110,255,0.26) 0 1px, transparent 6px),
            radial-gradient(circle, rgba(120,70,255,0.24) 0 1px, transparent 6px),
            radial-gradient(circle, rgba(220,160,255,0.24) 0 1px, transparent 6px),

            radial-gradient(circle, rgba(230,190,255,0.20) 0 1px, transparent 4px),
            radial-gradient(circle, rgba(190,130,255,0.18) 0 1px, transparent 4px),
            radial-gradient(circle, rgba(140,90,255,0.16) 0 1px, transparent 4px),
            radial-gradient(circle, rgba(90,35,220,0.14) 0 1px, transparent 4px),

            repeating-linear-gradient(
              165deg,
              rgba(190,130,255,0.14) 0px,
              rgba(190,130,255,0.14) 1px,
              transparent 1px,
              transparent 12px
            );

          background-size:
            240px 520px,
            260px 560px,
            280px 600px,
            300px 640px,

            150px 260px,
            160px 280px,
            170px 300px,
            180px 320px,

            100% 100%;

          background-position:
            22% -60%,
            52% -110%,
            76% -90%,
            92% -130%,

            12% -40%,
            38% -180%,
            64% -120%,
            88% -240%,

            0% 0%;

          mix-blend-mode: screen;
          opacity: 0.95;
          filter: blur(0.10px) saturate(1.45);
          transform: translateZ(0);

          animation:
            clRainFast 0.92s linear infinite,
            clRainMed 1.30s linear infinite,
            clRainSlow 2.20s linear infinite,
            clRainDrift 1.08s ease-in-out infinite,
            clRainFlicker 0.70s ease-in-out infinite;
        }

        @keyframes clAuraPulse{
          0%   { transform: translate3d(0px,0px,0px) scale(1);   filter: blur(16px) saturate(1.25); opacity: 0.92; }
          35%  { transform: translate3d(7px,-3px,0px) scale(1.04); filter: blur(17px) saturate(1.60); opacity: 1; }
          70%  { transform: translate3d(-6px,2px,0px) scale(1.03); filter: blur(18px) saturate(1.75); opacity: 0.98; }
          100% { transform: translate3d(0px,0px,0px) scale(1);   filter: blur(16px) saturate(1.25); opacity: 0.92; }
        }

        @keyframes clOrbsRise{
          0%{
            background-position:
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,

              12% 150%,
              46% 175%,
              78% 165%,
              92% 160%;
          }
          100%{
            background-position:
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,

              12% -140%,
              46% -170%,
              78% -160%,
              92% -150%;
          }
        }

        @keyframes clRainFast{
          0%{
            background-position:
              22% -60%,
              52% -110%,
              76% -90%,
              92% -130%,

              12% -40%,
              38% -180%,
              64% -120%,
              88% -240%,

              0% 0%;
          }
          100%{
            background-position:
              22% 320%,
              52% 360%,
              76% 340%,
              92% 380%,

              12% 520%,
              38% 580%,
              64% 560%,
              88% 620%,

              0% 0%;
          }
        }
        @keyframes clRainMed{ 0%{ transform: translate3d(0,0,0) scale(1);} 100%{ transform: translate3d(0,4px,0) scale(1.01);} }
        @keyframes clRainSlow{ 0%,100%{ filter: blur(0.10px) saturate(1.45);} 50%{ filter: blur(0.22px) saturate(1.85);} }
        @keyframes clRainDrift{
          0%{ transform: translate3d(0px,0px,0px) skewX(0deg); }
          25%{ transform: translate3d(10px,-1px,0px) skewX(-0.7deg); }
          50%{ transform: translate3d(-12px,0px,0px) skewX(0.9deg); }
          75%{ transform: translate3d(9px,1px,0px) skewX(-0.5deg); }
          100%{ transform: translate3d(0px,0px,0px) skewX(0deg); }
        }
        @keyframes clRainFlicker{ 0%,100%{ opacity: 0.88; } 20%{ opacity: 1; } 45%{ opacity: 0.90; } 65%{ opacity: 1; } 85%{ opacity: 0.92; } }

        @media (prefers-reduced-motion: reduce){
          .clX-purple::before, .clX-purple::after{ animation:none !important; }
          .clX-shimmer, .clM-name{ animation:none !important; }
        }

        /* =========================================================
           CLIENTS UI
           ========================================================= */

        .clM-page{
          position: relative;
          isolation: isolate;
          padding-bottom: calc(132px + env(safe-area-inset-bottom));
        }

        .clM-page > *{ position: relative; z-index: 2; }

        .clM-head{
          display:flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 12px;
        }

        .clM-topRow{
          display:flex;
          align-items:flex-end;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .clM-title h1{
          margin: 0;
          font-size: 20px;
          letter-spacing: 0.2px;
        }
        .clX-shimmer{
          font-weight: 1000;
          background:
            linear-gradient(120deg,
              rgba(255,255,255,0.92),
              rgba(220,160,255,0.90),
              rgba(120,70,255,0.92),
              rgba(212,175,55,0.75),
              rgba(255,255,255,0.92)
            );
          background-size: 260% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow:
            0 0 22px rgba(190,130,255,0.30),
            0 0 36px rgba(120,70,255,0.24),
            0 0 18px rgba(212,175,55,0.18),
            0 18px 50px rgba(0,0,0,0.55);
          animation: clTitleShimmer 2.6s linear infinite;
        }
        @keyframes clTitleShimmer{
          0%{ background-position: 0% 50%; filter: saturate(1.15) brightness(1.10); }
          50%{ filter: saturate(1.35) brightness(1.22); }
          100%{ background-position: 100% 50%; filter: saturate(1.15) brightness(1.10); }
        }

        .clM-sub{
          margin-top: 6px;
          font-size: 13px;
        }

        .clM-searchRow{
          display:flex;
          gap: 10px;
          align-items:center;
          flex-wrap: wrap;
        }
        .clM-searchRow .input{
          height: 46px;
          border-radius: 16px;
          font-weight: 900;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow:
            0 0 0 1px rgba(190,130,255,0.08) inset,
            0 18px 60px rgba(0,0,0,0.34),
            0 0 22px rgba(120,70,255,0.14);
        }

        .clM-kpis{
          display:flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items:center;
        }

        .clM-pill{
          font-size: 12px;
          font-weight: 950;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(152,90,255,0.28);
          background: rgba(152,90,255,0.12);
          color: rgba(255,255,255,0.92);
          white-space: nowrap;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.03) inset,
            0 0 18px rgba(120,70,255,0.16);
        }

        .clM-pagePill{
          border-color: rgba(212,175,55,0.28);
          background: rgba(212,175,55,0.10);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.03) inset,
            0 0 18px rgba(212,175,55,0.10);
        }

        .clM-list{
          display:flex;
          flex-direction: column;
          gap: 10px;
        }

        .clM-card{
          border-radius: 18px;
          border: 1px solid rgba(120,160,255,0.16);
          background:
            radial-gradient(900px 240px at 30% 0%, rgba(152,90,255,0.12), transparent 60%),
            radial-gradient(680px 240px at 85% 0%, rgba(120,70,255,0.10), transparent 60%),
            rgba(0,0,0,0.44);
          backdrop-filter: blur(12px);
          box-shadow:
            0 22px 85px rgba(0,0,0,0.40),
            0 0 32px rgba(120,70,255,0.10);
          padding: 9px;
        }

        .clM-row1{
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .clM-name{
          font-weight: 1000;
          font-size: 15px;
          margin: 0;
          line-height: 1.12;

          background:
            linear-gradient(120deg,
              rgba(255,255,255,0.92),
              rgba(220,160,255,0.90),
              rgba(120,70,255,0.92),
              rgba(255,255,255,0.92)
            );
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;

          text-shadow:
            0 0 18px rgba(190,130,255,0.18),
            0 0 26px rgba(120,70,255,0.14),
            0 16px 42px rgba(0,0,0,0.55);

          animation: clNameShimmer 3.4s linear infinite;
        }

        @keyframes clNameShimmer{
          0%{ background-position: 0% 50%; opacity: 0.96; }
          50%{ opacity: 1; filter: saturate(1.18) brightness(1.08); }
          100%{ background-position: 100% 50%; opacity: 0.96; }
        }

        .clM-meta{
          margin-top: 4px;
          display:flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items:center;
          color: rgba(255,255,255,0.72);
          font-size: 12px;
        }

        .clM-chip{
          padding: 5px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          white-space: nowrap;
        }

        .clM-actions{
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items:center;
          justify-content:flex-end;
        }

        .clM-miniBtn{
          height: 40px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          font-weight: 950;
          padding: 0 12px;
          cursor: pointer;
          text-decoration: none;
          display:inline-flex;
          align-items:center;
          justify-content:center;

          box-shadow:
            0 0 0 1px rgba(255,255,255,0.02) inset,
            0 0 18px rgba(120,70,255,0.10);
        }
        .clM-miniBtn:active{ transform: translateY(1px); }

        .clM-miniBtn.danger{
          border-color: rgba(255,80,80,0.22);
          background: rgba(255,80,80,0.10);
          color: rgba(255,170,170,0.95);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.02) inset,
            0 0 18px rgba(255,80,80,0.12);
        }

        .clM-details{
          margin-top: 7px;
          padding-top: 7px;
          border-top: 1px solid rgba(255,255,255,0.08);
          display:grid;
          grid-template-columns: 1fr;
          gap: 7px;
          font-size: 13px;
          color: rgba(255,255,255,0.78);
        }

        .clM-line{
          display:flex;
          gap: 8px;
          align-items:flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .clM-label{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.60);
          margin-bottom: 2px;
        }
        .clM-value{
          color: rgba(255,255,255,0.90);
          word-break: break-word;
        }

        .clM-notes{
          margin-top: 4px;
          color: rgba(255,255,255,0.70);
          font-size: 13px;
          line-height: 1.26;
        }

        .clM-pager{
          margin-top: 12px;
          display:flex;
          gap: 10px;
          align-items:center;
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .clM-pagerLeft{
          display:flex;
          gap: 8px;
          align-items:center;
          flex-wrap: wrap;
        }
        .clM-pagerBtn{
          height: 42px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          font-weight: 950;
          padding: 0 12px;
          cursor: pointer;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.02) inset,
            0 0 18px rgba(120,70,255,0.10);
        }
        .clM-pagerBtn:disabled{
          opacity: 0.45;
          cursor: default;
        }
        .clM-pagerSelect{
          height: 42px;
          border-radius: 16px;
          font-weight: 950;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.92);
          padding: 0 10px;
          min-width: 140px;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.02) inset,
            0 0 18px rgba(120,70,255,0.10);
        }

        .clM-bottomBar{
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 120;
          padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
          background: rgba(10,10,16,0.78);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-top: 1px solid rgba(255,255,255,0.10);
          box-shadow:
            0 -18px 70px rgba(0,0,0,0.60),
            0 0 40px rgba(120,70,255,0.14);
        }

        .clM-bottomInner{
          max-width: 980px;
          margin: 0 auto;
          display:flex;
          gap: 10px;
          align-items:center;
          flex-wrap: wrap;
        }

        .clM-bottomInner .btn{
          height: 46px;
          border-radius: 16px;
        }

        .clM-grow{ flex: 1 1 auto; }

        .clM-overlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.72);
          display:flex;
          align-items:flex-end;
          justify-content:center;
          padding: 10px;
          z-index: 200;
        }
        .clM-sheet{
          width: min(980px, 100%);
          border-radius: 22px;
          border: 1px solid rgba(120,160,255,0.16);
          background:
            radial-gradient(900px 220px at 30% 0%, rgba(152,90,255,0.18), transparent 60%),
            radial-gradient(680px 220px at 85% 0%, rgba(120,70,255,0.14), transparent 60%),
            rgba(8,10,18,0.92);
          box-shadow: 0 24px 90px rgba(0,0,0,0.62);
          backdrop-filter: blur(12px);
          padding: 14px;
          padding-bottom: calc(14px + env(safe-area-inset-bottom));
        }
        .clM-sheet h2{ margin: 0; font-size: 16px; }
        .clM-grid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        .clM-grid .full{ grid-column: 1 / -1; }
        .clM-sheet .input{
          height: 46px;
          border-radius: 16px;
          font-weight: 900;
          font-size: 16px;
        }
        .clM-sheet textarea.input{ min-height: 110px; }

        @media (max-width: 520px){
          .clM-grid{ grid-template-columns: 1fr; }
        }

        input, select, textarea { font-size: 16px; }

        .clM-toast{
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          bottom: calc(126px + env(safe-area-inset-bottom));
          z-index: 300;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(10,10,16,0.82);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 60px rgba(0,0,0,0.45);
          color: rgba(255,255,255,0.92);
          font-weight: 950;
          font-size: 13px;
          max-width: calc(100vw - 20px);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      <div className="clM-head">
        <div className="clM-topRow">
          <div className="clM-title">
            <h1 className="clX-shimmer">Clients</h1>
            <div className="muted clM-sub">
              Tap a client to edit. Use Copy buttons to send texts/emails one-by-one.
            </div>
          </div>

          <div className="clM-kpis">
            <span className="clM-pill">{shownCount} shown</span>
            <span className="clM-pill clM-pagePill">
              Page {safePage}/{totalPages}
            </span>
          </div>
        </div>

        <div className="clM-searchRow">
          <input
            className="input clM-grow"
            placeholder="Search name, phone, email, Ordered Items/Notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" type="button" onClick={openAdd}>
            + Add
          </button>
          <button className="btn" type="button" onClick={() => void load({ nextPage: page, nextQ: q })} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {err ? (
          <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)" }}>
            <b style={{ color: "salmon" }}>Error:</b> <span className="muted">{err}</span>
          </div>
        ) : null}

        {totalCount > PAGE_SIZE ? (
          <div className="clM-pager">
            <div className="clM-pagerLeft">
              <button
                className="clM-pagerBtn"
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                ← Prev
              </button>

              <button
                className="clM-pagerBtn"
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                Next →
              </button>

              <select
                className="clM-pagerSelect"
                value={String(safePage)}
                onChange={(e) => setPage(Number(e.target.value))}
                aria-label="Select page"
              >
                {Array.from({ length: totalPages }).map((_, i) => {
                  const p = i + 1;
                  const start = (p - 1) * PAGE_SIZE + 1;
                  const end = Math.min(p * PAGE_SIZE, totalCount);
                  return (
                    <option key={p} value={String(p)}>
                      Page {p} ({start}-{end})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
              Showing {Math.min(PAGE_SIZE, Math.max(0, totalCount - (safePage - 1) * PAGE_SIZE))} of {totalCount}
            </div>
          </div>
        ) : null}
      </div>

      <div className="clM-list">
        {paged.map((r) => {
          const phoneClean = normPhone(r.phone);
          const emailClean = String(r.email ?? "").trim();

          const telHref = phoneClean ? `tel:${phoneClean}` : "";
          const smsHref = phoneClean ? `sms:${phoneClean}` : "";
          const mailHref = emailClean && isEmail(emailClean) ? `mailto:${emailClean}` : "";

          return (
            <div className="clM-card" key={r.id}>
              <div className="clM-row1">
                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <p className="clM-name">{r.name?.trim() ? r.name : "Unnamed client"}</p>

                  <div className="clM-meta">
                    {r.last_spoken_to ? <span className="clM-chip">Last: {r.last_spoken_to}</span> : null}
                    {r.created_at ? <span className="clM-chip">Added</span> : null}
                  </div>
                </div>

                <div className="clM-actions">
                  <button className="clM-miniBtn" type="button" onClick={() => openEdit(r)}>
                    Edit
                  </button>
                  <button className="clM-miniBtn danger" type="button" onClick={() => void del(r.id)}>
                    Delete
                  </button>
                </div>
              </div>

              <div className="clM-details">
                <div className="clM-line">
                  <div>
                    <div className="clM-label">Phone</div>
                    <div className="clM-value">{r.phone ?? ""}</div>
                  </div>
                  <div className="clM-actions">
                    <a
                      className="clM-miniBtn"
                      href={telHref || undefined}
                      aria-disabled={!telHref}
                      style={{ opacity: telHref ? 1 : 0.45, pointerEvents: telHref ? "auto" : "none" }}
                    >
                      Call
                    </a>
                    <a
                      className="clM-miniBtn"
                      href={smsHref || undefined}
                      aria-disabled={!smsHref}
                      style={{ opacity: smsHref ? 1 : 0.45, pointerEvents: smsHref ? "auto" : "none" }}
                    >
                      Text
                    </a>
                  </div>
                </div>

                <div className="clM-line">
                  <div style={{ minWidth: 0 }}>
                    <div className="clM-label">Email</div>
                    <div className="clM-value">{r.email ?? ""}</div>
                  </div>
                  <div className="clM-actions">
                    <a
                      className="clM-miniBtn"
                      href={mailHref || undefined}
                      aria-disabled={!mailHref}
                      style={{ opacity: mailHref ? 1 : 0.45, pointerEvents: mailHref ? "auto" : "none" }}
                    >
                      Email
                    </a>
                  </div>
                </div>

                {r.notes?.trim() ? (
                  <div className="clM-notes">
                    <div className="clM-label">Items ordered/notes</div>
                    {r.notes}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {!paged.length && !loading ? (
          <div className="card" style={{ padding: 12 }}>
            <div className="muted">No clients yet. Tap “+ Add” to create your first one.</div>
          </div>
        ) : null}
      </div>

      <div className="clM-bottomBar">
        <div className="clM-bottomInner">
          <button className="btn primary clM-grow" type="button" onClick={openAdd}>
            + Add Client
          </button>

          <button className="btn" type="button" onClick={() => void load({ nextPage: page, nextQ: q })} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>

          <button className="btn" type="button" onClick={() => void copyPhones("lines")} title="One per line (best for manual texting)">
            Copy Phones
          </button>

          <button className="btn" type="button" onClick={() => void copyEmails("lines")} title="One per line">
            Copy Emails
          </button>
        </div>

        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Want comma-separated instead? Use these:{" "}
          <button className="btn" type="button" onClick={() => void copyPhones("comma")} style={{ height: 36, padding: "0 12px", borderRadius: 999 }}>
            Phones (CSV)
          </button>{" "}
          <button className="btn" type="button" onClick={() => void copyEmails("comma")} style={{ height: 36, padding: "0 12px", borderRadius: 999 }}>
            Emails (CSV)
          </button>
        </div>
      </div>

      {open ? (
        <div className="clM-overlay" onClick={close}>
          <div className="clM-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h2>{editing ? "Edit Client" : "Add Client"}</h2>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Everything optional — built for fast phone entry.
                </div>
              </div>

              <button className="btn" type="button" onClick={close} style={{ height: 46, borderRadius: 16 }}>
                Close
              </button>
            </div>

            <div className="clM-grid">
              <div className="full">
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Name
                </div>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jim Weiner..." autoFocus />
              </div>

              <div className="full">
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Phone
                </div>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" inputMode="tel" />
              </div>

              <div className="full">
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Email
                </div>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" inputMode="email" />
              </div>

              <div className="full">
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Last Spoken
                </div>
                <input className="input" type="date" value={lastSpoken} onChange={(e) => setLastSpoken(e.target.value)} />
              </div>

              <div className="full">
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Notes
                </div>
                <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="item's ordered and notes" />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn primary" type="button" onClick={() => void save()} disabled={loading}>
                {loading ? "Saving…" : "Save Client"}
              </button>
              <button className="btn" type="button" onClick={close} disabled={loading}>
                Cancel
              </button>
            </div>

            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Pro: Use “Copy Phones/Emails” in the bottom bar to paste into Notes/Sheets and text/email people one-by-one.
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="clM-toast">{toast}</div> : null}
    </div>
  );
}
