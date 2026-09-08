# Geocoding Specification

Add latitude/longitude to every camp in `data/camps.json` so a future map view
can place them. Written June 2026 as a handoff doc; a Sonnet agent should be
able to execute this end to end with no other context. This spec covers
**geocoding only** — the Leaflet map UI is a separate, later piece of work and
is explicitly out of scope here (see section 9).

## 0. Context an executing agent needs

- Static site, GitHub Pages, no backend, no build step. Scripts are plain
  Python 3 using only the standard library (urllib, json, etc.) — match that;
  do NOT add pip dependencies. Look at `scripts/check_data.py` and
  `scripts/check_sources.py` for the house style before writing code.
- `data/camps.json` shape: top-level `{ lastUpdated, version, totalCamps,
  camps: [...] }`. Each camp has `location: { town, address, region }` where
  `address` is a street address WITHOUT state or zip (e.g. "845 West St") and
  is `null` for ~30 camps. All 99 camps have `town`; 69 have a street address;
  0 have coordinates today.
- Coverage area centers on Amherst, MA; everything should fall within ~45
  driving minutes (roughly a 30-mile radius). `data/regions.json` lists the
  in-scope towns by county.
- Writing convention for camps.json (keep diffs clean): preserve existing key
  order, write with `json.dump(data, f, indent=2, ensure_ascii=False)` followed
  by a single trailing newline. Do NOT reformat or reorder existing entries.
- `cache/` and `data/history/` are gitignored. `check_data.py` is run in CI
  (`.github/workflows/validate.yml`) and must keep passing.

## 1. Goal

For each camp, add `location.lat`, `location.lng`, and a `location.geo`
metadata block. Use only free, keyless geocoders. Camps with a usable street
address get a precise pin; camps with only a town (or a vague/unmappable
address) fall back to the town centroid and are marked approximate. The run
also flags any camp that lands outside the region (the safety net that would
have caught the Easton, PA mistake).

## 2. Data model change

Extend each camp's `location` object (add keys; do not remove existing ones):

```json
"location": {
  "town": "Amherst",
  "address": "845 West St",
  "region": "Hampshire",
  "lat": 42.3699,
  "lng": -72.5292,
  "geo": {
    "precision": "street",
    "approximate": false,
    "source": "census",
    "query": "845 West St, Amherst, MA",
    "geocodedAt": "2026-06-16"
  }
}
```

Field rules:
- `lat`/`lng`: numbers, rounded to 5 decimal places (~1 meter; keeps the file
  small). `null` if geocoding failed entirely.
- `geo.precision`: `"street"` (matched a street address) or `"town"` (fell back
  to town centroid).
- `geo.approximate`: `true` whenever precision is `"town"`, OR when the camp id
  is in the privacy list (section 4) regardless of precision. The future map
  uses this to render a softer/region marker instead of a sharp pin.
- `geo.source`: `"census"` or `"nominatim"`.
- `geo.query`: the exact query string sent to the geocoder. This is the
  staleness key — see section 5.
- `geo.geocodedAt`: ISO date of the run.

## 3. The geocoder script: `scripts/geocode.py`

### Behavior
```
python3 scripts/geocode.py            # geocode every camp missing/stale coords
python3 scripts/geocode.py --limit 5  # first 5 only (sanity check before full run)
python3 scripts/geocode.py --force    # re-geocode all camps, ignoring cache
python3 scripts/geocode.py --ids a b  # only these camp ids
```
Default run geocodes a camp only if it has no `lat`, OR its current query
string (section 5) differs from `geo.query` (address/town changed since last
run). Writes results back into `data/camps.json` in place, then prints a report
(section 6). Saves a snapshot to `data/history/{TODAY}.json` at the end, same
as the other update scripts.

### Geocoder chain (free, no API key, stdlib urllib only)

**Primary — US Census Geocoder** (best for US street addresses):
- Endpoint: `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress`
- Query params: `address={one-line address}`, `benchmark=Public_AR_Current`,
  `format=json`.
- One-line address = `"{address}, {town}, MA"` (append ", MA"; there is no zip
  in the data).
- Response: `result.addressMatches` is a list. Empty = no match. On a match,
  use `addressMatches[0].coordinates` → `{ x: longitude, y: latitude }`.
  Set precision `"street"`, source `"census"`.
- Only call Census when the camp HAS a street address.

**Fallback — Nominatim / OpenStreetMap** (town centroids and last resort):
- Endpoint: `https://nominatim.openstreetmap.org/search`
- Query params: `q={town}, Massachusetts, USA`, `format=json`, `limit=1`,
  `countrycodes=us`.
- Response: list of `{ lat, lon, ... }`. Use `[0]`. Set precision `"town"`,
  source `"nominatim"`, approximate `true`.
