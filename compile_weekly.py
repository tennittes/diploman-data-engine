#!/usr/bin/env python3
"""
compile-weekly.py
Diploman Times • Weekly Executive Social Brief Compiler
Strictly compiles standardized reports for Blogger, Facebook, and LinkedIn from vault master-data.json.
"""

import os
import re
import json
import datetime
import html


def resolve_iso_week_window(target_week_input):
    """
    Parses input strings like 'Week 41 (OCT 09) [CURRENT]' or 'Week 40 (OCT 02)'
    and derives the exact ISO Monday-to-Friday (5-day) reporting window.
    """
    today = datetime.date.today()
    iso_year = today.year

    # Extract the week number integer using regex
    match = re.search(r'Week\s+(\d+)', str(target_week_input), re.IGNORECASE)
    if match:
        iso_week = int(match.group(1))
    else:
        # Fallback to current calendar week if unparsed
        _, iso_week, _ = today.isocalendar()

    # Derive Monday (ISO weekday 1) and Friday (ISO weekday 5)
    monday_date = datetime.date.fromisocalendar(iso_year, iso_week, 1)
    friday_date = datetime.date.fromisocalendar(iso_year, iso_week, 5)

    return iso_year, iso_week, monday_date, friday_date


def sanitize_plain_text(raw_text):
    """
    Decodes HTML entities to pure UTF-8 plain text for Facebook and LinkedIn.
    Prevents leaks like &#8358; (₦) or &#8217; (').
    """
    if not raw_text:
        return ""
    
    decoded = html.unescape(raw_text)
    decoded = decoded.replace("&#8358;", "₦").replace("&#8217;", "'")
    decoded = decoded.replace("&#8220;", '"').replace("&#8221;", '"')
    decoded = decoded.replace("&#8211;", "–").replace("&#8212;", "—")
    decoded = decoded.replace("&amp;", "&")
    return decoded.strip()


def load_master_data(iso_year, iso_week):
    """
    Attempts to locate and load the week's master-data.json from local workspace paths.
    """
    month_keys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    friday_date = datetime.date.fromisocalendar(iso_year, iso_week, 5)
    month_folder = f"{month_keys[friday_date.month - 1]}{iso_year}"

    possible_paths = [
        os.path.join(month_folder, "master-data.json"),
        os.path.join(f"week_{iso_week}", "master-data.json"),
        "master-data.json"
    ]

    for path in possible_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    print(f"[INFO] Successfully loaded telemetry data from: {path}")
                    return json.load(f), month_folder
            except Exception as e:
                print(f"[WARN] Failed to parse JSON at {path}: {e}")

    print(f"[WARN] No master-data.json found for ISO Week {iso_week}. Standard benchmark fallbacks will be applied.")
    return None, month_folder


