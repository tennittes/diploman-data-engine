#!/usr/bin/env python3
"""Compile Diploman Times weekly source data into browser-consumable artifacts."""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
from pathlib import Path

MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
GROUP_TITLES = {
    1: "Early Fiscal Planning, Renewable Energy & Energy Corridors",
    2: "Primary Healthcare Revitalisation, Audit & Procurement Control Hubs",
    3: "Vocational TVET, Disaster Relief & Market Real Estate",
}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--week", default=None, help="ISO reporting week, e.g. 'Week 42' or '2026-W42'")
    parser.add_argument("--year", type=int, default=None, help="ISO week-year; defaults to current ISO week-year")
    parser.add_argument("--source", default=None, help="Optional explicit source JSON path")
    parser.add_argument("--output-dir", default=".", help="Directory for root weekN-data.json")
    parser.add_argument("--dist-dir", default="dist", help="Distribution output directory")
    return parser.parse_args()


def resolve_week(target, requested_year=None):
    today = dt.datetime.now(dt.timezone.utc).date()
    current_iso_year, current_iso_week, _ = today.isocalendar()
    text = str(target or "").strip()
    match = re.search(r"(?:(\d{4})\s*[-_/ ]?W)?\s*(?:WEEK\s*)?(\d{1,2})", text, re.I)
    year = int(requested_year or (match.group(1) if match and match.group(1) else current_iso_year))
    week = int(match.group(2)) if match else current_iso_week
    try:
        friday = dt.date.fromisocalendar(year, week, 5)
    except ValueError as exc:
        raise ValueError(f"Invalid ISO reporting period: year={year}, week={week}: {exc}") from exc
    return year, week, friday


def sanitize(value):
    return html.unescape(str(value or "")).strip()


def escape(value):
    return html.escape(sanitize(value), quote=True)


def load_data(year, week, source_path=None, repo_root=Path.cwd()):
    friday = dt.date.fromisocalendar(year, week, 5)
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
                with path.open(encoding="utf-8") as handle:
                    data = json.load(handle)
            except (OSError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"Could not read valid JSON from {path}: {exc}") from exc
            if not isinstance(data, (dict, list)):
                raise RuntimeError(f"Source JSON at {path} must be an object or array.")
            return data, folder, path
    tried = ", ".join(str(p) for p in candidates)
    raise FileNotFoundError(f"No weekly source JSON found. Checked: {tried}")


def source_items(data):
    if isinstance(data, list):
        items = data
    else:
        items = data.get("states", data.get("data", data.get("jurisdictions", [])))
    if not isinstance(items, list):
        raise RuntimeError("Source JSON must contain a list in 'states', 'data', or 'jurisdictions'.")
    return [item for item in items if isinstance(item, dict)]


def first_value(item, *keys, default=""):
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return default


def metric(item, names):
    for name in names:
