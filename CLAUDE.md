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
- `dates`: { weeks[], sessionLength, hours, extendedCare }
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

## Suggestion Form

- Powered by Formspree (ID: mwvvknwb)
- Submissions go to account owner's email
- Review and manually add suggested camps

## Categories

outdoor, arts, performing-arts, stem, sports, aquatics, adventure, academic, specialty, general, special-needs, overnight

## Coverage Area

Hampshire County, Franklin County, Hampden County - all towns within ~45 min of Amherst, MA.
