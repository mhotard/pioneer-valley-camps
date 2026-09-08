# Summer Planner Feature Specification

Implementation handoff spec for the Pioneer Valley Kids Camps summer planner.
Written 2026-06-11. Intended to be executable by an LLM agent (or several,
one per phase) with no other context beyond this repo.

## 1. Problem and goal

Parents don't book one camp; they assemble a summer. The real task is covering
roughly 10 weeks (mid-June through late August) with a mix of camps for a
specific child, subject to age, budget, and drive time. Today the site answers
"what camps exist?" but not "is my summer covered, and what will it cost?"

The planner lets a parent:
1. Save camps to a shortlist while browsing (star icon).
2. See a week-by-week grid of which shortlisted camps run which weeks.
3. Assign one camp to each week to build a plan.
4. See uncovered weeks and a running cost estimate.
5. Keep the plan across visits (localStorage) and share it via URL (Phase 4).

## 2. Constraints (non-negotiable)

- Static site on GitHub Pages. No backend, no accounts, no build step, no
  frameworks, no npm. Vanilla JS/CSS/HTML only, matching the existing style of
  `js/app.js` and `css/styles.css` (4-space indent, const/let, template
  literals, single quotes).
- Reuse existing helpers: `parseISODate`, `toISODate`, `mondayOfWeek`,
  `escapeHtml`, `openModal`, and the category lookup pattern. Every piece of
  camp data rendered into HTML goes through `escapeHtml`.
- Must not break existing behavior: filters, shareable filter URLs (the
  `FILTER_PARAMS` table), `#camp-id` modal deep links, grid/list view toggle,
  table sorting.
- Mobile first: the grid must work at 380px wide (horizontal scroll with a
  sticky camp-name column).
- Accessibility: real `<button>` elements, `aria-pressed` on star toggles, the
  planner grid is a real `<table>` with `<th scope>`, status text uses
  `aria-live="polite"`.

## 3. Data realities the design must respect

From `data/camps.json` (93 camps, June 2026):
- 41 camps have no `dates.weeks` data. They cannot appear in a week grid.
  They must NOT silently disappear: show them in a separate "Dates unknown"
  list inside the planner with a link to their modal.
- Week start dates are not all Mondays (Sunday starts for overnight camps,
  Tuesday starts after holidays). Always bucket weeks via `mondayOfWeek`.
- 49 camps have no `cost.perWeek`. Cost totals must show
  "$X + N weeks TBD", never pretend TBD is $0.
- Multi-week sessions are modeled via `dates.weeksPerSession` (int, default 1,
  added June 2026): each entry in `dates.weeks` is a session START covering
  that many consecutive weeks. `campCoveredWeeks(camp)` in app.js is the
  single source of truth for which weeks a camp runs; the week filter, the
  planner grid, and assignment validity all use it.

## 4. UX specification

### 4.1 Entry points
- A third view-toggle button labeled with a calendar icon, after grid/list,
  `id="view-planner"`, title "Summer Planner". Selecting it sets
  `currentView = 'planner'` and `body.className = 'view-planner'`.
- A star button on every camp card (top-right corner), every table row (new
  first column), and in the modal header. Starred state is shared across all
  three. Star = add to shortlist, not assignment.
- When at least one camp is starred, show a small "Planner (N)" count chip
  next to the view toggle so users discover the feature after their first star.

