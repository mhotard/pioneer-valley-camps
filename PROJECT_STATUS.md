# Pioneer Valley Kids Camps - Project Status

*Last updated: January 13, 2026*

## What We Built

A searchable, public-facing database of children's summer camps within 45 minutes of Amherst, MA. Parents can filter by age, cost, location, category, extended care options, and more.

**Live site:** https://mhotard.github.io/pioneer-valley-camps

**GitHub repo:** https://github.com/mhotard/pioneer-valley-camps

---

## Current Stats

- **Total camps:** 57
- **Data completeness:** ~49%
- **Towns covered:** 19 (Amherst, Northampton, Springfield, Greenfield, and more)
- **Categories:** 11 (general, outdoor, sports, arts, STEM, performing-arts, etc.)

---

## Features

### Search & Filter
- Text search (name, description, organization)
- Age range filter
- Town filter
- Category filter
- Max cost filter
- Early drop-off checkbox
- Late pickup (5pm+) checkbox
- Financial aid checkbox

### Camp Cards
- Click camp name to open detail modal
- Shows age range, cost, location, categories
- Badges for early drop-off, late pickup, financial aid
- Truncated description on card, full in modal

### Detail Modal
- Full description
- Hours and extended care info
- Cost and financial aid details
- Session dates (formatted as date ranges)
- Registration dates (flexible format support)
- Link to camp website
- Incomplete data warning when applicable

### Other
- Suggestion form (Formspree) - submissions go to pioneervalleysummercamps@gmail.com
- GoatCounter analytics at https://mhotard.goatcounter.com
- Sun favicon
- Mobile responsive design

---

## Project Structure

```
pioneer-valley-camps/
├── index.html              # Main page
├── favicon.svg             # Sun icon for browser tab
├── css/
│   └── styles.css          # All styles
├── js/
│   └── app.js              # Search, filter, modal, rendering
├── data/
│   ├── camps.json          # Main database (57 camps)
│   ├── categories.json     # Category definitions
│   └── regions.json        # Towns in coverage area
├── CLAUDE.md               # Project context for Claude
├── ROADMAP.md              # Growth & monetization plan
└── PROJECT_STATUS.md       # This file
```

---

## Claude Skills Created

Three skills in `~/.claude/skills/`:

### /camps-report
Generates data quality statistics:
- Completeness by field
- Geographic distribution
- Cost analysis
- Schedule analysis (end times, extended care)
- Week coverage gaps
- Category breakdown

### /camps-update
Bulk update workflow:
- Research multiple camps
- Update pricing, dates, registration info
- Generate change report

### /update-camp [name]
Update a single camp:
- Fetch camp website
- Extract updated info
- Show changes for approval
- Update JSON and commit

---

## Data Model

Each camp entry in `camps.json`:

```json
{
  "id": "camp-slug",
  "name": "Camp Name",
  "organization": "Parent Organization",
  "location": { "town": "Northampton", "address": "123 Main St", "region": "Hampshire" },
  "ages": { "min": 5, "max": 12 },
  "dates": {
    "weeks": ["2026-06-29", "2026-07-06"],
    "sessionLength": "1 week",
    "hours": "9am-3pm",
    "extendedCare": "7:30am-5:30pm available"
  },
  "cost": { "perWeek": 350, "notes": "Sibling discount", "financialAid": true },
  "registration": { "opens": "February 2026", "deadline": null, "url": "https://..." },
  "category": ["outdoor", "stem"],
  "description": "Camp description...",
  "source": { "url": "https://...", "lastVerified": "2026-01-13" },
  "incomplete": ["cost", "hours"]
}
```

**Registration date formats supported:**
- Full date: `2026-02-01` (displays as "February 1, 2026")
- Month/year: `February 2026`
- Approximate: `Early January`, `Late March`
- Descriptive: `Coming Soon`, `Rolling admission`

---

## Integrations

| Service | Purpose | Account |
|---------|---------|---------|
| GitHub Pages | Free hosting | mhotard |
| Formspree | Suggestion form | Form ID: mwvvknwb |
| GoatCounter | Analytics | mhotard.goatcounter.com |

---

## Key Data Gaps (from /camps-report)

| Field | % Complete |
|-------|------------|
| Description | 100% |
| Ages | 93% |
| Hours | 44% |
| Extended care | 41% |
| Cost per week | 26% |
| Registration date | 26% |
| Session weeks | 17% |

---

## Roadmap Summary

### Phase 1: Strengthen Pioneer Valley (Current)
- Fill in missing data (target 80% completeness)
- Add more camps (target 75+)
- SEO improvements
- Share in local Facebook groups

### Phase 2: Monetization (3-6 months)
- Featured listings ($50-150/season)
- Donations link
- Newsletter with sponsored slots

### Phase 3: Expansion (6-12 months)
- Upper Valley, NH/VT (best target - similar demo, no competition)
- Portland, ME
- Worcester, MA

### Phase 4: Platform (12+ months)
- Multiple markets
- Camp self-service claiming
- Reviews system

See `ROADMAP.md` for full details.

---

## How to Maintain

### Add a new camp
```
/update-camp new
```
Or manually add to `data/camps.json` and update `totalCamps`.

### Update existing camp
```
/update-camp [Camp Name]
```

### Check data quality
```
/camps-report
```

### Deploy changes
```bash
git add -A
git commit -m "Description of changes"
git push
```
Site updates automatically in ~1 minute.

---

## Costs

| Item | Current Cost |
|------|--------------|
| Hosting (GitHub Pages) | Free |
| Analytics (GoatCounter) | Free |
| Form (Formspree) | Free (50 submissions/month) |
| **Total** | **$0/month** |

### Optional upgrades
- Custom domain: ~$10-15/year
- Private repo + Pages: $4/month (or use Netlify for free)

---

## Contact & Resources

- **Suggestion form email:** pioneervalleysummercamps@gmail.com
- **Analytics:** https://mhotard.goatcounter.com
- **Live site:** https://mhotard.github.io/pioneer-valley-camps
- **Repo:** https://github.com/mhotard/pioneer-valley-camps
