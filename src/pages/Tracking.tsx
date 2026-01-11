import { useEffect, useMemo, useState } from "react";
import { addTracking, getTracking } from "../lib/store";

export default function Tracking() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onUpdate = () => setTick((x) => x + 1);
    window.addEventListener("ad_store_updated", onUpdate);
    return () => window.removeEventListener("ad_store_updated", onUpdate);
  }, []);

  const entries = useMemo(() => getTracking(), [tick]);

  const [trackingNumber, setTrackingNumber] = useState("");
  const [datePurchasedISO, setDatePurchasedISO] = useState(new Date().toISOString().slice(0, 10));
  const [contents, setContents] = useState("");
  const [cost, setCost] = useState<number>(0);

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter((e) => {
      const tn = (e.trackingNumber ?? "").toLowerCase();
      const c = (e.contents ?? "").toLowerCase();
      return tn.includes(q) || c.includes(q);
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

  return (
    <div className="page">
      <div className="row">
        <h1 style={{ margin: 0 }}>Tracking</h1>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Add Tracking</h2>

          <label className="label">Tracking Number</label>
          <input
            className="input"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Example: 9400 1000 0000 0000 0000 00"
          />

          <label className="label">Date Purchased</label>
          <input
            className="input"
            type="date"
            value={datePurchasedISO}
            onChange={(e) => setDatePurchasedISO(e.target.value)}
          />

          <label className="label">Contents (optional)</label>
          <input
            className="input"
            value={contents}
            onChange={(e) => setContents(e.target.value)}
            placeholder="Example: SM7B + cables"
          />

          <label className="label">Cost (optional)</label>
          <input className="input" type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />

          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={submit}>
              Save Tracking
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Search</h2>
          <label className="label">Find tracking numbers or contents</label>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type: 9400… or SM7B"
          />

          <p className="muted" style={{ marginTop: 10 }}>
            Showing <b>{filtered.length}</b> of <b>{entries.length}</b>
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>All Tracking Entries</h2>

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tracking #</th>
                <th>Date Purchased</th>
                <th>Contents</th>
                <th>Cost</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontFamily: "monospace" }}>{e.trackingNumber}</td>
                  <td>{e.datePurchasedISO ?? ""}</td>
                  <td className="muted">{e.contents ?? ""}</td>
                  <td>{typeof e.cost === "number" && e.cost !== 0 ? `$${e.cost}` : ""}</td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No tracking entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
