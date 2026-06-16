#!/usr/bin/env python3
"""Validate camps.json and report staleness. No network, no dependencies.

Usage:
  python3 scripts/check_data.py            # full validation + staleness summary
  python3 scripts/check_data.py --stale 60 # list camps not verified in 60+ days
"""
import argparse
import collections
import datetime
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Amherst, MA town center; camps should sit within the coverage radius of it.
CENTER = (42.3732, -72.5199)
REGION_RADIUS_MILES = 40


def haversine_miles(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def load(name):
    return json.loads((ROOT / "data" / name).read_text())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stale", type=int, metavar="DAYS",
                        help="list camps not verified in DAYS+ days and exit")
    args = parser.parse_args()

    data = load("camps.json")
    camps = data["camps"]
    today = datetime.date.today()

    if args.stale is not None:
        cutoff = today - datetime.timedelta(days=args.stale)
        rows = []
        for c in camps:
            v = (c.get("source") or {}).get("lastVerified")
            d = datetime.date.fromisoformat(v) if v else None
            if d is None or d <= cutoff:
                rows.append((d or datetime.date.min, c["id"],
                             (c.get("source") or {}).get("url") or "(no url)"))
        rows.sort()
        for d, cid, url in rows:
            print(f"{d if d != datetime.date.min else 'never':10}  {cid:45} {url}")
        print(f"\n{len(rows)} of {len(camps)} camps not verified in the last {args.stale} days")
        return

    errors, warnings = [], []

    # Counts and ids
    if data.get("totalCamps") != len(camps):
        errors.append(f"totalCamps says {data.get('totalCamps')} but file has {len(camps)} camps")
    for cid, n in collections.Counter(c["id"] for c in camps).items():
        if n > 1:
            errors.append(f"duplicate id: {cid}")

    # Categories
    valid_cats = {c["id"] for c in load("categories.json")["categories"]}
    for c in camps:
        for cat in c.get("category") or []:
            if cat not in valid_cats:
                errors.append(f"{c['id']}: unknown category '{cat}'")

    # Weeks: parseable dates inside camp season (the site normalizes
    # any start day to Monday-of-week, so non-Monday starts are fine)
    season_year = int(data.get("lastUpdated", str(today))[:4])
    for c in camps:
        for w in (c.get("dates") or {}).get("weeks") or []:
            try:
                d = datetime.date.fromisoformat(w)
            except ValueError:
                errors.append(f"{c['id']}: bad week date '{w}'")
                continue
            if d.year != season_year or not 5 <= d.month <= 9:
                warnings.append(f"{c['id']}: week {w} falls outside the May-Sep {season_year} "
                                f"camp season (typo?)")

    # incomplete[] consistency
    present_checks = {
        "cost": lambda c: (c.get("cost") or {}).get("perWeek"),
        "hours": lambda c: (c.get("dates") or {}).get("hours"),
        "dates": lambda c: (c.get("dates") or {}).get("weeks"),
        "registration": lambda c: (c.get("registration") or {}).get("opens"),
        "ages": lambda c: (c.get("ages") or {}).get("min"),
    }
    for c in camps:
        for field in c.get("incomplete") or []:
            check = present_checks.get(field)
            if check and check(c):
                warnings.append(f"{c['id']}: incomplete[] lists '{field}' but the data is present")

    # Geocoding: flag un-geocoded camps and any that landed out of region
    # (the latter catches wrong-state entries, e.g. a Northampton in another state)
    for c in camps:
        loc = c.get("location") or {}
        lat, lng = loc.get("lat"), loc.get("lng")
        if lat is None:
            if loc.get("address"):
                warnings.append(f"{c['id']}: has an address but no coordinates (run scripts/geocode.py)")
            continue
        dist = haversine_miles(CENTER, (lat, lng))
        if dist > REGION_RADIUS_MILES:
            warnings.append(f"{c['id']}: geocodes {round(dist)} mi from center, "
                            f"outside the {REGION_RADIUS_MILES}-mi region (wrong town/state?)")

    # Staleness summary
    buckets = collections.Counter()
    for c in camps:
        v = (c.get("source") or {}).get("lastVerified")
        if not v:
            buckets["never"] += 1
        else:
            age = (today - datetime.date.fromisoformat(v)).days
            buckets["<30 days" if age < 30 else "30-90 days" if age < 90 else ">90 days"] += 1

    # Missing-data summary
    missing = collections.Counter()
    for c in camps:
        for field, check in present_checks.items():
            if not check(c):
                missing[field] += 1

    print(f"camps.json: {len(camps)} camps")
    print(f"\nERRORS ({len(errors)}):")
    for e in errors:
        print(f"  - {e}")
    print(f"\nWARNINGS ({len(warnings)}):")
    for w in warnings:
        print(f"  - {w}")
    print("\nLast verified:")
    for k in ["<30 days", "30-90 days", ">90 days", "never"]:
        if buckets.get(k):
            print(f"  {k:10} {buckets[k]}")
    print("\nMissing data:")
    for field, n in missing.most_common():
        print(f"  {field:13} {n}/{len(camps)}")

    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
