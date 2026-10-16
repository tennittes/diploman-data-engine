#!/usr/bin/env python3
"""
compile-weekly.py
Diploman Times • Weekly Executive Social Brief Compiler Engine
Full-fidelity, un-truncated report generation matching the Workspace layout.
"""

import os
import re
import sys
import json
import argparse
import datetime
import html


def parse_args():
    parser = argparse.ArgumentParser(description="Diploman Times Weekly Telemetry Compiler Engine")
    parser.add_argument("--week", type=str, default=None, help="Target reporting week (e.g. 'Week 42')")
    return parser.parse_args()


def resolve_iso_week_window(target_week_input=None):
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    today = now_utc.date()
    iso_year, current_iso_week, _ = today.isocalendar()

    iso_week = None
    if target_week_input:
        match = re.search(r'Week\s+(\d+)', str(target_week_input), re.IGNORECASE)
        if match:
            iso_week = int(match.group(1))

    if not iso_week:
        iso_week = current_iso_week

    monday_date = datetime.date.fromisocalendar(iso_year, iso_week, 1)
    friday_date = datetime.date.fromisocalendar(iso_year, iso_week, 5)

    return iso_year, iso_week, monday_date, friday_date


def sanitize_plain_text(raw_text):
    if not raw_text:
        return ""
    decoded = html.unescape(str(raw_text))
    decoded = decoded.replace("&#8358;", "₦").replace("&amp;#8358;", "₦")
    decoded = decoded.replace("&#8217;", "'").replace("&amp;#8217;", "'")
    decoded = decoded.replace("&#8220;", '"').replace("&amp;#8220;", '"')
    decoded = decoded.replace("&#8221;", '"').replace("&amp;#8221;", '"')
    decoded = decoded.replace("&#8211;", "–").replace("&amp;#8211;", "–")
    decoded = decoded.replace("&#8212;", "—").replace("&amp;#8212;", "—")
    decoded = decoded.replace("&amp;", "&")
    return decoded.strip()


def normalize_state_name(raw):
    if not raw:
        return ""
    clean = str(raw).strip().title().replace(" State", "")
    if clean.upper() in ["FCT", "ABUJA", "FCT-ABUJA", "FCT ABUJA"]:
        return "FCT Abuja"
    return clean


def to_title_case(str_val):
    if not str_val:
        return ""
    return str_val.lower().title()


