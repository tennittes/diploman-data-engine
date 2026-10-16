#!/usr/bin/env python3
"""Compile Diploman Times weekly briefs from the monthly master-data schema."""
from __future__ import annotations
import argparse, datetime as dt, html, json, re, sys
from pathlib import Path

MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
DEFAULT_GROUP_TITLES = {
    1: "Early Fiscal Planning, Renewable Energy & Energy Corridors",
    2: "Primary Healthcare Revitalisation, Audit & Procurement Control Hubs",
    3: "Vocational TVET, Disaster Relief & Market Real Estate",
}


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--week", default=None, help="ISO week, e.g. 'Week 42' or '2026-W42'")
    p.add_argument("--year", type=int, default=None, help="ISO week-year")
    p.add_argument("--source", default=None, help="Explicit master-data.json path")
    p.add_argument("--output-dir", default=".")
    p.add_argument("--dist-dir", default="dist")
    return p.parse_args()


def resolve_week(target=None, requested_year=None):
    today = dt.datetime.now(dt.timezone.utc).date()
    current_year, current_week, _ = today.isocalendar()
    match = re.search(r"(?:(\d{4})\s*[-_/ ]?W)?\s*(?:WEEK\s*)?(\d{1,2})", str(target or ""), re.I)
    year = int(requested_year or (match.group(1) if match and match.group(1) else current_year))
    week = int(match.group(2)) if match else current_week
    try:
        monday = dt.date.fromisocalendar(year, week, 1)
    except ValueError as exc:
        raise ValueError(f"Invalid ISO reporting period (year={year}, week={week}): {exc}") from exc
    # The published weekly brief ends Friday, matching the existing workspace labels.
    friday = monday + dt.timedelta(days=4)
    return year, week, monday, friday


def clean(value):
    if value is None: return ""
    if isinstance(value, (dict, list)): return ""
    return html.unescape(str(value)).strip()


def esc(value): return html.escape(clean(value), quote=True)


def load_master(year, week, source_path=None, repo_root=Path.cwd()):
    _, _, _, friday = resolve_week(f"Week {week}", year)
    folder = f"{MONTH_KEYS[friday.month - 1]}{year}"
    candidates = [Path(source_path)] if source_path else [
        repo_root / folder / "master-data.json",
        repo_root / f"week_{week}" / "master-data.json",
        repo_root / "vault" / f"week_{week}.json",
        repo_root / f"week{week}-master.json",
        repo_root / "master-data.json",
    ]
    for path in candidates:
        if path and path.is_file():
            try:
                with path.open(encoding="utf-8") as f: data = json.load(f)
            except (OSError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"Could not read valid JSON from {path}: {exc}") from exc
            if not isinstance(data, dict): raise RuntimeError(f"Master source {path} must be a JSON object.")
            if not (isinstance(data.get("globalCodeData_B1"), list) or isinstance(data.get("globalCodeData_B2"), dict)):
                raise RuntimeError(f"{path} does not contain the expected globalCodeData_B1 / globalCodeData_B2 schema.")
            return data, folder, path
    raise FileNotFoundError("No master-data.json found. Checked: " + ", ".join(str(p) for p in candidates))


def parse_b1_date(item):
    raw = clean(item.get("displayDate"))
    for fmt in ("%A, %B %d, %Y", "%B %d, %Y", "%Y-%m-%d"):
        try: return dt.datetime.strptime(raw, fmt).date()
        except ValueError: pass
    try:
        day = int(item.get("dayNumber"))
        match = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)", raw, re.I)
        year_match = re.search(r"\b(20\d{2})\b", raw)
        if match and year_match: return dt.date(int(year_match.group(1)), MONTH_NAMES.index(match.group(1).title()) + 1, day)
    except (TypeError, ValueError): pass
    return None


def date_object(item, key="date"):
    raw = clean(item.get(key))
    try: return dt.date.fromisoformat(raw[:10])
    except ValueError: return None


def as_float(value):
    if value in (None, ""): return None
    try: return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError): return None