### 4.2 Planner view layout (top to bottom)
1. **Summary strip**: one cell per summer week (Mon dates from data, same set
   as the week dropdown). Each cell shows the week ("Jun 22") and the assigned
   camp names (truncated, stacked; "—" if none). A week with 3+ camps may
   show "3 camps" instead of stacking. Below: "N of M weeks covered" (covered
   = at least one camp assigned) and "Estimated cost: $X" (+ " plus N camp
   weeks TBD" counting every assignment whose camp lacks perWeek). Strip is
   `aria-live="polite"`.
2. **Planner grid**: `<table>`. Columns = the same weeks. Rows = starred camps,
   sorted by name. First column (sticky): camp name (button, opens modal),
   town, `$perWeek` or "TBD", `sessionLength` if present, and an unstar button.
   Cells:
   - Camp runs that week and is assigned: filled style + check, click unassigns.
   - Camp runs that week, not assigned: subtle "available" style, click assigns.
     Multiple camps may be assigned to the same week (two kids, half-day
     combos, or undecided shortlists); a cell click only ever toggles its own
     camp/week pair.
   - Camp doesn't run that week: empty/disabled, not clickable.
3. **Dates unknown** section: starred camps without `dates.weeks`, as a simple
   list: name (opens modal) + "Check website for dates" + unstar button.
4. **Footer actions**: "Clear plan" (confirm via `confirm()`, clears
   assignments but keeps stars) and, Phase 4, "Copy plan link".

### 4.3 Empty states
- No starred camps: planner view shows a short explainer ("Star camps while
  browsing to start planning your summer") and a button that switches back to
  grid view.
- Starred camps but all in "dates unknown": grid is replaced by a note that
  none of the saved camps have published week data yet.

### 4.4 Rules
- A week can hold any number of camps; each cell click toggles exactly that
  camp/week assignment and never touches other camps' assignments.
- Unstarring a camp removes any assignments it holds.
- Assignments only exist for week/camp pairs where the camp actually runs;
  if a data refresh removes a week, drop that assignment at load time.
- The planner ignores the search/filter state; it always shows all starred
  camps. (Filters are for discovery; the planner is the workspace.)

## 5. Persistence and sharing

localStorage key `pvcamps-planner-v1`:

```json
{
  "starred": ["camp-howe", "arcadia-nature-camp"],
  "assignments": {
    "2026-06-22": ["camp-howe"],
    "2026-06-29": ["arcadia-nature-camp", "camp-howe"]
  },
  "updated": "2026-06-11T14:00:00Z"
}
```

Assignment values are always arrays, even with one camp. Weeks with empty
arrays are deleted from the object on save.

Load defensively: unknown camp ids (camp removed from camps.json) are dropped
silently; malformed JSON resets to empty state. Never throw.

**Future-proofing for possible user accounts (architectural requirement):**
all reads and writes of planner state must go through exactly two functions,
`loadPlannerState()` and `savePlannerState(state)`. No other code touches
localStorage or knows where the state lives. The state object must stay
JSON-serializable, and the localStorage key is versioned (`-v1`) so a future
schema can migrate. If accounts are added later (e.g., a hosted auth + data
service like Supabase called from the browser; the static site itself does
not change hosts), only these two functions are replaced with remote calls
plus a localStorage fallback for signed-out users. Render logic, star
toggling, and assignment logic must not change.

Phase 4 share link: `?plan=2026-06-22:camp-howe,2026-06-29:arcadia-nature-camp`
(repeat the week key for multiple camps in one week:
`...,2026-06-29:camp-howe`)
- "Copy plan link" builds the URL and copies via `navigator.clipboard`.
- On load, a `plan` param imports those assignments (and stars the camps
  involved), shows the planner view, then strips `plan` from the URL via
  `history.replaceState` so subsequent filter URL updates don't carry it.
  Imported plan overwrites the local one only after `confirm()` if a local
  plan with assignments exists.
- `plan` must be excluded from `updateURL()` (it is not in `FILTER_PARAMS`,
  so the current implementation already drops it — verify, don't assume).

## 6. Implementation phases

Each phase is independently shippable. Commit at the end of each phase with a
descriptive message; do not push unless the user asks. Run the verification
steps before committing.

### Phase 1: Starring and persistence
- Storage module (top of app.js): `loadPlannerState()`, `savePlannerState()`,
  `toggleStar(campId)`, `isStarred(campId)`.
- Star buttons on cards, table rows, and modal header (`aria-pressed`,
  delegated click handlers alongside the existing card/row delegation; star
  clicks must NOT open the modal — call `e.stopPropagation()` or check the
  star button first in the existing delegated handlers).
- "Planner (N)" chip appears once N > 0 (in Phase 1 it can be inert/hidden
  until Phase 2 adds the view; simplest is to ship the chip with Phase 2 and
  keep Phase 1 to stars only).
- CSS: star button styles for default/starred/hover, consistent with
  `--primary-color` / `--warning-color` palette.

Acceptance: star a camp in grid view; it shows starred in list view and in its
modal; reload the page; it is still starred; unstar from the modal; it is
unstarred everywhere; localStorage shows the documented shape.

### Phase 2: Planner view and grid
- Third view toggle + `view-planner` body class + CSS to hide grid/table/
  no-results sections in planner view (follow the existing
  `.view-grid` / `.view-table` pattern in styles.css).
- `renderPlanner()` builds summary strip (all "—" until Phase 3), grid, and
  dates-unknown list from starred camps. Weeks = union of `mondayOfWeek` over
  all camps' weeks (reuse/extract the logic that builds the week dropdown).
- Sticky first column; horizontal scroll wrapper; verify at 380px width.
- Empty states per 4.3.

Acceptance: star Camp Howe (Sunday starts), Arcadia, and one camp without
week data; open planner; Camp Howe's cells land on the correct Monday-bucketed
weeks; the no-dates camp appears under "Dates unknown"; camp name buttons open
the modal; unstar from the grid removes the row immediately; resize to 380px
and confirm the camp column stays visible while weeks scroll.

### Phase 3: Assignments, coverage, cost
- Cell click assign/unassign per the rules in 4.4; persist via
  `savePlannerState()`; re-render planner on every change.
- Summary strip shows assigned camp per week, covered count, cost total with
  TBD handling.
- "Clear plan" button.
- Load-time cleanup: drop assignments whose camp is unstarred/unknown or no
  longer runs that week.

Acceptance: assign camps to three weeks (two with perWeek, one TBD); summary
shows "3 of N weeks covered" and "Estimated cost: $X plus 1 camp week TBD";
assign a second camp to an occupied week and confirm both appear in that
week's summary cell with both costs counted; reload and confirm the plan
survives; clear plan keeps stars but empties assignments.

### Phase 4 (optional, confirm with the user before building): Share link
Per section 5. Acceptance: copy link in one browser profile, open in a private
window, confirm the plan imports, stars are set, planner view is shown, and
the `plan` param is gone from the address bar after load.

### Phase 5 (built June 2026): Copy for spreadsheet
"Copy for spreadsheet" button beside the share link puts a tab-separated
table on the clipboard (header row; one row per summer week including
uncovered ones; columns Week / Camp / Town; multi-camp weeks get one row per
camp). No cost column by user decision: shared tables coordinate schedules,
not budgets. Pastes directly into Excel or Google Sheets so families can
compare plans side by side. Clipboard fallback chain:
navigator.clipboard -> execCommand textarea -> prompt().

### Possible phase 6 (deferred June 2026, deliberately unbuilt): carpool overlay
The idea: paste a friend's plan link into your planner and their assignments
render as outline markers in your grid, making shared camp weeks (carpool
candidates) visible without leaving the site. Doable without accounts (the
plan-link format already carries everything needed). Deferred because the
spreadsheet copy covers the need and per-child/per-family layering multiplies
UI complexity; revisit only if families are actually exchanging plan tables.

## 7. Files touched

| File | Change |
|---|---|
| `js/app.js` | Storage module, star rendering/delegation, planner view + render functions, view-toggle wiring (~250-350 new lines) |
| `index.html` | Planner view-toggle button, planner section skeleton (`<section id="planner-section">`), star button has no static markup (rendered per camp) |
| `css/styles.css` | Star buttons, planner grid/summary/sticky column, `view-planner` visibility rules, chip |
| `CLAUDE.md` | Short feature summary + localStorage key under a "Summer Planner" heading |

No changes to `data/*.json`, the scripts, or the workflows.

## 8. Verification expected from the implementing agent

- `python3 scripts/check_data.py` still exits 0 (should be untouched; run it
  anyway).
- Serve locally (`python3 -m http.server` from the repo root, or the
  `serve.sh` script) and walk every acceptance list above in a real browser.
- Regression pass: filters still work, filter URLs still round-trip,
  `#camp-id` deep link still opens the modal, list-view sort still works,
  zero-result state still clears the table.
- No console errors or warnings on load or during any acceptance step.

## 9. Out of scope for v1

Multiple children/named plans, capacity or "still has openings" data, session
bundling for multi-week sessions, calendar export (.ics), reminders, backend
anything. If an idea requires a server or a framework, it is out of scope.

## 10. Defaults chosen (flag to the user only if you must deviate)

- Multiple camps per week allowed; cell clicks toggle independently.
- Stars persist independently of plan assignments.
- Planner ignores active filters.
- Week columns derived from data, not hardcoded.
- Feature name in UI: "Summer Planner".
