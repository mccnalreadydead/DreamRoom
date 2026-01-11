import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const STORAGE_KEYS = [
  "inventory",
  "sales",
  "tracking",
  "products",
  "calendarNotes",
] as const;

function safeParse(value: string | null) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function getLocalData() {
  const data: Record<string, any> = {};
  for (const key of STORAGE_KEYS) {
    data[key] = safeParse(localStorage.getItem(key));
  }
  return data;
}

function setLocalData(data: Record<string, any>) {
  for (const key of STORAGE_KEYS) {
    if (data[key] == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(data[key]));
    }
  }
  window.dispatchEvent(new Event("ad-storage-updated"));
}

export default function CloudSync() {
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function refreshUser() {
    const { data } = await supabase.auth.getUser();
    setUserEmail(data.user?.email ?? "");
  }

  useEffect(() => {
    refreshUser();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshUser();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function sendMagicLink() {
    setError("");
    setStatus("");
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setStatus("Check your email and click the login link.");
    }
  }

  async function signOut() {
    setError("");
    setStatus("");
    const { error } = await supabase.auth.signOut();
    if (error) setError(error.message);
    else setStatus("Signed out.");
  }

  async function uploadToCloud() {
    setError("");
    setStatus("");

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("You must be logged in.");
      return;
    }

    const payload = getLocalData();

    const { error } = await supabase
      .from("user_data")
      .upsert({
        user_id: userData.user.id,
        data: payload,
        updated_at: new Date().toISOString(),
      });

    if (error) setError(error.message);
    else setStatus("Uploaded local data to cloud.");
  }

  async function downloadFromCloud() {
    setError("");
    setStatus("");

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setError("You must be logged in.");
      return;
    }

    const { data, error } = await supabase
      .from("user_data")
      .select("data")
      .eq("user_id", userData.user.id)
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    if (data?.data) {
      setLocalData(data.data);
      setStatus("Downloaded cloud data to this device.");
    } else {
      setError("No cloud data found.");
    }
  }

  return (
    <div className="page">
      <h1>Cloud Sync</h1>

      <div className="card" style={{ padding: 16 }}>
        <p className="muted">
          Sync your inventory between computer and phone.
        </p>

        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="muted">Signed in as:</div>
          <strong>{userEmail || "Not signed in"}</strong>
        </div>

        {!userEmail && (
          <div className="card" style={{ padding: 12, marginBottom: 12 }}>
            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
            <button onClick={sendMagicLink}>Send Login Link</button>
          </div>
        )}

        {userEmail && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={uploadToCloud}>Upload to Cloud</button>
            <button onClick={downloadFromCloud}>Download from Cloud</button>
            <button onClick={signOut} className="danger">
              Sign Out
            </button>
          </div>
        )}

        {status && <p style={{ color: "#7dd3fc" }}>{status}</p>}
        {error && <p style={{ color: "#f87171" }}>{error}</p>}
      </div>
    </div>
  );
}