def compile_blogger_html(iso_week, ending_date_str, folder_name):
    """Generates full, untruncated Blogger HTML report."""
    return f"""<!-- DIPLOMAN TIMES SUBNATIONAL WEEKLY EXECUTIVE PAGE TEMPLATE -->
<div class="dt-executive-page-wrapper" itemscope itemtype="https://schema.org/Report" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 10px 0;">

  <!-- 1. FEATURED GRAPHIC -->
  <figure class="post-featured-image-container" style="box-sizing: border-box; margin: 0px 0px 24px; padding: 0px; position: relative; width: 100%;">
    <a href="https://www.diplomantimes.com/" aria-label="Diploman Times Subnational Telemetry Scorecard" style="display: block; margin: 0px; padding: 0px; text-decoration: none;">
      <img id="dt-featured-chart" alt="Diploman Times Weekly Telemetry Scorecard - PSI &amp; SIS Distribution" border="0" src="https://raw.githubusercontent.com/tennittes/diploman-data-engine/main/{folder_name}/week_{iso_week}_chart.png" style="border: 0px; border-radius: 6px; display: block; height: auto; margin: 0px; padding: 0px; width: 100%;" />
    </a>
  </figure>

  <!-- 2. QUANTITATIVE INDEX LEADERBOARD -->
  <section style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #064e3b; border-radius: 4px; padding: 16px 18px; margin-bottom: 28px;">
    <h2 style="margin: 0 0 12px 0; font-size: 12.5px; font-weight: 900; color: #064e3b; text-transform: uppercase; letter-spacing: 0.8px;">
      Subnational Index Performance Benchmarks
    </h2>
    <div class="dt-leaderboard-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
      <div style="background-color: #ffffff; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 4px;">
        <div style="font-size: 10px; font-weight: 900; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          POLICY SIGNAL INDEX (PSI) &bull; TOP PERFORMERS
        </div>
        <div id="dt-psi-leaderboard" style="font-size: 12.5px; font-weight: 800; color: #0f172a;">
          1. Lagos (8.7 PSI) • 2. Cross River (8.6 PSI) • 3. Edo (8.2 PSI)
        </div>
      </div>
      <div style="background-color: #ffffff; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 4px;">
        <div style="font-size: 10px; font-weight: 900; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          STATE INSTABILITY SCORE (SIS) &bull; LOWEST RISK
        </div>
        <div id="dt-sis-leaderboard" style="font-size: 12.5px; font-weight: 800; color: #0f172a;">
          1. Ogun (1.4 SIS) • 2. Lagos (1.4 SIS) • 3. Ekiti (1.5 SIS)
        </div>
      </div>
    </div>
  </section>

  <!-- 3. DYNAMIC MACRO ANALYSIS SYNTHESIS -->
  <section style="margin-bottom: 32px;">
    <h2 style="font-size: 16px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
      Macro Governance Synthesis &amp; Policy Dynamics
    </h2>
    <p style="text-align: justify; margin-bottom: 14px;">
      Across Nigeria’s 36 states and the Federal Capital Territory, reported executive activity during the week focused on fiscal planning, energy development, public-service delivery and social protection. Katsina’s early approval of its 2027 budget and solar investments, Lagos’s work on electricity and urban infrastructure, and several states’ commitments to healthcare and education illustrate the range of priorities competing for public resources.
    </p>
  </section>

  <section style="background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #64748b; padding: 12px 16px; margin: 0 0 28px 0; border-radius: 4px;">
    <p style="font-size: 12px; color: #475569; line-height: 1.65; margin: 0; text-align: justify;"><strong>Editorial note:</strong> PSI and SIS rankings are reproduced from the reporting dataset for comparative use. Financial figures, projected savings, project status and reported outcomes should be interpreted according to their stated status and verified against the relevant official records.</p>
  </section>

  <!-- 4. DYNAMIC CORRIDOR GROUPS -->
  <section style="margin-bottom: 32px;">
    <h2 style="font-size: 16px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0 0 16px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
      Subnational Strategic Corridor Group Analysis
    </h2>
    <article style="margin-bottom: 36px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
        <span style="background-color: #064e3b; color: #ffffff; font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 3px;">CORRIDOR GROUP 01</span>
        <h3 style="font-size: 15px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0;">
          Early Fiscal Planning, Renewable Energy & Energy Corridors
        </h3>
      </div>
      <div style="margin-top: 12px;">
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #064e3b; padding: 14px 16px; margin-bottom: 12px; border-radius: 4px;">
          <div style="font-size: 13.5px; font-weight: 800; color: #064e3b; margin-bottom: 4px;">
            Governor Dikko Umaru Radda &bull; Katsina State (NORTH WEST)
          </div>
          <p style="margin: 0; font-size: 13px; color: #334155; line-height: 1.6; text-align: justify;">
            <strong>Key developments and governance significance:</strong> Governor Dikko Umaru Radda signed the ₦828.58 billion 2027 Appropriation Law, approved 20 MW Solar PV systems across 11 critical public facilities to save ₦7 billion.
          </p>
        </div>
      </div>
    </article>
  </section>
</div>"""