- **Usage policy (mandatory):** send a `User-Agent` header identifying the app,
  e.g. `"PioneerValleyCamps geocoder (https://mhotard.github.io/pioneer-valley-camps)"`,
  and rate-limit to **one request per second** (sleep 1s between Nominatim
  calls). Census has no strict limit but sleep 0.2s between its calls to be
  polite.

**Order per camp:**
1. Has street address → try Census. On match, done (street precision).
2. Census missed, or no street address → try Nominatim town centroid (town
   precision, approximate).
3. Both fail (rare) → `lat`/`lng` = `null`, add `"geocode"` to the camp's
   `incomplete` array, list it in the report for manual handling.

### Caching
Avoid re-hitting APIs: keep a `cache/geocode_cache.json` mapping query string →
`{lat, lng, source, precision}`. Check it before any network call; write to it
after every successful call. `cache/` is gitignored, so this is local-only and
safe to delete. `--force` bypasses the cache.

## 4. Privacy: town-level pinning for private venues

Some camps run out of private homes or small studios. Pinning a sharp marker on
a residential address is needlessly invasive, so force these to `approximate`
(still geocode the street so the pin is roughly right, but the map will fuzz
it). Start with this list and use judgment for new ones (any camp whose venue
is clearly a residence or a personal studio):

```
miss-leticia-music-camp
glover-piano-studio-summer
catherine-grace-studios-summer
```

(Downtown Sounds is a commercial storefront at 21 Pleasant St — leave it
precise.) For listed ids: geocode normally, then set `geo.approximate = true`
regardless of precision. Keep this list as a constant at the top of the script.

## 5. Staleness detection

The current query for a camp is `"{address}, {town}, MA"` when it has an
address, else `"{town}, Massachusetts, USA"`. On a default run, re-geocode if
`geo.query` is missing or != the current query. This makes the script safe to
run repeatedly and after any address edit; it becomes a one-line step in the
`/camps-update` and `/update-camp` flows (add it there once working).

## 6. Out-of-region safety net (the Easton, PA check)

After geocoding, compute the great-circle (haversine) distance in miles from
each camp to the center point. Center = Amherst, MA ≈ `(42.3732, -72.5199)`
(hardcode this, with a comment; optionally geocode "Amherst, MA" once at
startup and fall back to the constant). Flag any camp **> 40 miles** from
center in the report as a likely wrong-location / wrong-state entry for human
review. Do not auto-delete — just surface it loudly. (The removed KE Camps /
Easton PA entry would have shown ~200 miles.)

## 7. Report format (printed to stdout)

```
Geocoded: N camps   (street: X, town-level: Y, failed: Z)
Skipped (already current): M

NEEDS REVIEW
  out of region (>40mi):   <id>  <miles>  <query>
  failed to geocode:       <id>  <query>
  town-level fallback:     <id>  <town>     (had address: <address|->)
```
Keep it scannable. The three review buckets are what the operator acts on.

## 8. `scripts/check_data.py` additions

Add two WARNINGS (not errors — these must not block CI):
1. Camp has `location.address` but no `location.lat` → "not geocoded yet".
2. Camp has coordinates but is > 40 miles from the Amherst center → "may be
   out of region (check state)". Reuse the same haversine helper; consider
   factoring it into a tiny shared module or just duplicating ~8 lines.

Do not add these as ERRORS; geocoding completeness is a soft goal and a
borderline-distance camp may be legitimate.

## 9. Out of scope (do NOT build here)

- The Leaflet map view, markers, popups, clustering, the 4th view toggle. That
  is a separate spec. This task ends when every camp has coordinates, the
  review buckets are resolved or accepted, and check_data passes.
- Geocoding services that need an API key or billing (Google, Mapbox).
- Drive-time/isochrone calculation. Straight-line distance is enough for the
  safety net.

## 10. Acceptance criteria

- `python3 scripts/geocode.py --limit 5` produces sane coordinates (spot-check
  2–3 against the real locations) before any full run.
- After a full run: every camp with a street address has `precision: "street"`
  coordinates except those that genuinely failed (listed in the report); every
  town-only camp has `precision: "town"` approximate coordinates; the three
  privacy-list camps have `approximate: true`.
- No camp is > 40 miles from center, OR every such camp has been reviewed and
  confirmed legitimate (note it in the run's commit message).
- Re-running with no data changes reports "Skipped (already current)" for all
  camps and makes no network calls (cache hit) and no file churn beyond
  `lastUpdated`/snapshot.
- `python3 scripts/check_data.py` exits 0 (warnings allowed, no errors).
- `data/camps.json` diff shows only added `lat`/`lng`/`geo` keys; no existing
  field reordered or changed.

## 11. Suggested commit

After the run and review, commit `scripts/geocode.py`, the updated
`data/camps.json`, and the `check_data.py` additions together. Mention in the
message how many camps geocoded at street vs town precision and that the
out-of-region check passed. End the message with the project's standard
`Co-Authored-By` trailer.
