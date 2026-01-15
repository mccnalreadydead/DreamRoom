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

export default function Clients() {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // search
  const [q, setQ] = useState("");

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

  async function load() {
    setLoading(true);
    setErr("");

    const res = await supabase
      .from("clients")
      .select("id,name,phone,email,last_spoken_to,notes,created_at")
      .order("name", { ascending: true });

    if (res.error) {
      setErr(res.error.message);
      setRows([]);
    } else {
      setRows((res.data as any) ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
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

    if (editing?.id) {
      const upd = await supabase.from("clients").update(payload).eq("id", editing.id);
      if (upd.error) setErr(upd.error.message);
    } else {
      const ins = await supabase.from("clients").insert([payload]);
      if (ins.error) setErr(ins.error.message);
    }

    setLoading(false);
    setOpen(false);
    await load();
    showToast(editing ? "Client updated" : "Client added");
  }

  async function del(id: number) {
    const ok = confirm("Delete this client?");
    if (!ok) return;

    setErr("");
    const res = await supabase.from("clients").delete().eq("id", id);
    if (res.error) setErr(res.error.message);
    await load();
    showToast("Client deleted");
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const hay = `${r.name ?? ""} ${r.phone ?? ""} ${r.email ?? ""} ${r.notes ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  const allPhones = useMemo(() => {
    const list = filtered
      .map((r) => normPhone(r.phone))
      .filter((x) => x.length > 0);
    // de-dupe
    return Array.from(new Set(list));
  }, [filtered]);

  const allEmails = useMemo(() => {
    const list = filtered
      .map((r) => String(r.email ?? "").trim())
      .filter((x) => x.length > 0 && isEmail(x));
    return Array.from(new Set(list.map((x) => x.toLowerCase()))); // normalize
  }, [filtered]);

  async function copyPhones(mode: "lines" | "comma") {
    if (!allPhones.length) return showToast("No phone numbers to copy");
    const text = mode === "lines" ? allPhones.join("\n") : allPhones.join(", ");
    const ok = await copyToClipboard(text);
    showToast(ok ? `Copied ${allPhones.length} phone(s)` : "Couldn’t copy (browser blocked)");
  }

  async function copyEmails(mode: "lines" | "comma") {
    if (!allEmails.length) return showToast("No emails to copy");
    const text = mode === "lines" ? allEmails.join("\n") : allEmails.join(", ");
    const ok = await copyToClipboard(text);
    showToast(ok ? `Copied ${allEmails.length} email(s)` : "Couldn’t copy (browser blocked)");
  }

  return (
    <div className="page clM-page">
      <style>{`
        /* =======================
           MOBILE-FIRST CLIENTS UI
           ======================= */

        .clM-page{
          position: relative;
          isolation: isolate;
          padding-bottom: calc(92px + env(safe-area-inset-bottom));
        }

        .clM-page > *{ position: relative; z-index: 1; }

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
          font-size: 18px;
          letter-spacing: 0.2px;
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
          font-weight: 800;
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
          border: 1px solid rgba(152,90,255,0.22);
          background: rgba(152,90,255,0.10);
          color: rgba(255,255,255,0.92);
          white-space: nowrap;
        }

        /* Cards list */
        .clM-list{
          display:flex;
          flex-direction: column;
          gap: 10px;
        }

        .clM-card{
          border-radius: 18px;
          border: 1px solid rgba(120,160,255,0.14);
          background:
            radial-gradient(900px 220px at 30% 0%, rgba(90,140,255,0.08), transparent 60%),
            radial-gradient(680px 220px at 85% 0%, rgba(212,175,55,0.06), transparent 60%),
            rgba(0,0,0,0.42);
          backdrop-filter: blur(12px);
          box-shadow: 0 22px 70px rgba(0,0,0,0.35);
          padding: 12px;
        }

        .clM-row1{
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .clM-name{
          font-weight: 950;
          font-size: 15px;
          color: rgba(255,255,255,0.94);
          margin: 0;
          line-height: 1.2;
        }

        .clM-meta{
          margin-top: 6px;
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items:center;
          color: rgba(255,255,255,0.72);
          font-size: 12px;
        }

        .clM-chip{
          padding: 6px 10px;
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
          height: 42px;
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
        }
        .clM-miniBtn:active{ transform: translateY(1px); }

        .clM-miniBtn.danger{
          border-color: rgba(255,80,80,0.22);
          background: rgba(255,80,80,0.10);
          color: rgba(255,170,170,0.95);
        }

        .clM-details{
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.08);
          display:grid;
          grid-template-columns: 1fr;
          gap: 8px;
          font-size: 13px;
          color: rgba(255,255,255,0.78);
        }

        .clM-line{
          display:flex;
          gap: 10px;
          align-items:flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .clM-label{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.60);
        }
        .clM-value{
          color: rgba(255,255,255,0.90);
          word-break: break-word;
        }

        .clM-notes{
          margin-top: 8px;
          color: rgba(255,255,255,0.70);
          font-size: 13px;
          line-height: 1.35;
        }

        /* Bottom bar */
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

        /* Add/Edit bottom sheet */
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
            radial-gradient(900px 220px at 30% 0%, rgba(90,140,255,0.10), transparent 60%),
            radial-gradient(680px 220px at 85% 0%, rgba(212,175,55,0.08), transparent 60%),
            rgba(8,10,18,0.92);
          box-shadow: 0 24px 70px rgba(0,0,0,0.55);
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

        /* iOS zoom fix */
        input, select, textarea { font-size: 16px; }

        /* Toast */
        .clM-toast{
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          bottom: calc(86px + env(safe-area-inset-bottom));
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

        /* Desktop-only: show table if you REALLY want it later.
           For now: cards on all sizes. */
      `}</style>

      <div className="clM-head">
        <div className="clM-topRow">
          <div className="clM-title">
            <h1>Clients</h1>
            <div className="muted clM-sub">
              Tap a client to edit. Use Copy buttons to send texts/emails one-by-one.
            </div>
          </div>

          <div className="clM-kpis">
            <span className="clM-pill">{filtered.length} shown</span>
            <span className="clM-pill">{allPhones.length} phone(s)</span>
            <span className="clM-pill">{allEmails.length} email(s)</span>
          </div>
        </div>

        <div className="clM-searchRow">
          <input
            className="input clM-grow"
            placeholder="Search name, phone, email, notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" type="button" onClick={openAdd}>
            + Add
          </button>
          <button className="btn" type="button" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {err ? (
          <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)" }}>
            <b style={{ color: "salmon" }}>Error:</b> <span className="muted">{err}</span>
          </div>
        ) : null}
      </div>

      <div className="clM-list">
        {filtered.map((r) => {
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
                    <a className="clM-miniBtn" href={telHref || undefined} aria-disabled={!telHref} style={{ opacity: telHref ? 1 : 0.45, pointerEvents: telHref ? "auto" : "none" }}>
                      Call
                    </a>
                    <a className="clM-miniBtn" href={smsHref || undefined} aria-disabled={!smsHref} style={{ opacity: smsHref ? 1 : 0.45, pointerEvents: smsHref ? "auto" : "none" }}>
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
                    <a className="clM-miniBtn" href={mailHref || undefined} aria-disabled={!mailHref} style={{ opacity: mailHref ? 1 : 0.45, pointerEvents: mailHref ? "auto" : "none" }}>
                      Email
                    </a>
                  </div>
                </div>

                {r.notes?.trim() ? (
                  <div className="clM-notes">
                    <div className="clM-label">Notes</div>
                    {r.notes}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {!filtered.length ? (
          <div className="card" style={{ padding: 12 }}>
            <div className="muted">No clients yet. Tap “+ Add” to create your first one.</div>
          </div>
        ) : null}
      </div>

      {/* Bottom bar: copy tools + add */}
      <div className="clM-bottomBar">
        <div className="clM-bottomInner">
          <button className="btn primary clM-grow" type="button" onClick={openAdd}>
            + Add Client
          </button>

          <button className="btn" type="button" onClick={() => void load()} disabled={loading}>
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

      {/* Add/Edit bottom sheet */}
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
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" autoFocus />
              </div>

              <div className="full">
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Phone
                </div>
                <input
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  inputMode="tel"
                />
              </div>

              <div className="full">
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Email
                </div>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  inputMode="email"
                />
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
                <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What do they want? What are they looking for?" />
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
