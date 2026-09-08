"""Shared paths, constants and helpers for the scripts in this directory.

Every script does `from common import ...`; Python puts the script's own
directory on sys.path, so this works from any working directory.
"""
import datetime
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CAMPS_FILE = DATA_DIR / "camps.json"
CACHE_DIR = ROOT / "cache"

# Amherst, MA town center; camps should sit within the coverage radius of it.
CENTER = (42.3732, -72.5199)
REGION_RADIUS_MILES = 40


def load_json(name):
    """Parse data/<name>."""
    return json.loads((DATA_DIR / name).read_text())


def load_camps():
    """The whole camps.json document: lastUpdated, totalCamps, camps[]."""
    return load_json("camps.json")


def save_camps(data, snapshot=True):
    """Write camps.json in the repo's canonical formatting (2-space indent,
    UTF-8 as-is, trailing newline). With snapshot, also keep a dated copy in
    data/history/ (gitignored) so a bad write can be undone."""
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    CAMPS_FILE.write_text(text)
    if snapshot:
        history = DATA_DIR / "history"
        history.mkdir(exist_ok=True)
        (history / f"{datetime.date.today().isoformat()}.json").write_text(text)


def haversine_miles(a, b):
    """Great-circle distance between two (lat, lng) pairs, in miles."""
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))
