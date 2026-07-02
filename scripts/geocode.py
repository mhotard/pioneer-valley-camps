#!/usr/bin/env python3
"""Add latitude/longitude to every camp in data/camps.json.

Free, keyless geocoders only (stdlib urllib): US Census for street addresses,
Nominatim/OpenStreetMap for town centroids and fallback. Writes lat/lng plus a
geo metadata block back into camps.json, flags any camp that lands outside the
region, and caches results so re-runs make no network calls.

Usage:
  python3 scripts/geocode.py            # geocode camps missing/stale coords
  python3 scripts/geocode.py --limit 5  # first 5 only (sanity check)
  python3 scripts/geocode.py --force    # re-geocode all, ignore cache
  python3 scripts/geocode.py --ids a b  # only these camp ids
"""
import argparse
import datetime
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAMPS = ROOT / "data" / "camps.json"
CACHE_DIR = ROOT / "cache"
CACHE_FILE = CACHE_DIR / "geocode_cache.json"

# Amherst, MA town center. Out-of-region safety net measures from here.
CENTER = (42.3732, -72.5199)
REGION_RADIUS_MILES = 40

# Camps at private homes / personal studios: geocode but never pin precisely.
PRIVACY_TOWN_LEVEL = {
    "miss-leticia-music-camp",
    "glover-piano-studio-summer",
    "catherine-grace-studios-summer",
}

UA = "PioneerValleyCamps geocoder (https://mhotard.github.io/pioneer-valley-camps)"


