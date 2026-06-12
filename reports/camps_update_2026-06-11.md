# Camp Data Update - June 11, 2026

First full run of the new change-detection workflow (`scripts/check_sources.py`).

## Scan results (93 camps)

| Result | Count | Meaning |
|---|---|---|
| Changed | 0 | No pages differed from their snapshot |
| Same | 6 | Identical to the 2026-06-10 baseline |
| New baseline | 82 | First snapshot saved; diffs start next run |
| Errors | 5 | Page unreachable; investigated below |

## The 5 fetch errors, resolved

| Camp | Problem | Outcome |
|---|---|---|
| easthampton-rec-camp-nonotuck | Old page 404 | Source URL updated to easthamptonma.gov/172/Camp-Nonotuck-Summer-Day-Camp. Data on the new page matches ours (verified). |
| springfield-parks-rec-summer-programs | Old page 404 | URL updated to springfield-ma.gov/park/after-school. Full 2026 data added: ages 6-13, Jul 1-Aug 7, 8:30am-3pm, **free**, four sites (Camp Star, Kiley, Van Sickle, Forest Park ECOS). Was almost entirely TBD before. |
| montague-parks-rec-summer-camp | Whole domain dead (montagueparksandrec.com) | Moved to montagueparksrec.com/p/1029/Summer-Camp. Data matches ours (verified). |
| camp-lion-knoll | Whole domain down (girlsclubofgreenfield.org) | Org rebranded as The Learning Knoll; source URL now thelearningknoll.org. Financial aid confirmed available. |
| downtown-sounds-summer | Site returning HTTP 500 (entire domain) | Could not verify; likely temporary outage. Entry unchanged; re-check next run. |

## Site change shipped alongside

`cost.perWeek: 0` now displays as "Free" everywhere (cards, table, modal,
planner, cost totals) and passes every max-cost filter. Previously a free camp
would have shown "Cost TBD". Springfield's free program is the first user.

## Data quality after this run

- 93 camps, 0 validation errors/warnings
- lastVerified: 4 camps today, 60 within 90 days, 29 older (those 29 now have
  baselines, so the July 1 automated check will flag any that change)
- Springfield camp went from 4 missing fields to 0

## Next run

The monthly GitHub Action (1st of each month) now has baselines for 88 of 93
camps and will diff all of them. Downtown Sounds should be re-checked then.
