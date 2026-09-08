# Map View Specification

> Implemented June 2026. Kept as design history. One detail has since changed:
> views are selected with `body[data-view="..."]` set by `render()` in
> `js/app.js`, not the `view-grid` / `view-table` / `view-map` body classes
> described below.

Add a map view to the Pioneer Valley Kids Camps site: a 4th view toggle that
plots the filtered camps on an interactive map. Written June 2026 as a handoff
doc; a Sonnet agent should be able to execute it end to end with no other
context.

**Prerequisite:** every camp must already have `location.lat`/`lng`/`geo` from
`GEOCODING_SPEC.md`. If coordinates are missing, do that first — this spec
assumes they exist.

## 0. Context an executing agent needs

- Static site, GitHub Pages, no backend, no build step, no npm/bundler. All
  app logic is vanilla JS in `js/app.js`; styles in `css/styles.css`; markup in
  `index.html`. Match the existing style (4-space indent, const/let, template
  literals, single quotes). Read `js/app.js` fully before starting.
- There are already three views toggled by a single `currentView` variable and
  a `setView(view)` function. The toggle buttons are `#view-grid`,
  `#view-list`, `#view-planner`; the body gets class `view-grid` / `view-table`
  / `view-planner`; CSS visibility rules in `styles.css` follow that pattern.
  **The map is a 4th view (`'map'`, body class `view-map`, button
  `#view-map`) built exactly on this pattern.**
- `applyFilters()` produces the global `filteredCamps` array and ends by calling
  `renderCamps()`, which dispatches on `currentView`. `openModal(camp)` is the
  shared detail modal. `escapeHtml(text)` / `escapeAttr(text)` exist for safe
  interpolation. Reuse all of these; do not reinvent them.
- Each camp has `location.lat` (number|null), `location.lng`, and
  `location.geo.precision` (`"street"`|`"town"`) and `location.geo.approximate`
  (bool). Camps where geocoding failed have `lat: null` and cannot be mapped.

## 1. Goal

A "Map" view showing one marker per camp **in the current filtered set**, so
"STEM camps under $400 with financial aid" becomes a map of exactly those.
Clicking a marker opens a popup with the camp's name/town/cost and a button
that opens the existing detail modal. Approximate (town-level) camps are shown
distinctly so the map never implies false precision. Camps without coordinates
are surfaced as a count, not silently dropped.

## 2. Dependency: Leaflet (vendored)

Use **Leaflet 1.9.x** — open source, free, no API key. Because this project
values longevity and zero runtime third-party dependencies, **vendor the files
locally** rather than hot-linking a CDN. Download into `vendor/leaflet/`:

```
vendor/leaflet/leaflet.js
vendor/leaflet/leaflet.css
vendor/leaflet/images/marker-icon.png
vendor/leaflet/images/marker-icon-2x.png
vendor/leaflet/images/marker-shadow.png
```

(Get them from the official Leaflet 1.9.4 distribution. Commit them; they are
part of the site.) Leaflet's CSS references the marker images by relative path
`images/...`, so keeping that `images/` subfolder next to `leaflet.css` makes
the default marker work with no config.

Map tiles: **OpenStreetMap standard tiles**
(`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`), free, with the required
attribution string `'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'`
passed to the tile layer. (CARTO Positron is a nicer-looking free alternative
if desired; OSM is the safe default.) No tile API key is involved.

**Do not** load Leaflet for every visitor — see lazy loading in section 3.

## 3. View integration

### Markup (`index.html`)
- Add a 4th toggle button after `#view-planner`, matching the existing button
  markup (an inline SVG map-pin icon, `aria-label="Map View"`,
  `title="Map View"`, `id="view-map"`).
- Add a map section as a sibling of the grid/table/planner sections:
  ```html
  <section id="map-section" class="map-section">
      <div id="map"></div>
      <p id="map-unmapped" class="map-unmapped" aria-live="polite"></p>
  </section>
  ```
- Vendored Leaflet CSS is **not** put in `<head>` (lazy-loaded). See below.