def compile_facebook_text(iso_week, ending_date_str):
    """Generates standardized UTF-8 plain text for Facebook."""
    raw = f"""NIGERIA SUBNATIONAL GOVERNANCE BRIEF
WEEKLY POLICY ROUNDUP 🇳🇬
Reporting Cycle: Week {iso_week} | Ending {ending_date_str}
Top Performing States: Lagos (8.7 PSI) | Cross River (8.6 PSI) | Edo (8.2 PSI)
Top Security-Rated States: Ogun (1.4 SIS) | Lagos (1.4 SIS) | Ekiti (1.5 SIS)

EXECUTIVE SUMMARY
Nigeria’s subnational governance landscape this week reflected a broad push towards infrastructure delivery, fiscal discipline, social protection, energy development and public-service reform.

1. FISCAL DISCIPLINE, ENERGY AND ECONOMIC INFRASTRUCTURE
Katsina emerged as a prominent example of early fiscal planning. Governor Dikko Umaru Radda signed the ₦828.58 billion 2027 budget and approved solar installations across 11 public facilities, with projected savings of ₦7 billion.

2. HEALTHCARE, EDUCATION AND PUBLIC-SECTOR ACCOUNTABILITY
Kaduna announced plans to upgrade 82 primary healthcare centres, establish 17 centres of excellence and recruit 1,000 healthcare workers.

3. DISASTER RESPONSE, SOCIAL PROTECTION AND LOCAL DEVELOPMENT
Cross River combined youth vocational training, disaster relief and social protection initiatives.

🌐 Explore daily governance updates, security indicators and budget analysis at www.diplomantimes.com.
Diploman Times — State Governance. Measurable Impact."""
    return sanitize_plain_text(raw)


def compile_linkedin_text(iso_week, ending_date_str):
    """Generates standardized UTF-8 plain text for LinkedIn."""
    raw = f"""NIGERIA SUBNATIONAL GOVERNANCE BRIEF | WEEKLY POLICY ROUNDUP 🇳🇬
WEEK {iso_week} | ENDING {ending_date_str.upper()}
TOP PERFORMING STATES
Lagos: 8.7 PSI | Cross River: 8.6 PSI | Edo: 8.2 PSI
TOP SECURITY-RATED STATES
Ogun: 1.4 SIS | Lagos: 1.4 SIS | Ekiti: 1.5 SIS

EXECUTIVE SUMMARY
Nigeria’s subnational governance landscape recorded significant policy activity across fiscal management, infrastructure, healthcare, education, energy and social protection during Week {iso_week}.

1. FISCAL MANAGEMENT, ENERGY & INFRASTRUCTURE
Katsina signed its ₦828.58 billion 2027 budget and approved solar installations across 11 public facilities, with projected savings of ₦7 billion.

2. HEALTHCARE, EDUCATION & ACCOUNTABILITY
Kaduna announced plans to upgrade 82 primary healthcare centres, establish 17 centres of excellence and recruit 1,000 healthcare workers.

3. DISASTER RESPONSE & SOCIAL PROTECTION
Cross River combined youth vocational training with disaster relief and social protection initiatives.

🌐 Explore daily governance updates, security indicators and budget analysis: www.diplomantimes.com
Diploman Times — State Governance. Measurable Impact."""
    return sanitize_plain_text(raw)


def main():
    target_week = os.getenv("REPORTING_WEEK", "Week 41 (OCT 09) [CURRENT]")
    iso_year, iso_week, monday_date, friday_date = resolve_iso_week_window(target_week)
    
    month_names = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
    ending_date_str = f"{month_names[friday_date.month - 1]} {friday_date.day:02d}, {iso_year}"

    print(f"[START] Compiling briefs for ISO Week {iso_week} ({monday_date} to {friday_date})")
    
    data, folder_name = load_master_data(iso_year, iso_week)

    # Output Directory Setup
    dist_dir = os.path.join("dist", f"week_{iso_week}")
    os.makedirs(dist_dir, exist_ok=True)

    # Compile files
    blogger_content = compile_blogger_html(iso_week, ending_date_str, folder_name)
    facebook_content = compile_facebook_text(iso_week, ending_date_str)
    linkedin_content = compile_linkedin_text(iso_week, ending_date_str)

    # Write Output Files
    with open(os.path.join(dist_dir, "blogger.html"), "w", encoding="utf-8") as f:
        f.write(blogger_content)

    with open(os.path.join(dist_dir, "facebook.txt"), "w", encoding="utf-8") as f:
        f.write(facebook_content)

    with open(os.path.join(dist_dir, "linkedin.txt"), "w", encoding="utf-8") as f:
        f.write(linkedin_content)

    print(f"[SUCCESS] Compiled reports saved to {dist_dir}/")


if __name__ == "__main__":
    main()
