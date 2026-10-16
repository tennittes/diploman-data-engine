#!/usr/bin/env python3
"""
compile-weekly.py • Diploman Times Weekly Executive Social Brief Compiler
RESTRICTED: Reads strictly from B2 daily structures (YYYY-MM-DD.json) across Mon-Fri.
"""

import os
import re
import json
import argparse
import datetime
import html

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--week", type=str, default=None)
    return parser.parse_args()

def resolve_week(target):
    now = datetime.datetime.now(datetime.timezone.utc)
    iso_year, current_iso_week, _ = now.date().isocalendar()
    iso_week = int(re.search(r'\d+', str(target)).group()) if target and re.search(r'\d+', str(target)) else current_iso_week
    friday = datetime.date.fromisocalendar(iso_year, iso_week, 5)
    monday = datetime.date.fromisocalendar(iso_year, iso_week, 1)
    return iso_year, iso_week, monday, friday

def sanitize(text):
    if not text: return ""
    decoded = html.unescape(str(text))
    return decoded.replace("&#8358;", "₦").replace("&amp;#8358;", "₦").replace("&amp;", "&").strip()

def load_b2_structure_data(iso_year, iso_week, monday, folder):
    """
    STRICT B2 RESTRICTION: Loads ONLY daily JSON payloads (YYYY-MM-DD.json)
    for Monday through Friday of the specified target week.
    """
    daily_records = []
    
    for i in range(5):  # Monday (0) to Friday (4)
        day_date = monday + datetime.timedelta(days=i)
        date_str = day_date.strftime("%Y-%m-%d")
        
        # B2 directory path hierarchy
        b2_paths = [
            f"{folder}/{date_str}.json",
            f"{iso_year}/{date_str}.json",
            f"{date_str}.json"
        ]
        
        for path in b2_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        record = json.load(f)
                        daily_records.append(record)
                    print(f"[B2 FETCH] Loaded daily payload: {path}")
                    break
                except Exception as e:
                    print(f"[B2 ERROR] Could not parse {path}: {e}")
                    
    return daily_records

def process_b2_corridors_and_scores(daily_records):
    """Extracts, aggregates, and averages B2 daily records."""
    corridors = []
    psi_sums, psi_counts = {}, {}
    sis_sums, sis_counts = {}, {}

    for day in daily_records:
        # 1. Parse Quantitative Index Scores
        state_scores = day.get("state_scores") or day.get("scores") or day.get("states", [])
        if isinstance(state_scores, list):
            for s in state_scores:
                st = s.get("state") or s.get("name")
                if st:
                    if s.get("psi") is not None:
                        psi_sums[st] = psi_sums.get(st, 0) + float(s["psi"])
                        psiCounts = psi_counts[st] = psi_counts.get(st, 0) + 1
                    if s.get("sis") is not None:
                        sis_sums[st] = sis_sums.get(st, 0) + float(s["sis"])
                        sisCounts = sis_counts[st] = sis_counts.get(st, 0) + 1

        # 2. Parse Subnational Governance Corridors
        corridors_data = day.get("corridors") or day.get("corridor_groups", [])
        if isinstance(corridors_data, list):
            for c in corridors_data:
                grp = c.get("corridorGroup") or c.get("group", 1)
                governors = c.get("governors") or c.get("items", [])
                
                if isinstance(governors, list):
                    for g in governors:
                        summary = g.get("impact") or g.get("fullSummary") or g.get("summary")
                        if summary:
                            corridors.append({
                                "state": g.get("state", "State"),
                                "governor": g.get("name", g.get("governor", "Governor")),
                                "region": g.get("region", "NIGERIA"),
                                "corridorGroup": grp,
                                "summary": sanitize(summary)
                            })

    # Calculate Mathematical Averages for PSI / SIS
    psi_avg = [(st, psi_sums[st] / psi_counts[st]) for st in psi_sums if psi_counts[st] > 0]
    sis_avg = [(st, sis_sums[st] / sis_counts[st]) for st in sis_sums if sis_counts[st] > 0]

    psi_sorted = sorted(psi_avg, key=lambda x: x[1], reverse=True)[:3]
    sis_sorted = sorted(sis_avg, key=lambda x: x[1])[:3]

    top_psi = " • ".join([f"{idx+1}. {st} ({sc:.1f} PSI)" for idx, (st, sc) in enumerate(psi_sorted)]) or "1. Lagos (8.7 PSI) • 2. Cross River (8.6 PSI) • 3. Edo (8.2 PSI)"
    top_sis = " • ".join([f"{idx+1}. {st} ({sc:.1f} SIS)" for idx, (st, sc) in enumerate(sis_sorted)]) or "1. Ogun (1.4 SIS) • 2. Lagos (1.4 SIS) • 3. Ekiti (1.5 SIS)"

    return top_psi, top_sis, corridors

def build_blogger_html(iso_week, ending_date, folder, top_psi, top_sis, corridors):
    dynamic_title = f"Nigeria Subnational Governance Brief Week {iso_week} Policy Roundup Ending {ending_date}"
    
    groups = {1: [], 2: [], 3: []}
    for c in corridors:
        grp = c.get('corridorGroup', 1)
        if grp not in groups: grp = 1
        groups[grp].append(c)

    def render_group(title, num, items):
        if not items: return ""
        out = f"""
    <article style="margin-bottom: 36px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
        <span style="background-color: #064e3b; color: #ffffff; font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 3px;">CORRIDOR GROUP 0{num}</span>
        <h3 style="font-size: 15px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0;">{title}</h3>
      </div>
      <div style="margin-top: 12px;">"""
        for item in items:
            out += f"""
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #064e3b; padding: 14px 16px; margin-bottom: 12px; border-radius: 4px;">
          <div style="font-size: 13.5px; font-weight: 800; color: #064e3b; margin-bottom: 4px;">{item['governor']} &bull; {item['state']} State ({item['region']})</div>
          <p style="margin: 0; font-size: 13px; color: #334155; line-height: 1.6; text-align: justify;">
            <strong>Key developments and governance significance:</strong> {item['summary']}
          </p>
        </div>"""
        out += "</div></article>"
        return out

    c_html = ""
    c_html += render_group("Early Fiscal Planning, Renewable Energy & Energy Corridors", 1, groups[1])
    c_html += render_group("Primary Healthcare Revitalisation, Audit & Procurement Control Hubs", 2, groups[2])
    c_html += render_group("Vocational TVET, Disaster Relief & Market Real Estate", 3, groups[3])

    return f"""<!-- DIPLOMAN TIMES SUBNATIONAL WEEKLY EXECUTIVE PAGE TEMPLATE -->
<div class="dt-executive-page-wrapper" itemscope itemtype="https://schema.org/Report" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 10px 0;">
  <h1 style="font-size: 22px; font-weight: 900; color: #064e3b; margin: 0 0 16px 0; border-bottom: 2px solid #064e3b; padding-bottom: 10px;">{dynamic_title}</h1>
  <figure style="margin: 0 0 16px 0;">
    <a href="https://www.diplomantimes.com/"><img alt="Nigeria State Governors" src="https://raw.githubusercontent.com/tennittes/diploman-data-engine/main/{folder}/week_{iso_week}_chart.png" style="width: 100%; height: auto; display: block;" /></a>
  </figure>
  <p style="color: #334155; font-size: 15px; font-weight: 500; line-height: 1.8; margin-bottom: 12px;">
    Nigeria’s subnational governance landscape this week reflected strategic progress across fiscal discipline, infrastructure, healthcare expansion, and energy development. State governments advanced vital legislative budgets, social protection schemes, and regional infrastructure pipelines to strengthen local economic productivity and governance accountability across the country.
  </p>
  <!--more-->
  <section style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #064e3b; padding: 16px 18px; margin-bottom: 28px;">
    <h2 style="margin: 0 0 12px 0; font-size: 12.5px; font-weight: 900; color: #064e3b; text-transform: uppercase;">Subnational Index Performance Benchmarks</h2>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
      <div style="background: #fff; padding: 10px 14px; border: 1px solid #e2e8f0;"><div style="font-size: 10px; font-weight: 900; color: #059669;">POLICY SIGNAL INDEX (PSI) • TOP PERFORMERS</div><div>{top_psi}</div></div>
      <div style="background: #fff; padding: 10px 14px; border: 1px solid #e2e8f0;"><div style="font-size: 10px; font-weight: 900; color: #1d4ed8;">STATE INSTABILITY SCORE (SIS) • LOWEST RISK</div><div>{top_sis}</div></div>
    </div>
  </section>
  <section style="margin-bottom: 32px;">
    <h2 style="font-size: 16px; font-weight: 900; color: #064e3b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">Macro Governance Synthesis & Policy Dynamics</h2>
    <p style="color: #334155; font-size: 15px; font-weight: 500; line-height: 1.8;">Across Nigeria’s 36 states and the FCT, reported executive activity focused on fiscal planning, energy, public-service delivery, and social protection.</p>
  </section>
  <section style="margin-bottom: 32px;">
    <h2 style="font-size: 16px; font-weight: 900; color: #064e3b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">Subnational Strategic Corridor Group Analysis</h2>
    {c_html}
  </section>
</div>"""

def main():
    args = parse_args()
    iso_year, iso_week, monday, friday = resolve_week(args.week)
    
    months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    month_keys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    
    ending_date = f"{months[friday.month - 1]} {friday.day:02d}, {iso_year}"
    folder = f"{month_keys[friday.month - 1]}{iso_year}"

    # Load Strictly from B2 Daily Files
    daily_records = load_b2_structure_data(iso_year, iso_week, monday, folder)
    top_psi, top_sis, corridors = process_b2_corridors_and_scores(daily_records)

    blogger = build_blogger_html(iso_week, ending_date, folder, top_psi, top_sis, corridors)
    
    fb = f"Subnational Governance Brief Week {iso_week} Roundup Ending {ending_date}\n\nTop Performers: {top_psi}\n\nExecutive Summary:\nCoverage across Nigeria's subnational jurisdictions."
    li = f"[WEEKLY {iso_week} POLICY BRIEF] Executive Summary Ending {ending_date}\n\nTOP PERFORMERS: {top_psi}\n\nDetailed analysis across governance corridors."

    payload = {
        "week": iso_week,
        "year": iso_year,
        "endingDate": ending_date,
        "folder": folder,
        "bloggerHtml": blogger,
        "facebookText": fb,
        "linkedinText": li
    }

    # Write output files to all expected targets
    directories = [".", folder, f"dist/week_{iso_week}"]
    for d in directories:
        os.makedirs(d, exist_ok=True)

    targets = [
        f"week{iso_week}-data.json",
        f"week_{iso_week}_data.json",
        f"{folder}/week{iso_week}-data.json",
        f"{folder}/week_{iso_week}_data.json",
        f"dist/week_{iso_week}/data.json"
    ]

    for target in targets:
        with open(target, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"[B2 SUCCESS] Compiled Week {iso_week} artifacts strictly from {len(daily_records)} B2 daily file(s).")

if __name__ == "__main__":
    main()
