import { useEffect, useMemo, useState } from "react";
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

export default function Clients() {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // search
  const [q, setQ] = useState("");

  // add/edit modal
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [lastSpoken, setLastSpoken] = useState<string>(todayISO()); // ✅ auto-set today
  const [notes, setNotes] = useState("");

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
    load();
  }, []);

  function openAdd() {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setLastSpoken(todayISO()); // ✅ auto-set today every time you add
    setNotes("");
    setOpen(true);
  }

  function openEdit(r: ClientRow) {
    setEditing(r);
    setName(r.name ?? "");
    setPhone(r.phone ?? "");
    setEmail(r.email ?? "");
    setLastSpoken(r.last_spoken_to ?? todayISO()); // if missing, show today
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
      last_spoken_to: clean(lastSpoken), // optional, but defaults to today in UI
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
  }

  async function del(id: number) {
    const ok = confirm("Delete this client?");
    if (!ok) return;

    setErr("");
    const res = await supabase.from("clients").delete().eq("id", id);
    if (res.error) setErr(res.error.message);
    await load();
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const hay = `${r.name ?? ""} ${r.phone ?? ""} ${r.email ?? ""} ${r.notes ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  return (
    <div className="page">
      <div
        className="row"
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Clients</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Build a profile for each client — nothing required, everything optional.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            placeholder="Search clients…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <button className="btn" type="button" onClick={openAdd}>
            + Add Client
          </button>
          <button className="btn" type="button" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)", marginTop: 12 }}>
          <b style={{ color: "salmon" }}>Error:</b> <span className="muted">{err}</span>
        </div>
      ) : null}

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                {["Name", "Phone", "Email", "Last spoken", "Notes", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderBottom: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 12,
                      letterSpacing: 0.3,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <b>{r.name ?? ""}</b>
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{r.phone ?? ""}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{r.email ?? ""}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {r.last_spoken_to ?? ""}
                  </td>
                  <td
                    style={{
                      padding: 10,
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                      maxWidth: 360,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={r.notes ?? ""}
                  >
                    <span className="muted">{r.notes ?? ""}</span>
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="btn" type="button" onClick={() => openEdit(r)}>
                        Edit
                      </button>
                      <button className="btn" type="button" onClick={() => void del(r.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!filtered.length ? (
                <tr>
                  <td colSpan={6} style={{ padding: 14 }} className="muted">
                    No clients yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {open ? (
        <div
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.70)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 60,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(820px, 100%)",
              padding: 14,
              borderRadius: 18,
            }}
          >
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <h2 style={{ margin: 0 }}>{editing ? "Edit Client" : "Add Client"}</h2>
              <button className="btn" type="button" onClick={close}>
                Close
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12, 1fr)",
                gap: 10,
                marginTop: 12,
              }}
            >
              <div style={{ gridColumn: "span 6" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Name (optional)
                </div>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Phone (optional)
                </div>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Email (optional)
                </div>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div style={{ gridColumn: "span 4" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Last spoken (auto set to today)
                </div>
                <input className="input" type="date" value={lastSpoken} onChange={(e) => setLastSpoken(e.target.value)} />
              </div>

              <div style={{ gridColumn: "span 12" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Notes (optional)
                </div>
                <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn primary" type="button" onClick={() => void save()} disabled={loading}>
                {loading ? "Saving…" : "Save Client"}
              </button>
              <button className="btn" type="button" onClick={close}>
                Cancel
              </button>
            </div>

            <style>{`
              @media (max-width: 820px){
                div[style*="grid-template-columns: repeat(12"]{ grid-template-columns: repeat(6, 1fr) !important; }
                div[style*="grid-template-columns: repeat(12"] > div{ grid-column: span 6 !important; }
                input.input, textarea.input{ font-size: 16px; } /* iOS zoom fix */
              }
            `}</style>
          </div>
        </div>
      ) : null}
    </div>
  );
}
