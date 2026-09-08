# Season Rollover Specification

How to roll the camp database from one summer season to the next (first run:
January 2027, rolling 2026 → 2027). Written June 2026 as a handoff doc; an
LLM agent should be able to execute this with no other context.

## 1. Problem

The database holds exactly one season of dates, costs, and registration info.
Without a rollover, last season's data masquerades as current: in March 2027 a
camp showing "weeks: Jun 29..." looks like it has confirmed 2027 dates when it
doesn't. But deleting old data wastes it — a camp that hasn't published 2027
info yet is far more useful showing "last year: 7 weeks, $250/week" than
showing nothing. Parents want both: trust that visible dates are current, and
historical context for camps that haven't announced yet.

## 2. Already in place (do not rebuild)

- Week dropdown, planner columns, and the modal "Sessions" year label all
  derive from the data (`seasonYear`/`seasonLastMonday` in app.js). New-season
  dates flow through with no code changes.
- Planner localStorage cleanup silently drops assignments for weeks a camp no
  longer runs, so saved 2026 plans degrade gracefully when 2027 dates load.
- `scripts/check_data.py` derives the season year from `lastUpdated`.
- Full history: git history of camps.json plus local `data/history/` snapshots.

## 3. Schema change

Each camp gains an optional `lastSeason` block, written only by the rollover
script. Season-specific fields move there; durable fields (name, organization,
location, description, categories, source url, ages) stay where they are.

```json
{
  "id": "camp-lion-knoll",
  "dates": {
    "weeks": [],
    "weeksPerSession": 2,
    "sessionLength": null,
    "hours": null,
    "extendedCare": null
  },
  "cost": { "perWeek": null, "notes": null, "financialAid": true },
  "registration": { "opens": null, "deadline": null, "url": "..." },
  "incomplete": ["dates", "cost", "hours", "registration"],
  "lastSeason": {
    "year": 2026,
    "weeks": ["2026-06-22", "..."],
    "weeksPerSession": 2,
    "sessionLength": "1 week",
    "hours": "9:00am-4:00pm",
    "extendedCare": "Before and after care available",
    "costPerWeek": 250,
    "costNotes": "$250/week. Early enrollment discount...",
    "registrationOpened": "2026-03-01"
  }
}
```

Decisions baked into this design:
- **Cost moves too.** A price displayed as current must be a verified
  current-season price; stale prices would corrupt the max-cost filter. The
  old price is preserved in `lastSeason.costPerWeek` and shown as historical.
- `financialAid` and `ages` are treated as durable (they rarely change) and
  are NOT cleared. `weeksPerSession` stays in `dates` as a durable default
  AND is copied into lastSeason for the record.
- When a camp is re-verified for the new season, its current fields are
  filled in and `lastSeason` is left in place (harmless, and useful if the
  camp is later marked defunct). The UI prefers current-season data whenever
  present.

## 4. The rollover script (`scripts/rollover_season.py`)

Run once, in January, before the new-season research push.

1. Refuse to run if `lastUpdated` year == the target new year (already rolled).
2. Archive the final old-season file to `data/{oldYear}/camps.json`
   (tracked in git, NOT gitignored — this is the permanent public archive).
3. For every camp:
   - Build `lastSeason` from the current dates/cost/registration fields
     (only include keys that have values; skip camps that had no week data
     AND no cost — nothing worth archiving).
   - Null out: `dates.weeks` (set `[]`), `sessionLength`, `hours`,
     `extendedCare`, `cost.perWeek`, `cost.notes`, `registration.opens`,
     `registration.deadline`.
   - Rebuild `incomplete` to list the now-missing fields.
4. Set top-level `lastUpdated` to the run date and bump `version`.
5. Print a summary table (camps archived, camps with no data to archive).
6. The operator then runs `scripts/check_data.py`, commits, and pushes.

Note: `check_data.py` needs one adjustment at the same time — its season-window
warning (weeks must fall in May–Sep of lastUpdated's year) should skip camps
whose `dates.weeks` is empty, which it already does, and should NOT inspect
`lastSeason` blocks.

## 5. UI changes (small, ship with or before the rollover)

1. **Modal**: when a camp has no current `dates.weeks` but has `lastSeason`,
   show a "Last summer ({year})" section: week count and date span, hours,
   and cost ("$250/week in 2026"), followed by the existing "Check website
   for {seasonYear} dates" line. Prefix every lastSeason value with its year;
   never blend the two seasons in one sentence.
2. **Cards/table**: where cost shows "Cost TBD", append the historical hint
   if available: "Cost TBD ($250 in 2026)". Keep it visually secondary
   (text-secondary color). Same idea for "Ages TBD" is NOT needed (ages are
   durable).
3. **Week filter and planner are unchanged**: they read current weeks only,
   so un-reverified camps naturally drop out of week filtering and the
   planner grid (they'll sit in the planner's "Dates unknown" list). This is
   the desired "only show camps with current dates" behavior.
4. `seasonYear` fallback: with zero current-season weeks in the data (the
   state right after rollover), `seasonLastMonday` is null and `seasonYear`
   falls back to the current calendar year — correct in January. Verify this.

## 6. Acceptance criteria

- After running the script on a copy of the data: archived file exists and
  equals the pre-roll camps.json; every camp with old week data has a
  `lastSeason` block; no camp has current weeks; `check_data.py` exits 0.
- Modal for a rolled camp shows the "Last summer (2026)" block with cost,
  and "Check website for 2027 dates".
- Card for a rolled camp with old cost shows "Cost TBD ($250 in 2026)".
- Week dropdown is empty-but-functional (only "Any Week") until the first
  2027 dates are added, then repopulates automatically.
- A saved 2026 planner plan loads without errors: stars intact, assignments
  dropped, planner shows everything under "Dates unknown".
- As 2027 data is researched camp by camp (via /camps-update), each verified
  camp pops back into week filtering and the planner with no further work.

## 7. Out of scope

- A browsable archive UI for past seasons (the tracked JSON archive is enough;
  revisit only if users ask).
- Multi-season comparison ("prices rose 8%") — fun, not needed.
- Auto-detecting the new season's dates; that stays the job of the
  January–February research push with check_sources.py narrowing the work.