def haversine_miles(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def census_lookup(one_line):
    """Return (lat, lng) for a US street address, or None."""
    params = urllib.parse.urlencode({
        "address": one_line,
        "benchmark": "Public_AR_Current",
        "format": "json",
    })
    url = f"https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?{params}"
    data = get_json(url)
    matches = data.get("result", {}).get("addressMatches", [])
    if not matches:
        return None
    c = matches[0]["coordinates"]
    return (round(c["y"], 5), round(c["x"], 5))  # y=lat, x=lng


def nominatim_lookup(query):
    """Return (lat, lng) for a place query (town centroid), or None."""
    params = urllib.parse.urlencode({
        "q": query, "format": "json", "limit": 1, "countrycodes": "us",
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    data = get_json(url)
    if not data:
        return None
    return (round(float(data[0]["lat"]), 5), round(float(data[0]["lon"]), 5))


def current_query(camp):
    """The query string we'd use today; also the staleness key."""
    loc = camp.get("location") or {}
    town = loc.get("town") or ""
    if loc.get("address"):
        return f"{loc['address']}, {town}, MA"
    return f"{town}, Massachusetts, USA"


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text())
    return {}


def save_cache(cache):
    CACHE_DIR.mkdir(exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, indent=2))


def town_centroid(town, cache):
    """Town-center coordinates, cached and shared across camps in a town.

    Cache key is namespaced ("town::") so it can never collide with a
    no-address camp's query key, which is the same human-readable string.
    """
    key = f"town::{town}"
    if key in cache:
        return cache[key]
    try:
        hit = nominatim_lookup(f"{town}, Massachusetts, USA")
        time.sleep(1.0)  # Nominatim policy: max 1 req/sec
    except Exception:
        hit = None
    cache[key] = {"lat": hit[0], "lng": hit[1]} if hit else None
    return cache[key]


def geocode_camp(camp, cache, force):
    """Return dict {lat, lng, precision, source} or None. Uses/fills cache.

    Chain: numbered street address -> Census (rooftop). Otherwise (named venue
    like "Smith College" or a Census miss) -> Nominatim place lookup. Either
    precise hit is accepted only if it sits within REGION sanity distance of the
    town centroid, which is also the final fallback. This pins named venues
    precisely while a bad fuzzy match can't fling a marker across the state.
    """
    loc = camp.get("location") or {}
    query = current_query(camp)
    town = loc.get("town") or ""
    addr = loc.get("address")

    if not force and query in cache:
        hit = cache[query]
        # Ignore malformed entries (e.g. bare centroids written by older runs)
        if isinstance(hit, dict) and "precision" in hit:
            return hit

    centroid = town_centroid(town, cache)
    result = None

    if addr:
        precise = None
        precise_source = None
        # Numbered street address -> Census rooftop match
        if addr[0].isdigit():
            try:
                precise = census_lookup(f"{addr}, {town}, MA")
                time.sleep(0.2)
                if precise:
                    precise_source = "census"
            except Exception:
                precise = None
        # Named venue, or Census missed -> Nominatim place lookup
        if precise is None:
            try:
                hit = nominatim_lookup(f"{addr}, {town}, Massachusetts, USA")
                time.sleep(1.0)
                # Reject an echo of the town centroid (no extra precision gained)
                if hit and centroid:
                    d = haversine_miles((hit[0], hit[1]), (centroid["lat"], centroid["lng"]))
                    if d > 0.03:
                        precise = hit
                elif hit:
                    precise = hit
                if precise:
                    precise_source = "nominatim"
            except Exception:
                precise = None
        # Accept a precise hit only if it's plausibly within the town
        if precise and centroid:
            d = haversine_miles((precise[0], precise[1]), (centroid["lat"], centroid["lng"]))
            if d <= 12:
                result = {"lat": precise[0], "lng": precise[1],
                          "precision": "street", "source": precise_source}
        elif precise:
            result = {"lat": precise[0], "lng": precise[1],
                      "precision": "street", "source": precise_source}

    if result is None and centroid:
        result = {"lat": centroid["lat"], "lng": centroid["lng"],
                  "precision": "town", "source": "nominatim"}

    if result is not None:
        cache[query] = result
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--ids", nargs="*")
    args = parser.parse_args()

    data = json.loads(CAMPS.read_text())
    camps = data["camps"]
    cache = load_cache()
    today = datetime.date.today().isoformat()

    targets = camps
    if args.ids:
        wanted = set(args.ids)
        targets = [c for c in camps if c["id"] in wanted]

    counts = {"street": 0, "town": 0, "failed": 0}
    skipped = 0
    review_far, review_failed, review_town = [], [], []
    done = 0

    for camp in targets:
        loc = camp.setdefault("location", {})
        query = current_query(camp)

        # Skip if already current (has coords and query unchanged), unless forced
        geo = loc.get("geo") or {}
        if not args.force and loc.get("lat") is not None and geo.get("query") == query:
            skipped += 1
            continue

        if args.limit is not None and done >= args.limit:
            break
        done += 1

        result = geocode_camp(camp, cache, args.force)

        if result is None:
            loc["lat"] = None
            loc["lng"] = None
            loc["geo"] = {"precision": None, "approximate": True, "source": None,
                          "query": query, "geocodedAt": today}
            if "geocode" not in camp.get("incomplete", []):
                camp.setdefault("incomplete", []).append("geocode")
            counts["failed"] += 1
            review_failed.append((camp["id"], query))
            continue

        approximate = result["precision"] == "town" or camp["id"] in PRIVACY_TOWN_LEVEL
        loc["lat"] = result["lat"]
        loc["lng"] = result["lng"]
        loc["geo"] = {
            "precision": result["precision"],
            "approximate": approximate,
            "source": result["source"],
            "query": query,
            "geocodedAt": today,
        }
        if "geocode" in camp.get("incomplete", []):
            camp["incomplete"].remove("geocode")
        counts[result["precision"]] += 1

        if result["precision"] == "town":
            review_town.append((camp["id"], loc.get("town"), loc.get("address")))

        dist = haversine_miles(CENTER, (result["lat"], result["lng"]))
        if dist > REGION_RADIUS_MILES:
            review_far.append((camp["id"], round(dist), query))

    save_cache(cache)
    if done > 0:
        data["lastUpdated"] = today
        CAMPS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        (ROOT / "data" / "history").mkdir(exist_ok=True)
        (ROOT / "data" / "history" / f"{today}.json").write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    print(f"Geocoded: {done} camps   (street: {counts['street']}, "
          f"town-level: {counts['town']}, failed: {counts['failed']})")
    print(f"Skipped (already current): {skipped}")

    if review_far or review_failed or review_town:
        print("\nNEEDS REVIEW")
        for cid, miles, q in review_far:
            print(f"  out of region (>{REGION_RADIUS_MILES}mi):   {cid}  {miles}mi  {q}")
        for cid, q in review_failed:
            print(f"  failed to geocode:       {cid}  {q}")
        for cid, town, addr in review_town:
            print(f"  town-level fallback:     {cid}  {town}  (had address: {addr or '-'})")


if __name__ == "__main__":
    main()
