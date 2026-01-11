import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  function enterLocalMode() {
    localStorage.setItem("ad_local_mode", "true");
    // hard navigate so App re-checks localStorage
    window.location.assign("/");
  }

  async function sendMagicLink() {
    setStatus("");
    const e = email.trim();
    if (!e) {
      setStatus("Please enter an email.");
      return;
    }

    setStatus("Sending magic link...");
    const { error } = await supabase.auth.signInWithOtp({ email: e });
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Check your email for the sign-in link.");
  }

  return (
    <div className="page center" style={{ minHeight: "calc(100vh - 80px)" }}>
      <div className="card" style={{ width: "min(520px, 92vw)" }}>
        <h1 style={{ marginTop: 0 }}>Login</h1>

        <label className="label">Email</label>
        <input
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
        />

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={sendMagicLink}>
            Send Email Link
          </button>

          {/* BIG OBVIOUS LOCAL MODE BUTTON */}
          <button
            onClick={enterLocalMode}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Enter Local Mode (No Login)
          </button>
        </div>

        {status && <div className="muted" style={{ marginTop: 12 }}>{status}</div>}

        <p className="muted" style={{ marginTop: 14 }}>
          Local Mode saves to this computer only. You can add cloud later.
        </p>
      </div>
    </div>
  );
}
