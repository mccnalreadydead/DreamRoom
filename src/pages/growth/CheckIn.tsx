import { useEffect, useMemo, useState } from "react";
import { useActiveMember } from "../../growth/hooks/useActiveMember";
import { useCheckInDraft } from "../../growth/hooks/useCheckInDraft";
import MemberSwitcher from "../../growth/components/MemberSwitcher";
import { GROWTH_PILLARS, MAX_GOALS_PER_CHECK_IN, PILLAR_ANCHOR_TEXT, FOLLOWTHROUGH_ANCHOR_TEXT } from "../../growth/lib/constants";
import { toDateKey, weekStartMonday } from "../../growth/lib/scoring";
import {
  fetchCheckInForWeek,
  fetchGoalsForCheckIn,
  fetchPriorCheckIn,
  markGoalCompleted,
  replaceGoals,
  upsertCheckIn,
  type GrowthGoal,
} from "../../growth/lib/api";
import { Link } from "react-router-dom";
import "./growth.css";

type Draft = {
  scorePhysical: number | null;
  scoreMental: number | null;
  scoreTimeEnergy: number | null;
  scoreRelationships: number | null;
  scoreHabits: number | null;
  scoreWorkMoney: number | null;
  notePhysical: string;
  noteMental: string;
  noteTimeEnergy: string;
  noteRelationships: string;
  noteHabits: string;
  noteWorkMoney: string;
  goalFollowthrough: number | null;
  proudOf: string;
  goals: string[];
  adjustments: string;
  reflection: string;
};

const EMPTY_DRAFT: Draft = {
  scorePhysical: null,
  scoreMental: null,
  scoreTimeEnergy: null,
  scoreRelationships: null,
  scoreHabits: null,
  scoreWorkMoney: null,
  notePhysical: "",
  noteMental: "",
  noteTimeEnergy: "",
  noteRelationships: "",
  noteHabits: "",
  noteWorkMoney: "",
  goalFollowthrough: null,
  proudOf: "",
  goals: ["", "", "", "", ""],
  adjustments: "",
  reflection: "",
};

const NOTE_KEY: Record<string, keyof Draft> = {
  physical: "notePhysical",
  mental: "noteMental",
  time_energy: "noteTimeEnergy",
  relationships: "noteRelationships",
  habits: "noteHabits",
  work_money: "noteWorkMoney",
};
const SCORE_KEY: Record<string, keyof Draft> = {
  physical: "scorePhysical",
  mental: "scoreMental",
  time_energy: "scoreTimeEnergy",
  relationships: "scoreRelationships",
  habits: "scoreHabits",
  work_money: "scoreWorkMoney",
};

