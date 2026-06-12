# Pioneer Valley Kids Camps

A searchable database of children's summer camps within 45 minutes of Amherst, MA.

## Project Structure

```
pioneer-valley-camps/
├── index.html          # Main page with search/filter UI
├── css/styles.css      # All styles
├── js/app.js           # Client-side filtering, modal, rendering
├── data/
│   ├── camps.json      # Main camp database (54 camps)
│   ├── categories.json # Category definitions
│   └── regions.json    # Towns in coverage area
```

## Data Model

Each camp in `camps.json` has:
- `id`, `name`, `organization`
- `location`: { town, address, region }
- `ages`: { min, max }
- `dates`: { weeks[], sessionLength, hours, extendedCare, weeksPerSession }
  - `weeks` holds session START dates; `weeksPerSession` (int, default 1) says
    how many consecutive weeks each start covers. Set it to 2 for camps with
    "2-week sessions" so the week filter and planner cover both weeks.
- `cost`: { perWeek, notes, financialAid }
- `registration`: { opens (flexible format), deadline, url }
- `category`: array of category IDs
- `description`, `source`: { url, lastVerified }
- `incomplete`: array of missing fields

## Registration Date Formats

The `registration.opens` field accepts flexible formats:
- Full date: `2026-02-01` (displays as "February 1, 2026")
- Month/year: `February 2026`
- Approximate: `Early January`, `Mid-February`
- Descriptive: `Rolling admission`

## Common Tasks

### Adding a new camp
1. Add entry to `data/camps.json` following the schema
2. Update `totalCamps` count in the JSON
3. Commit and push to deploy

### Updating camp info
1. Edit the camp entry in `data/camps.json`
2. Update `source.lastVerified` date
3. Remove fields from `incomplete` array if now complete

### Running the update skill
Use `/camps-update` to research and add new camps automatically.

### Cheap checks (run these before any LLM research)
- `python3 scripts/check_data.py` validates camps.json (counts, categories, week dates vs the filter dropdown, incomplete[] consistency) and summarizes staleness and missing data. `--stale 60` lists camps not verified in 60+ days.
- `python3 scripts/check_sources.py` fetches every camp's source URL, diffs visible text against the last snapshot in `cache/`, and prints which pages CHANGED. Only CHANGED camps need re-verification; SAME camps just get `lastVerified` bumped.

## Deployment

- Hosted on GitHub Pages
- Push to `main` branch to deploy
- Live at: https://mhotard.github.io/pioneer-valley-camps
- GitHub Actions: `validate.yml` runs check_data.py on every push; `check-sources.yml` runs check_sources.py on the 1st of each month and opens an issue listing camps whose pages changed (snapshots kept on the `snapshots` branch)

## Summer Planner

Third view toggle (calendar icon). Parents star camps (★ on cards, table rows,
and the modal), then the planner shows starred camps in a weeks-by-camps grid.
Clicking a cell assigns/unassigns that camp for that week (multiple camps per
week allowed); a summary strip shows covered weeks and estimated cost, with
camp weeks lacking a price counted as "TBD". Camps without `dates.weeks` data
appear in a separate "Dates unknown" list. State persists in localStorage key
`pvcamps-planner-v1` ({ starred: [ids], assignments: { weekMonday: [ids] } });
all access goes through `loadPlannerState`/`savePlannerState` so the backend
could be swapped later. Full design in PLANNER_SPEC.md (local, untracked).

## Shareable URLs

Filter state is encoded in query params (`?town=Amherst&cost=400&aid=1`; keys: q, agemin, agemax, town, category, cost, week, early, aid, late). Opening a camp's modal sets `#camp-id`, so links to individual camps work too.

## Suggestion Form

- Powered by Formspree (ID: mwvvknwb)
- Submissions go to account owner's email
- Review and manually add suggested camps

## Categories

outdoor, arts, performing-arts, stem, sports, aquatics, adventure, academic, specialty, general, special-needs, overnight

## Coverage Area

Hampshire County, Franklin County, Hampden County - all towns within ~45 min of Amherst, MA.