### JS (`js/app.js`)
- Add `const viewMapBtn = document.getElementById('view-map');` with the other
  view-button consts.
- In `setView()`, add `viewMapBtn?.classList.toggle('active', view === 'map')`.
- Wire the button: `viewMapBtn?.addEventListener('click', () => setView('map'));`
- In `renderCamps()`, add a branch BEFORE the grid/list logic, mirroring the
  planner branch:
  ```js
  if (currentView === 'map') {
      document.body.className = 'view-map';
      renderMap();
      return;
  }
  ```
- Because `applyFilters()` calls `renderCamps()`, changing any filter while the
  map view is active automatically re-runs `renderMap()`. No extra wiring.

### Lazy loading + init (the important part)
- Keep module-level state: `let mapInstance = null; let markerLayer = null; let leafletLoading = null;`
- `renderMap()`:
  1. If `window.L` is undefined: load Leaflet once, then call `renderMap()`
     again on completion. Implement `loadLeaflet()` returning a cached Promise
     (`leafletLoading`) that injects `vendor/leaflet/leaflet.css` (a `<link>`)
     and `vendor/leaflet/leaflet.js` (a `<script>`), resolving on the script's
     `onload`. Guard so it only injects once. While loading, you may show
     "Loading map…" in `#map`.
  2. If `mapInstance` is null: create it
     (`L.map('map')`), add the OSM tile layer with attribution, create an empty
     `markerLayer` (an `L.layerGroup` or the markercluster group from section
     6) and add it to the map.
  3. **Call `mapInstance.invalidateSize()`** — Leaflet miscalculates dimensions
     when its container was `display:none` at creation; this is required every
     time the map becomes visible. Do it on each `renderMap()` after the
     instance exists.
  4. Clear `markerLayer`, then add one marker per mappable camp in
     `filteredCamps` (section 4).
  5. Fit the view: if there are markers, `mapInstance.fitBounds(bounds, { padding: [30,30], maxZoom: 13 })`;
     if none, set a default center/zoom on Amherst (`[42.3732, -72.5199]`, zoom
     10). Recompute bounds from the current markers each render.
  6. Update `#map-unmapped` (section 5).

## 4. Markers and popups

For each camp in `filteredCamps` with non-null `lat`/`lng`:
- Create a marker at `[lat, lng]`.
- **Precise vs approximate:** camps with `geo.approximate === true` (or
  `precision === "town"`) get a visually distinct marker — e.g. a Leaflet
  `circleMarker` (hollow circle) or a differently-colored divIcon — so users
  can tell a town-center pin from a real address. Precise camps use the default
  Leaflet marker. Keep the distinction simple but real; document which is which
  in a small legend (section 7).
- **Popup** (bind with `marker.bindPopup(html)`), built with `escapeHtml`:
  - Camp name (bold), town, cost (`$X/week`, `Free`, or `Cost TBD` — reuse the
    existing `formatCost(camp.cost?.perWeek)` helper), and for approximate
    camps the note "Approximate location (town center)".
  - A "View details" button. Wire it WITHOUT inline onclick: after opening a
    popup, Leaflet emits `popupopen`; attach a handler, or simpler, delegate a
    click listener on `#map` for `.map-details-btn[data-camp-id]` that calls
    `openModal(allCamps.find(...))`. Match the delegation pattern already used
    for cards/rows.
- Do not attach 99 individual listeners; use one delegated `#map` click handler
  for the detail buttons, set up once.

## 5. Unmappable camps

Camps in `filteredCamps` with `lat == null` can't be placed. After rendering,
set `#map-unmapped` text: if any, "N camp(s) couldn't be placed on the map
(no location data): Name, Name." — keep it short; if the list is long, show the
count and the first few. If none, clear the element. This keeps the map honest
(the grid/list still show those camps).

## 6. Overlapping markers (town-level camps)

