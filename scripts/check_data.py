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
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name):
    return json.loads((ROOT / "data" / name).read_text())


def dropdown_weeks():
    """Week values offered by the week filter in index.html."""
    html = (ROOT / "index.html").read_text()
    m = re.search(r'id="week-select".*?</select>', html, re.DOTALL)
    if not m:
        return set()
    return set(re.findall(r'value="(\d{4}-\d{2}-\d{2})"', m.group(0)))


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

    # Weeks: must be Mondays and findable via the week filter
    in_dropdown = dropdown_weeks()
    invisible = []
    for c in camps:
        weeks = (c.get("dates") or {}).get("weeks") or []
        for w in weeks:
            try:
                d = datetime.date.fromisoformat(w)
            except ValueError:
                errors.append(f"{c['id']}: bad week date '{w}'")
                continue
            if d.weekday() != 0:
                warnings.append(f"{c['id']}: week {w} is a {d.strftime('%A')}, not a Monday")
        if weeks and in_dropdown and not any(w in in_dropdown for w in weeks):
            invisible.append(c["id"])
    for cid in invisible:
        warnings.append(f"{cid}: has session weeks but NONE match the week-filter dropdown "
                        f"(camp is invisible when filtering by week)")

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