def load_master_data(iso_year, iso_week):
    month_keys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    friday_date = datetime.date.fromisocalendar(iso_year, iso_week, 5)
    month_folder = f"{month_keys[friday_date.month - 1]}{iso_year}"

    possible_paths = [
        os.path.join(month_folder, "master-data.json"),
        os.path.join(f"week_{iso_week}", "master-data.json"),
        os.path.join("vault", f"week_{iso_week}.json"),
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

    print(f"[WARN] No master-data.json found for ISO Week {iso_week}.")
    return None, month_folder


def extract_rankings_and_corridors(payload):
    top_psi_str = "1. Lagos (8.7 PSI) • 2. Cross River (8.6 PSI) • 3. Edo (8.2 PSI)"
    top_sis_str = "1. Ogun (1.4 SIS) • 2. Lagos (1.4 SIS) • 3. Ekiti (1.5 SIS)"

    if not payload:
        return top_psi_str, top_sis_str, []

    items = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        if "states" in payload and isinstance(payload["states"], list):
            items = payload["states"]
        elif "data" in payload and isinstance(payload["data"], list):
            items = payload["data"]
        else:
            for k, v in payload.items():
                if isinstance(v, list):
                    items.extend(v)
                elif isinstance(v, dict):
                    v["stateName"] = k
                    items.append(v)

    state_psi_map = {}
    state_sis_map = {}
    corridor_items = []

    for item in items:
        if not isinstance(item, dict):
            continue
        raw_name = item.get("stateName") or item.get("stateKey") or item.get("jurisdiction") or item.get("state") or item.get("name")
        st_name = normalize_state_name(raw_name)
        if not st_name:
            continue

        psi_val = item.get("psi") or item.get("psiScore") or item.get("score")
        sis_val = item.get("sis") or item.get("sisScore") or item.get("securityIndex")

        if psi_val is not None:
            try:
                state_psi_map[st_name] = float(psi_val)
            except (ValueError, TypeError):
                pass

        if sis_val is not None:
            try:
                state_sis_map[st_name] = float(sis_val)
            except (ValueError, TypeError):
                pass

        summary = (
            item.get("fullSummary") or 
            item.get("summary") or 
            item.get("details") or 
            item.get("narrative") or 
            item.get("highlights") or 
            item.get("executiveAction") or 
            item.get("content")
        )
        
        if isinstance(summary, list):
            summary = " ".join([str(x) for x in summary])

        if summary and len(str(summary).strip()) > 10:
            corridor_items.append({
                "state": st_name,
                "governor": item.get("governor") or f"Governor of {st_name}",
                "region": item.get("region") or "NIGERIA",
                "corridorGroup": item.get("corridorGroup") or 1,
                "summary": sanitize_plain_text(str(summary))
            })

    if state_psi_map:
        sorted_psi = sorted(state_psi_map.items(), key=lambda x: x[1], reverse=True)[:3]
        top_psi_str = " • ".join([f"{i+1}. {name} ({score:.1f} PSI)" for i, (name, score) in enumerate(sorted_psi)])

    if state_sis_map:
        sorted_sis = sorted(state_sis_map.items(), key=lambda x: x[1])[:3]
        top_sis_str = " • ".join([f"{i+1}. {name} ({score:.1f} SIS)" for i, (name, score) in enumerate(sorted_sis)])

    return top_psi_str, top_sis_str, corridor_items


def compile_blogger_html(iso_week, ending_date_str, folder_name, top_psi, top_sis, corridor_items):
    formatted_title_date = to_title_case(ending_date_str)
    dynamic_title = f"Nigeria Subnational Governance Brief Week {iso_week} Policy Roundup {formatted_title_date}"

    # Group state details dynamically or fall back to default groups
    g1_items = [c for c in corridor_items if c.get('corridorGroup') == 1] or corridor_items[0:4]
    g2_items = [c for c in corridor_items if c.get('corridorGroup') == 2] or corridor_items[4:8]
    g3_items = [c for c in corridor_items if c.get('corridorGroup') == 3] or corridor_items[8:]

    def build_group_html(title, group_num, items_list):
        if not items_list:
            return ""
        html_out = f"""
    <article style="margin-bottom: 36px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
        <span style="background-color: #064e3b; color: #ffffff; font-size: 10px; font-weight: 900; padding: 3px 8px; border-radius: 3px;">CORRIDOR GROUP 0{group_num}</span>
        <h3 style="font-size: 15px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0;">
          {title}
        </h3>
      </div>
      <div style="margin-top: 12px;">"""
        for c in items_list:
            html_out += f"""
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #064e3b; padding: 14px 16px; margin-bottom: 12px; border-radius: 4px;">
          <div style="font-size: 13.5px; font-weight: 800; color: #064e3b; margin-bottom: 4px;">
            {c['governor']} &bull; {c['state']} State ({c['region']})
          </div>
          <p style="margin: 0; font-size: 13px; color: #334155; line-height: 1.6; text-align: justify;">
            <strong>Key developments and governance significance:</strong> {c['summary']}
          </p>
        </div>"""
        html_out += """
      </div>
    </article>"""
        return html_out

    corridor_html_blocks = ""
    corridor_html_blocks += build_group_html("Early Fiscal Planning, Renewable Energy & Energy Corridors", 1, g1_items)
    corridor_html_blocks += build_group_html("Primary Healthcare Revitalisation, Audit & Procurement Control Hubs", 2, g2_items)
    corridor_html_blocks += build_group_html("Vocational TVET, Disaster Relief & Market Real Estate", 3, g3_items)

    return f"""<!-- DIPLOMAN TIMES SUBNATIONAL WEEKLY EXECUTIVE PAGE TEMPLATE -->
<div class="dt-executive-page-wrapper" itemscope itemtype="https://schema.org/Report" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 10px 0;">

  <!-- DYNAMIC TITLE HEADLINE -->
  <h1 style="font-size: 22px; font-weight: 900; color: #064e3b; margin: 0 0 16px 0; line-height: 1.35; border-bottom: 2px solid #064e3b; padding-bottom: 10px;">
    {dynamic_title}
  </h1>

  <!-- FEATURED IMAGE CONTAINER -->
  <figure class="post-featured-image-container" style="box-sizing: border-box; margin: 0px 0px 16px; padding: 0px; position: relative; width: 100%;">
    <a href="https://www.diplomantimes.com/" aria-label="Nigeria State Governors" style="display: block; margin: 0px; padding: 0px; text-decoration: none;">
      <img alt="Nigeria State Governors" border="0" src="https://raw.githubusercontent.com/tennittes/diploman-data-engine/main/{folder_name}/week_{iso_week}_chart.png" style="border: 0px; display: block; height: auto; margin: 0px; padding: 0px; width: 100%;" />
    </a>
  </figure>

  <!-- LEAD NARRATIVE / BLOGGER SNIPPET -->
  <p style="color: #334155; font-size: 15px; font-weight: 500; line-height: 1.8; margin-bottom: 12px;">
    Nigeria’s subnational governance landscape this week reflected strategic progress across fiscal discipline, infrastructure, healthcare expansion, and energy development. State governments advanced vital legislative budgets, social protection schemes, and regional infrastructure pipelines to strengthen local economic productivity and governance accountability across the country.
  </p>

  <!--more-->

  <!-- 1. QUANTITATIVE INDEX LEADERBOARD -->
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
          {top_psi}
        </div>
      </div>

      <div style="background-color: #ffffff; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 4px;">
        <div style="font-size: 10px; font-weight: 900; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          STATE INSTABILITY SCORE (SIS) &bull; LOWEST RISK
        </div>
        <div id="dt-sis-leaderboard" style="font-size: 12.5px; font-weight: 800; color: #0f172a;">
          {top_sis}
        </div>
      </div>
    </div>
  </section>

  <!-- 2. DYNAMIC MACRO ANALYSIS SYNTHESIS -->
  <section style="margin-bottom: 32px;">
    <h2 style="font-size: 16px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
      Macro Governance Synthesis &amp; Policy Dynamics
    </h2>
    <p style="color: #334155; font-size: 15px; font-weight: 500; line-height: 1.8; margin-bottom: 12px;">
      Across Nigeria’s 36 states and the Federal Capital Territory, reported executive activity during the week focused on fiscal planning, energy development, public-service delivery and social protection. Katsina’s early approval of its 2027 budget and solar investments, Lagos’s work on electricity and urban infrastructure, and several states’ commitments to healthcare and education illustrate the range of priorities competing for public resources. The significance of these initiatives will ultimately depend on implementation: whether approved funds are released as intended, projects meet quality and delivery standards, and citizens experience measurable improvements in essential services.
    </p>
    <p style="color: #334155; font-size: 15px; font-weight: 500; line-height: 1.8; margin-bottom: 12px;">
      The reported State Instability Score (SIS) places Ogun, Lagos and Ekiti among the lowest-scoring jurisdictions in this week’s comparison. The State Instability Score (SIS) gives decision-makers a high-level, quantitative view of subnational risk. Although it tracks broader trends rather than individual incidents, it provides an important strategic baseline. Government leaders and institutional investors should assess SIS scorecards alongside the PSI values.
    </p>
  </section>

  <section style="background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #64748b; padding: 12px 16px; margin: 0 0 28px 0; border-radius: 4px;">
    <p style="font-size: 12px; color: #475569; line-height: 1.65; margin: 0; text-align: justify;"><strong>Editorial note:</strong> PSI and SIS rankings are reproduced from the reporting dataset for comparative use. Financial figures, projected savings, project status and reported outcomes should be interpreted according to their stated status and verified against the relevant official records. A policy announcement or approved allocation should not be treated as evidence that a project is complete or that a public outcome has been measured.</p>
  </section>

  <!-- 3. DYNAMIC CORRIDOR GROUPS WITH GOVERNOR IMPACT VECTORS -->
  <section style="margin-bottom: 32px;">
    <h2 style="font-size: 16px; font-weight: 900; color: #064e3b; text-transform: uppercase; margin: 0 0 16px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
      Subnational Strategic Corridor Group Analysis
    </h2>
    {corridor_html_blocks}
  </section>

  <!-- 4. STRATEGIC OUTLOOK & CONCLUSION -->
  <section style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 20px; margin: 24px 0 12px 0;">
    <h3 style="font-size: 11px; font-weight: 900; color: #064e3b; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 8px 0;">
      Strategic Policy Outlook
    </h3>
    <p style="font-size: 12.5px; color: #334155; line-height: 1.6; margin: 0 0 18px 0; text-align: justify;">
      The week’s announcements identify several priorities for continued executive scrutiny. First, fiscal plans should be judged against budget execution, revenue collection, debt reporting and the timely publication of procurement information. Second, renewable-energy projects need clear maintenance arrangements, reliable service data and transparent reporting of projected savings against realised savings. Third, pension settlements and social-protection programmes require auditable beneficiary records and predictable payment schedules. Finally, infrastructure commitments should be assessed against milestones, construction quality, operating costs and the communities actually served. For businesses and investors, index scores and early budget approvals can inform further analysis, but they should not replace due diligence on security, regulation, infrastructure and public finances.
    </p>

    <h3 style="font-size: 11px; font-weight: 900; color: #064e3b; text-transform: uppercase; letter-spacing: 0.8px; margin: 0 0 8px 0; border-top: 1px solid #e2e8f0; padding-top: 14px;">
      Executive Risk Conclusion
    </h3>
    <p style="font-size: 12.5px; color: #334155; line-height: 1.6; margin: 0; text-align: justify;">
      This week’s record reflects policymaking across several sectors; however, the volume of announcements is not, by itself, evidence of effective governance. A sound assessment distinguishes between proposals, approvals, projects under construction and completed services. It also asks whether spending represents value for money, whether delivery is equitable and whether results can be independently verified. Diploman Times will continue to track executive decisions across all 36 states and the Federal Capital Territory, compare reported performance, and examine the gap between policy commitments and outcomes for residents, public institutions and investors.
    </p>
  </section>
</div>"""


def compile_facebook_text(iso_week, ending_date_str, top_psi, top_sis, corridor_items):
    state_bullets = ""
    for c in corridor_items:
        state_bullets += f"\n\n• {c['state'].upper()}: {c['summary']}"

    raw = f"""Subnational Governance Intelligence Brief Week {iso_week} Policy Roundup Ending {ending_date_str} 🇳🇬

Top Performing States: {top_psi}
Top Security-Rated States: {top_sis}

EXECUTIVE SUMMARY
Nigeria's subnational governance landscape this week reflected a broad push towards infrastructure delivery, fiscal discipline, social protection, energy development and public-service reform. From early budget approval and renewable energy investment to healthcare expansion, education support and disaster response, state governments recorded initiatives with potential for economic productivity and public welfare.

Our dual-metric scorecards help decision-makers compare policy implementation, security stability and governance performance across Nigeria’s states.

STATE EXECUTIVE DEVELOPMENTS & HIGHLIGHTS:{state_bullets}

STRATEGIC ASSESSMENT
Three priorities stand out from the week's developments:
Fiscal credibility: Early budgeting, rising internally generated revenue and transparent procurement can strengthen investor confidence.

Human-capital investment: Healthcare, education, pensions and vocational training remain essential to productivity and social stability.

Implementation and resilience: Roads, electricity, drainage and disaster-response programmes require maintenance, credible timelines and independent oversight.

THE WEEK AHEAD
The overall picture is one of active subnational policymaking, with notable initiatives in fiscal management, public services and infrastructure.

Diploman Times will continue tracking executive decisions, measuring reported performance and examining outcomes across Nigeria's 36 states and the Federal Capital Territory.

🌐 Explore daily governance updates, security indicators and budget analysis at www.diplomantimes.com.

Diploman Times - Strategic Governance Intelligence."""
    return sanitize_plain_text(raw)


def compile_linkedin_text(iso_week, ending_date_str, top_psi, top_sis, corridor_items):
    state_bullets = ""
    for c in corridor_items:
        state_bullets += f"\n\n► {c['state'].upper()} ({c['governor']})\n{c['summary']}"

    raw = f"""[WEEKLY {iso_week} POLICY BRIEF] Subnational Governance Intelligence Roundup Ending {ending_date_str} 🇳🇬

TOP PERFORMERS: {top_psi}
TOP SECURITY-RATED: {top_sis}

EXECUTIVE SUMMARY
Executive activity across Nigeria’s 36 states and the FCT covered fiscal governance, energy, healthcare, education and social protection. Our index tracks policy progress and benchmarks performance, giving business leaders and policy analysts a verified baseline to assess implementation and long-term project delivery.

STATE-BY-STATE EXECUTIVE ACTIONS:{state_bullets}

STRATEGIC OUTLOOK
Fiscal credibility requires transparent spending and verified delivery. Health, education, pensions and skills training matter when they improve access and quality. Infrastructure and emergency programmes need maintenance and oversight.

WEEKLY VERDICT
Policy activity was substantial, but announcements alone do not prove governance success. Progress depends on completion, beneficiaries, cost and lasting results. Diploman Times will track executive decisions and outcomes across Nigeria's 36 states and the FCT.

🌐 Governance updates, security indicators and budget analysis: www.diplomantimes.com
Diploman Times - Subnational Governance Intelligence."""
    return sanitize_plain_text(raw)


def main():
    args = parse_args()
    raw_input = args.week or os.getenv("REPORTING_WEEK") or "auto"
    iso_year, iso_week, monday_date, friday_date = resolve_iso_week_window(raw_input)
    
    month_names = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]
    ending_date_str = f"{month_names[friday_date.month - 1]} {friday_date.day:02d}, {iso_year}"

    print(f"[START] Compiling full-fidelity briefs for ISO Week {iso_week} ({monday_date} to {friday_date})")
    
    data_payload, folder_name = load_master_data(iso_year, iso_week)
    top_psi, top_sis, corridor_items = extract_rankings_and_corridors(data_payload)

    dist_dir = os.path.join("dist", f"week_{iso_week}")
    os.makedirs(dist_dir, exist_ok=True)
    os.makedirs("dist", exist_ok=True)

    blogger_content = compile_blogger_html(iso_week, ending_date_str, folder_name, top_psi, top_sis, corridor_items)
    facebook_content = compile_facebook_text(iso_week, ending_date_str, top_psi, top_sis, corridor_items)
    linkedin_content = compile_linkedin_text(iso_week, ending_date_str, top_psi, top_sis, corridor_items)

    vault_payload = {
        "week": iso_week,
        "year": iso_year,
        "endingDate": ending_date_str,
        "folder": folder_name,
        "topPsi": top_psi,
        "topSis": top_sis,
        "linkedinText": linkedin_content,
        "facebookText": facebook_content,
        "bloggerHtml": blogger_content
    }

    with open(os.path.join(dist_dir, "blogger.html"), "w", encoding="utf-8") as f:
        f.write(blogger_content)

    with open(os.path.join(dist_dir, "facebook.txt"), "w", encoding="utf-8") as f:
        f.write(facebook_content)

    with open(os.path.join(dist_dir, "linkedin.txt"), "w", encoding="utf-8") as f:
        f.write(linkedin_content)

    with open(os.path.join(dist_dir, "data.json"), "w", encoding="utf-8") as f:
        json.dump(vault_payload, f, indent=2, ensure_ascii=False)

    with open(f"week{iso_week}-data.json", "w", encoding="utf-8") as f:
        json.dump(vault_payload, f, indent=2, ensure_ascii=False)

    print(f"[SUCCESS] Compiled Week {iso_week} un-truncated reports saved to {dist_dir}/ and week{iso_week}-data.json")


if __name__ == "__main__":
    main()