Multiple town-only camps share the EXACT town centroid, so their markers stack
and become unclickable. Solve one of two ways:
- **Preferred: marker clustering** via the `Leaflet.markercluster` plugin
  (vendor it the same way: `vendor/leaflet.markercluster/` with its JS + two
  CSS files). Use its cluster group as `markerLayer`. Overlapping markers
  collapse into a numbered cluster that spiderfies on click. This also keeps
  dense towns (Northampton, Springfield) readable.
- **Single-dependency fallback** (if avoiding a second plugin): apply a tiny
  deterministic offset to camps sharing identical coordinates — spread them on
  a small circle (a few hundredths of a degree) keyed by their index among
  same-coordinate camps. Less elegant but no extra dependency.

Recommend clustering; note the choice in the commit message.

## 7. CSS (`css/styles.css`)

- Visibility rules mirroring the existing view classes:
  ```css
  .map-section { display: none; }
  .view-map .map-section { display: block; }
  .view-map .results-section { display: none; }
  ```
  (Confirm the grid/table/planner sections are hidden under `view-map` too —
  follow how `view-planner` hides `.results-section`.)
- `#map` needs an explicit height or Leaflet renders nothing: e.g.
  `height: 600px` desktop, `height: 70vh` on mobile, full width, `border-radius`
  and `box-shadow` to match the site's cards.
- A small **legend** (precise vs approximate marker) in a corner of the map or
  just above it. Keep it minimal.
- Ensure the vendored Leaflet CSS is the lazy-injected one; don't duplicate its
  rules.

## 8. Acceptance criteria

- The Map toggle appears as the 4th view and activates with the body class
  `view-map`; the grid/list/planner and results count are hidden.
- Opening the map for the first time lazy-loads Leaflet (verify via Network or
  that `window.L` is undefined until first open); subsequent opens reuse the
  instance and call `invalidateSize()` so the map always renders fully (no grey
  tiles / wrong size).
- Markers reflect the **current filters**: apply "financial aid" or a town
  filter, and only matching camps appear; clearing filters restores all.
- Clicking a marker shows a popup with name/town/cost; "View details" opens the
  existing modal for that camp.
- Approximate (town-level) camps are visually distinct and their popups say so;
  precise camps use the standard marker.
- Overlapping town-center camps are clustered (or jittered) so each is
  reachable.
- Camps with no coordinates appear in the `#map-unmapped` notice, not silently
  dropped.
- Map fits the filtered markers' bounds; with zero results it falls back to an
  Amherst-centered default and shows no error.
- Works at 375px mobile width (map has height, controls usable).
- No console errors. `python3 scripts/check_data.py` still exits 0 (data
  untouched by this task). Existing views, filters, shareable URLs, `#camp-id`
  deep links, and the planner all still work (regression check).

## 9. Out of scope

- Geocoding (separate spec; prerequisite).
- Drive-time / radius-from-me / geolocation ("camps near me"). Could be a later
  add (HTML5 geolocation + haversine), but not here.
- Custom tile styling, heatmaps, drawing tools.
- Persisting the map view in the URL. (Filters already persist; view does not,
  and that's fine.)

## 10. Files touched

| File | Change |
|---|---|
| `index.html` | 4th view-toggle button; `#map-section` with `#map` and `#map-unmapped` |
| `js/app.js` | `viewMapBtn` const + wiring; `setView` toggle line; `renderCamps` map branch; `loadLeaflet()`, `renderMap()`, marker/popup builders, delegated detail-button handler; map state vars |
| `css/styles.css` | `view-map` visibility rules, `#map` height/styling, marker legend, approximate-marker style |
| `vendor/leaflet/...` | vendored Leaflet 1.9.4 JS/CSS/images (and markercluster if used) |
| `CLAUDE.md` | short "Map view" note under a heading; mention Leaflet is vendored |

## 11. Suggested commit

Commit the vendored library, markup, JS, CSS, and CLAUDE.md note together.
Mention in the message: Leaflet vendored (version), OSM tiles, lazy-loaded on
first map open, markers respect filters, clustering choice, approximate-marker
handling. End with the project's standard `Co-Authored-By` trailer.