export default function CheckIn() {
  const { activeSlug, setActiveSlug, activeMember, loading: memberLoading, error: memberError } = useActiveMember();
  const [checkInDate, setCheckInDate] = useState<string>(() => toDateKey(new Date()));
  const weekStart = useMemo(() => weekStartMonday(new Date(checkInDate + "T00:00:00")), [checkInDate]);

  const { draft, update, savedAt } = useCheckInDraft<Draft>(activeSlug, weekStart, EMPTY_DRAFT);

  const [existingId, setExistingId] = useState<string | null>(null);
  const [priorGoals, setPriorGoals] = useState<GrowthGoal[]>([]);
  const [goalDone, setGoalDone] = useState<Record<string, boolean>>({});
  const [loadingCheckIn, setLoadingCheckIn] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Load existing check-in for this member+week (edit mode instead of duplicating),
  // and last week's goals for the follow-through question.
  useEffect(() => {
    if (!activeMember) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingCheckIn(true);
        setError(null);
        const existing = await fetchCheckInForWeek(activeMember.id, weekStart);
        const prior = await fetchPriorCheckIn(activeMember.id, weekStart);
        const priorGoalsRows = prior ? await fetchGoalsForCheckIn(prior.id) : [];
        if (cancelled) return;

        setPriorGoals(priorGoalsRows);
        setGoalDone(
          Object.fromEntries(priorGoalsRows.map((g) => [g.id, g.completed ?? false]))
        );

        if (existing) {
          setExistingId(existing.id);
          update({
            scorePhysical: existing.score_physical,
            scoreMental: existing.score_mental,
            scoreTimeEnergy: existing.score_time_energy,
            scoreRelationships: existing.score_relationships,
            scoreHabits: existing.score_habits,
            scoreWorkMoney: existing.score_work_money,
            notePhysical: existing.note_physical ?? "",
            noteMental: existing.note_mental ?? "",
            noteTimeEnergy: existing.note_time_energy ?? "",
            noteRelationships: existing.note_relationships ?? "",
            noteHabits: existing.note_habits ?? "",
            noteWorkMoney: existing.note_work_money ?? "",
            goalFollowthrough: existing.goal_followthrough,
            proudOf: existing.proud_of ?? "",
            adjustments: existing.adjustments ?? "",
            reflection: existing.reflection ?? "",
          });
          const rows = await fetchGoalsForCheckIn(existing.id);
          if (!cancelled && rows.length > 0) {
            const goals = ["", "", "", "", ""];
            rows.forEach((g, i) => {
              if (i < MAX_GOALS_PER_CHECK_IN) goals[i] = g.goal_text;
            });
            update({ goals });
          }
        } else {
          setExistingId(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load check-in");
      } finally {
        if (!cancelled) setLoadingCheckIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMember?.id, weekStart]);

  const hasPriorGoals = priorGoals.length > 0;

  const totalFields =
    GROWTH_PILLARS.length + 2 /* proud_of, reflection */ + 1 /* adjustments */ + (hasPriorGoals ? 1 : 0);
  const filledFields =
    GROWTH_PILLARS.filter((p) => draft[SCORE_KEY[p.key]] != null).length +
    (draft.proudOf.trim() ? 1 : 0) +
    (draft.reflection.trim() ? 1 : 0) +
    (draft.adjustments.trim() ? 1 : 0) +
    (hasPriorGoals && draft.goalFollowthrough != null ? 1 : 0);
  const progressPct = Math.round((filledFields / totalFields) * 100);

  async function handleSave() {
    if (!activeMember) return;
    try {
      setSaveState("saving");
      setError(null);
      const saved = await upsertCheckIn({
        id: existingId ?? undefined,
        member_id: activeMember.id,
        week_start: weekStart,
        check_in_date: checkInDate,
        score_physical: draft.scorePhysical,
        score_mental: draft.scoreMental,
        score_time_energy: draft.scoreTimeEnergy,
        score_relationships: draft.scoreRelationships,
        score_habits: draft.scoreHabits,
        score_work_money: draft.scoreWorkMoney,
        goal_followthrough: hasPriorGoals ? draft.goalFollowthrough : null,
        note_physical: draft.notePhysical || null,
        note_mental: draft.noteMental || null,
        note_time_energy: draft.noteTimeEnergy || null,
        note_relationships: draft.noteRelationships || null,
        note_habits: draft.noteHabits || null,
        note_work_money: draft.noteWorkMoney || null,
        proud_of: draft.proudOf || null,
        adjustments: draft.adjustments || null,
        reflection: draft.reflection || null,
      });
      setExistingId(saved.id);
      await replaceGoals(
        saved.id,
        activeMember.id,
        draft.goals.map((text, i) => ({ goal_text: text, sort_order: i }))
      );
      setSaveState("saved");
    } catch (e: any) {
      setError(e.message || "Failed to save check-in");
      setSaveState("error");
    }
  }

  return (
    <div className="growthPage">
      <div className="growthHeaderRow">
        <div>
          <h1 className="growthTitle">Weekly Check-In</h1>
          <div className="growthMuted">
            Week of {weekStart} · <Link to="/growth/pillars" className="growthLinkPill">View Pillars →</Link>
          </div>
        </div>
        <MemberSwitcher activeSlug={activeSlug} onChange={setActiveSlug} />
      </div>

      <div className="growthCard">
        <label className="growthLabel">Check-in date</label>
        <input
          type="date"
          className="growthInput"
          value={checkInDate}
          onChange={(e) => setCheckInDate(e.target.value)}
        />
      </div>

      <div className="growthProgressWrap">
        <div className="growthProgressBar">
          <div className="growthProgressFill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="growthMuted growthProgressLabel">
          {progressPct}% complete{savedAt ? " · draft saved" : ""}
        </div>
      </div>

      {error && <div className="growthError">{error}</div>}
      {memberError && (
        <div className="growthError">
          Couldn't load Devan/Chad profiles ({memberError}). Have you run the Phase 1 migration
          (supabase/migrations/20250924120000_growth_phase1.sql) in the Supabase SQL editor yet?
        </div>
      )}
      {(memberLoading || loadingCheckIn) && <div className="growthMuted">Loading…</div>}

      {hasPriorGoals && (
        <section className="growthCard">
          <h2 className="growthSectionTitle">Last week's goals</h2>
          <ul className="growthGoalList">
            {priorGoals.map((g) => (
              <li key={g.id}>
                <label className="growthGoalDoneRow">
                  <input
                    type="checkbox"
                    checked={goalDone[g.id] ?? false}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setGoalDone((prev) => ({ ...prev, [g.id]: checked }));
                      try {
                        await markGoalCompleted(g.id, checked);
                      } catch (err: any) {
                        setError(err.message || "Failed to update goal");
                      }
                    }}
                  />
                  <span>{g.goal_text}</span>
                </label>
              </li>
            ))}
          </ul>
          <label className="growthLabel">
            Overall, how well did you follow through on last week's goals? (1-10)
          </label>
          <div className="growthMuted">{FOLLOWTHROUGH_ANCHOR_TEXT}</div>
          <ScoreSlider
            value={draft.goalFollowthrough}
            onChange={(v) => update({ goalFollowthrough: v })}
          />
        </section>
      )}

      {GROWTH_PILLARS.map((pillar) => (
        <section key={pillar.key} className="growthCard">
          <h2 className="growthSectionTitle">{pillar.label}</h2>
          <div className="growthMuted">{pillar.description}</div>
          <div className="growthMuted">{PILLAR_ANCHOR_TEXT}</div>
          <ScoreSlider
            value={draft[SCORE_KEY[pillar.key]] as number | null}
            onChange={(v) => update({ [SCORE_KEY[pillar.key]]: v } as Partial<Draft>)}
          />
          <textarea
            className="growthTextarea"
            placeholder={`Notes on ${pillar.label.toLowerCase()} (optional)`}
            value={draft[NOTE_KEY[pillar.key]] as string}
            onChange={(e) => update({ [NOTE_KEY[pillar.key]]: e.target.value } as Partial<Draft>)}
          />
        </section>
      ))}

      <section className="growthCard">
        <h2 className="growthSectionTitle">Proud of</h2>
        <textarea
          className="growthTextarea"
          placeholder="What are you proud of this week?"
          value={draft.proudOf}
          onChange={(e) => update({ proudOf: e.target.value })}
        />
      </section>

      <section className="growthCard">
        <h2 className="growthSectionTitle">Goals for next week</h2>
        {draft.goals.map((g, i) => (
          <input
            key={i}
            className="growthInput growthGoalInput"
            placeholder={`Goal ${i + 1}`}
            value={g}
            onChange={(e) => {
              const goals = [...draft.goals];
              goals[i] = e.target.value;
              update({ goals });
            }}
          />
        ))}
      </section>

      <section className="growthCard">
        <h2 className="growthSectionTitle">Adjustments</h2>
        <textarea
          className="growthTextarea"
          placeholder="What will you adjust going forward?"
          value={draft.adjustments}
          onChange={(e) => update({ adjustments: e.target.value })}
        />
      </section>

      <section className="growthCard">
        <h2 className="growthSectionTitle">Reflection</h2>
        <textarea
          className="growthTextarea"
          placeholder="Anything else on your mind?"
          value={draft.reflection}
          onChange={(e) => update({ reflection: e.target.value })}
        />
      </section>

      <button
        type="button"
        className="growthBtnPrimary"
        onClick={handleSave}
        disabled={saveState === "saving" || !activeMember}
      >
        {saveState === "saving" ? "Saving…" : existingId ? "Update Check-In" : "Save Check-In"}
      </button>
      {saveState === "saved" && <span className="growthSavedNote">Saved ✓</span>}
    </div>
  );
}

function ScoreSlider({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="growthScoreSlider">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={`growthScoreDot${value === n ? " active" : ""}`}
          onClick={() => onChange(n)}
          aria-label={`Score ${n}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
