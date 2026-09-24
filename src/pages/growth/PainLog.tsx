import { useEffect, useState } from "react";
import { useActiveMember } from "../../growth/hooks/useActiveMember";
import MemberSwitcher from "../../growth/components/MemberSwitcher";
import { toDateKey } from "../../growth/lib/scoring";
import {
  addPainLogEntry,
  deletePainLogEntry,
  fetchPainLog,
  setPainLogResolved,
  type GrowthPainLogEntry,
} from "../../growth/lib/api";
import { Link } from "react-router-dom";
import "./growth.css";

/**
 * Standalone body pain log — independent of the weekly check-in. Each
 * entry tracks one issue by location + start date and can be marked
 * resolved, which moves it into a collapsed "past issues" section.
 * Visible to both Devan and Chad (no privacy split).
 */
export default function PainLog() {
  const { activeSlug, setActiveSlug, activeMember, loading: memberLoading, error: memberError } = useActiveMember();
  const [entries, setEntries] = useState<GrowthPainLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(() => toDateKey(new Date()));
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  async function reload() {
    if (!activeMember) return;
    try {
      setLoading(true);
      setError(null);
      setEntries(await fetchPainLog(activeMember.id));
    } catch (e: any) {
      setError(e.message || "Failed to load pain log");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMember?.id]);

  async function handleAdd() {
    if (!activeMember || !location.trim()) return;
    try {
      setAdding(true);
      setError(null);
      await addPainLogEntry({
        member_id: activeMember.id,
        location: location.trim(),
        start_date: startDate,
        notes: notes.trim() || null,
      });
      setLocation("");
      setNotes("");
      setStartDate(toDateKey(new Date()));
      await reload();
    } catch (e: any) {
      setError(e.message || "Failed to add entry");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleResolved(entry: GrowthPainLogEntry) {
    try {
      await setPainLogResolved(entry.id, !entry.resolved);
      await reload();
    } catch (e: any) {
      setError(e.message || "Failed to update entry");
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this pain log entry? This cannot be undone.");
    if (!confirmed) return;
    try {
      await deletePainLogEntry(id);
      await reload();
    } catch (e: any) {
      setError(e.message || "Failed to delete entry");
    }
  }

  const active = entries.filter((e) => !e.resolved);
  const past = entries.filter((e) => e.resolved);

  return (
    <div className="growthPage">
      <div className="growthHeaderRow">
        <div>
          <h1 className="growthTitle">Pain Log</h1>
          <div className="growthMuted">
            <Link to="/growth" className="growthLinkPill">Weekly Check-In →</Link>
            {" · "}
            <Link to="/growth/pillars" className="growthLinkPill">Pillars →</Link>
          </div>
        </div>
        <MemberSwitcher activeSlug={activeSlug} onChange={setActiveSlug} />
      </div>

      {error && <div className="growthError">{error}</div>}
      {memberError && <div className="growthError">Couldn't load profiles ({memberError}).</div>}
      {(memberLoading || loading) && <div className="growthMuted">Loading…</div>}

      <section className="growthCard">
        <h2 className="growthSectionTitle">Log a new issue</h2>
        <label className="growthLabel">Location</label>
        <input
          className="growthInput"
          placeholder="e.g. lower back, left knee"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <label className="growthLabel">Start date</label>
        <input
          type="date"
          className="growthInput"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <label className="growthLabel">Notes (optional)</label>
        <textarea
          className="growthTextarea"
          placeholder="Any detail worth remembering"
          value={notes}
          maxLength={600}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="button"
          className="growthBtnPrimary"
          onClick={handleAdd}
          disabled={adding || !location.trim() || !activeMember}
        >
          {adding ? "Adding…" : "Add entry"}
        </button>
      </section>

      <section className="growthCard">
        <h2 className="growthSectionTitle">Active issues</h2>
        {active.length === 0 ? (
          <div className="growthMuted growthEmptyState">No active pain log entries.</div>
        ) : (
          <ul className="growthPainList">
            {active.map((e) => (
              <PainLogRow key={e.id} entry={e} onToggle={handleToggleResolved} onDelete={handleDelete} />
            ))}
          </ul>
        )}
      </section>

      <details className="growthCard">
        <summary className="growthSectionTitle growthGoalsSummary">
          Past issues ({past.length})
        </summary>
        {past.length === 0 ? (
          <div className="growthMuted growthEmptyState">Nothing resolved yet.</div>
        ) : (
          <ul className="growthPainList">
            {past.map((e) => (
              <PainLogRow key={e.id} entry={e} onToggle={handleToggleResolved} onDelete={handleDelete} />
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

function PainLogRow({
  entry,
  onToggle,
  onDelete,
}: {
  entry: GrowthPainLogEntry;
  onToggle: (e: GrowthPainLogEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="growthPainRow">
      <div>
        <div className="growthPainLocation">{entry.location}</div>
        <div className="growthMuted">
          Started {entry.start_date}
          {entry.resolved && entry.resolved_date ? ` · resolved ${entry.resolved_date}` : ""}
        </div>
        {entry.notes && <div className="growthPainNotes">{entry.notes}</div>}
      </div>
      <div className="growthMonthWeekActions">
        <button type="button" className="growthBtnEditSm" onClick={() => onToggle(entry)}>
          {entry.resolved ? "Reopen" : "Mark resolved"}
        </button>
        <button type="button" className="growthBtnDangerSm" onClick={() => onDelete(entry.id)}>
          Delete
        </button>
      </div>
    </li>
  );
}
