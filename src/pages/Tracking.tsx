import { useEffect, useMemo, useState } from "react";
import { addTracking, getTracking, deleteTracking } from "../lib/store";

export default function Tracking() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onUpdate = () => setTick((x) => x + 1);
    window.addEventListener("ad_store_updated", onUpdate);
    return () => window.removeEventListener("ad_store_updated", onUpdate);
  }, []);

  const entries = useMemo(() => getTracking(), [tick]);

  const [trackingNumber, setTrackingNumber] = useState("");
  const [datePurchasedISO, setDatePurchasedISO] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [contents, setContents] = useState("");
  const [cost, setCost] = useState<number>(0);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter((e) => {
      return (
        (e.trackingNumber ?? "").toLowerCase().includes(q) ||
        (e.contents ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, search]);

  function submit() {
    const tn = trackingNumber.trim();
    if (!tn) return;

    addTracking({
      trackingNumber: tn,
      datePurchasedISO: datePurchasedISO || undefined,
      contents: contents.trim() || undefined,
      cost: Number(cost) || undefined,
    });

    setTrackingNumber("");
    setContents("");
    setCost(0);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this tracking entry?")) return;
    deleteTracking(id);
  }

  return (
    <div className="page">
      <h1>Tracking</h1>

      <div className="grid2">
        <div className="card">
          <h2>Add Tracking</h2>

          <label className="label">Tracking Number</label>
          <input
            className="input"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />

          <label className="label">Date Purchased</label>
          <input
            className="input"
            type="date"
            value={datePurchasedISO}
            onChange={(e) => setDatePurchasedISO(e.target.value)}
          />

          <label className="label">Contents</label>
          <input
            className="input"
            value={contents}
            onChange={(e) => setContents(e.target.value)}
          />

          <label className="label">Cost</label>
          <input
            className="input"
            type="number"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
          />

          <button className="btn primary" onClick={submit}>
            Save Tracking
          </button>
        </div>

        <div className="card">
          <h2>Search</h2>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tracking or contents"
          />
          <p className="muted">
            Showing {filtered.length} of {entries.length}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>All Tracking Entries</h2>

        <table className="table">
          <thead>
            <tr>
              <th>Tracking #</th>
              <th>Date</th>
              <th>Contents</th>
              <th>Cost</th>
              <th style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td style={{ fontFamily: "monospace" }}>
                  {e.trackingNumber}
                </td>
                <td>{e.datePurchasedISO ?? ""}</td>
                <td className="muted">{e.contents ?? ""}</td>
                <td>{e.cost ? `$${e.cost}` : ""}</td>
                <td>
                  <button
                    className="btn danger"
                    onClick={() => handleDelete(e.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No tracking entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
