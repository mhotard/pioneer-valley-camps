#!/usr/bin/env python3
"""Detect which camp source pages changed since the last snapshot, for free.

Fetches each camp's source URL, strips scripts/styles/whitespace, and compares
the visible text against the most recent copy in cache/. Camps whose pages
changed are the only ones worth re-verifying with Claude.

Usage:
  python3 scripts/check_sources.py              # check all camps
  python3 scripts/check_sources.py --limit 10   # first 10 (for testing)
  python3 scripts/check_sources.py --ids camp-a camp-b
Output: one line per camp (CHANGED / SAME / NEW / ERROR), summary at the end.
Each run saves fresh snapshots to cache/YYYY-MM-DD/ (gitignored).
"""
import argparse
import datetime
import gzip
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
UA = "Mozilla/5.0 (compatible; PioneerValleyCamps data refresh; +https://mhotard.github.io/pioneer-valley-camps)"


def visible_text(html: str) -> str:
    """Strip scripts, styles, comments, and tags; collapse whitespace."""
    html = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.DOTALL)
    html = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", html).strip()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


def latest_cached(camp_id):
    """Most recent cached snapshot for this camp."""
    candidates = sorted(CACHE.glob(f"*/{camp_id}.html.gz"), key=lambda p: p.parent.name)
    return candidates[-1] if candidates else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int)
    parser.add_argument("--ids", nargs="*")
    args = parser.parse_args()

    camps = json.loads((ROOT / "data" / "camps.json").read_text())["camps"]
    if args.ids:
        camps = [c for c in camps if c["id"] in set(args.ids)]
    if args.limit:
        camps = camps[: args.limit]

    today = datetime.date.today().isoformat()
    outdir = CACHE / today
    outdir.mkdir(parents=True, exist_ok=True)

    results = {"CHANGED": [], "SAME": [], "NEW": [], "ERROR": []}
    seen_urls = {}

    for camp in camps:
        cid = camp["id"]
        url = (camp.get("source") or {}).get("url")
        if not url:
            results["ERROR"].append(cid)
            print(f"ERROR    {cid:45} (no source url)")
            continue

        if url in seen_urls:
            status = seen_urls[url]
            results[status].append(cid)
            print(f"{status:8} {cid:45} (same url as another camp)")
            continue

        try:
            html = fetch(url)
        except Exception as e:
            results["ERROR"].append(cid)
            seen_urls[url] = "ERROR"
            print(f"ERROR    {cid:45} {e}")
            continue

        prev_path = latest_cached(cid)
        if prev_path is None:
            status = "NEW"
        else:
            prev = gzip.decompress(prev_path.read_bytes()).decode("utf-8", errors="replace")
            status = "SAME" if visible_text(prev) == visible_text(html) else "CHANGED"

        (outdir / f"{cid}.html.gz").write_bytes(gzip.compress(html.encode("utf-8")))
        results[status].append(cid)
        seen_urls[url] = status
        extra = f"(vs {prev_path.parent.name})" if prev_path else "(no baseline, snapshot saved)"
        print(f"{status:8} {cid:45} {extra}")

    print(f"\nSummary: {len(results['CHANGED'])} changed, {len(results['SAME'])} same, "
          f"{len(results['NEW'])} new baselines, {len(results['ERROR'])} errors")
    if results["CHANGED"]:
        print("\nRe-verify these camps:")
        for cid in results["CHANGED"]:
            print(f"  {cid}")


if __name__ == "__main__":
    main()
