import os
import json
import glob
import textwrap
import subprocess
import re
from datetime import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

CLIENT_ID = os.environ.get("BLOGGER_CLIENT_ID")
CLIENT_SECRET = os.environ.get("BLOGGER_CLIENT_SECRET")
REFRESH_TOKEN = os.environ.get("BLOGGER_REFRESH_TOKEN")
BLOG_ID = os.environ.get("BLOGGER_BLOG_ID")

# Choose which headline variant from master-data.json to primarily use ("B1" or "B2")
HEADLINE_VARIANT_KEY = "B1" 

def get_blogger_service():
    creds = Credentials(
        token=None,
        refresh_token=REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scopes=['https://www.googleapis.com/auth/blogger']
    )
    return build('blogger', 'v3', credentials=creds)

def optimize_blogger_images(html_content):
    """Automatically forces Blogger image CDN URLs to an optimized width (s720) 
    and enables WebP compression (-rw) to fix mobile performance bottlenecks."""
    if not html_content:
        return html_content
    pattern = r'(https?://blogger\.googleusercontent\.com/img/[^/]+/)s\d+((-[a-zA-Z0-9\-_]+)*)(/)'
    replacement = r'\1s720-rw\2\4'
    return re.sub(pattern, replacement, html_content)

def load_json_file(filename):
    """Utility to safely load JSON files with fallback recursive search."""
    if os.path.exists(filename):
        with open(filename, "r", encoding="utf-8") as f:
            return json.load(f)
    json_files = sorted(glob.glob(f"**/{filename}", recursive=True))
    if json_files:
        with open(json_files[-1], "r", encoding="utf-8") as f:
            return json.load(f)
    raise FileNotFoundError(f"Required file '{filename}' not found in repository.")

def compile_front_page_layout():
    """Reads master-data.json and governors-registry.json, sorts by PSI, and builds the layout mapping."""
    registry = load_json_file("governors-registry.json")
    master_data = load_json_file("master-data.json")

    if isinstance(master_data, dict):
        items = master_data.get("states", master_data.get("newsReports", master_data.get("data", [])))
        if not items and "centerColumn" not in master_data:
            items = [{"stateName": k, **v} for k, v in master_data.items() if isinstance(v, dict)]
    elif isinstance(master_data, list):
        items = master_data
    else:
        items = []

    def get_reg_info(state_name):
        for key in registry:
            if key.lower() == str(state_name).strip().lower():
                return registry[key]
        return {
            "executive": "Executive Office",
            "title": "Gov.",
            "src": "",
            "alt": f"{state_name} Executive Office",
            "aria_label": f"{state_name} Governance Policy Intelligence"
        }

    def extract_state_name(item):
        raw_state = item.get('stateName') or item.get('state') or item.get('jurisdiction')
        text_to_check = (item.get(HEADLINE_VARIANT_KEY) or item.get('headline') or item.get('title') or "").lower()
        
        if raw_state:
            for s_name in registry.keys():
                if s_name.lower() == str(raw_state).strip().lower():
                    return s_name
            return str(raw_state).strip()
            
        governor_aliases = {
            "nwifuru": "Ebonyi", "okpebholo": "Edo", "kefas": "Taraba", "zulum": "Borno",
            "uzodimma": "Imo", "fintiri": "Adamawa", "bago": "Niger", "adeleke": "Osun",
            "makinde": "Oyo", "soludo": "Anambra", "sanwo-olu": "Lagos", "wike": "FCT Abuja"
        }
        for alias, state_name in governor_aliases.items():
            if alias in text_to_check:
                return state_name

        for s_name in registry.keys():
            if s_name.lower() in text_to_check:
                return s_name
                
        return "Unknown"

    sorted_items = sorted(items, key=lambda x: float(x.get('psi', 3.0)), reverse=True)

    center_column = {}
    flanking_columns = []

    center_keys = ["leadStory", "firstRunnerUp", "secondRunnerUp"]
    for idx, key in enumerate(center_keys):
        if idx < len(sorted_items):
            item = sorted_items[idx]
            state_name = extract_state_name(item)
            reg = get_reg_info(state_name)
            headline_text = item.get(HEADLINE_VARIANT_KEY) or item.get('headline') or item.get('title') or f"Telemetry update for {state_name}"
            
            center_column[key] = {
                "rank": idx + 1,
                "state": state_name,
                "governor": reg.get("executive", "Executive Office"),
                "title": reg.get("title", "Gov."),
                "psi": float(item.get('psi', 3.0)),
                "sis": float(item.get('sis', 2.8)),
                "headline": headline_text,
                "imageUrl": reg.get("src", ""),
                "imageAlt": reg.get("alt", f"{state_name} Executive Office"),
                "imageAriaLabel": reg.get("aria_label", f"{state_name} Governance Policy Intelligence")
            }

    flanking_states = sorted_items[3:12]
    for idx, item in enumerate(flanking_states):
        state_name = extract_state_name(item)
        reg = get_reg_info(state_name)
        side = "left" if idx % 2 == 0 else "right"
        headline_text = item.get(HEADLINE_VARIANT_KEY) or item.get('headline') or item.get('title') or f"Telemetry update for {state_name}"
        
        flanking_columns.append({
            "positionIndex": idx + 1,
            "side": side,
            "rank": idx + 4,
            "state": state_name,
            "governor": reg.get("executive", "Executive Office"),
            "title": reg.get("title", "Gov."),
            "psi": float(item.get('psi', 3.0)),
            "sis": float(item.get('sis', 2.8)),
            "headline": headline_text,
            "imageUrl": reg.get("src", ""),
            "imageAlt": reg.get("alt", f"{state_name} Executive Office"),
            "imageAriaLabel": reg.get("aria_label", f"{state_name} Governance Policy Intelligence")
        })

    edition_date_str = datetime.now().strftime("%A, %B %d, %Y")
    
    return {
        "editionMetadata": {
            "date": edition_date_str,
            "volNumber": "Vol. 1 No. 94",
            "portalUrl": "www.diplomantimes.com"
        },
        "frontPageLayout": {
            "centerColumn": center_column,
            "flankingColumns": flanking_columns
        }
    }

def build_daily_front_page_html(payload):
    layout = payload["frontPageLayout"]
    lead = layout["centerColumn"].get("leadStory", {})
    r1 = layout["centerColumn"].get("firstRunnerUp", {})
    r2 = layout["centerColumn"].get("secondRunnerUp", {})
    
    lead_img_url = lead.get('imageUrl', '')
    lead_img_alt = lead.get('imageAlt', '')
    lead_img_tag = f'<img src="{lead_img_url}" alt="{lead_img_alt}" style="width: 100%; height: auto; border: 1px solid #ccc; display: block; margin-bottom: 10px;" />' if lead_img_url else ''

    html_parts = []
    
    # Newspaper Header & Lead Story
    html_parts.append(textwrap.dedent(f"""
    <div style="font-family: Georgia, serif; background-color: #fdfbf7; border: 2px solid #173730; padding: 20px; max-width: 800px; margin: 0 auto;">
      <div style="border-bottom: 2px solid #173730; padding-bottom: 10px; margin-bottom: 20px; text-align: center;">
        <h1 style="font-size: 28px; font-family: 'Times New Roman', serif; margin: 0; color: #173730; letter-spacing: 2px;">DIPLOMAN TIMES</h1>
        <p style="font-size: 11px; text-transform: uppercase; margin: 5px 0 0 0; color: #555;">Subnational Governance & Policy Intelligence</p>
      </div>

      <div style="margin-bottom: 20px; border-bottom: 1px solid #d1d5db; padding-bottom: 15px;">
        <span style="background: #173730; color: #fff; font-size: 10px; padding: 2px 6px; text-transform: uppercase; font-weight: bold;">Lead Intelligence | PSI: {lead.get('psi', 'N/A')}</span>
        <h2 style="font-size: 22px; line-height: 1.3; margin: 10px 0; color: #111;">{lead.get('headline', '')}</h2>
        {lead_img_tag}
        <p style="font-size: 13px; color: #441; font-style: italic; margin: 0;">Focus: {lead.get('title', '')} {lead.get('governor', '')} ({lead.get('state', '')}) — SIS Index: {lead.get('sis', 'N/A')}</p>
      </div>
      <!--more-->
    """).strip())

    # Runners Up Grid
    if r1 or r2:
        html_parts.append(textwrap.dedent(f"""
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; border-bottom: 1px solid #d1d5db; padding-bottom: 15px;">
            <div>
              <span style="font-size: 9px; font-weight: bold; color: #2A4B23; text-transform: uppercase;">1st Runner-Up ({r1.get('state', '')} - PSI: {r1.get('psi', '')})</span>
              <h3 style="font-size: 15px; line-height: 1.3; margin: 5px 0; color: #111;">{r1.get('headline', '')}</h3>
              <p style="font-size: 11px; color: #666; margin: 0; font-style: italic;">{r1.get('title', '')} {r1.get('governor', '')}</p>
            </div>
            <div>
              <span style="font-size: 9px; font-weight: bold; color: #2A4B23; text-transform: uppercase;">2nd Runner-Up ({r2.get('state', '')} - PSI: {r2.get('psi', '')})</span>
              <h3 style="font-size: 15px; line-height: 1.3; margin: 5px 0; color: #111;">{r2.get('headline', '')}</h3>
              <p style="font-size: 11px; color: #666; margin: 0; font-style: italic;">{r2.get('title', '')} {r2.get('governor', '')}</p>
            </div>
          </div>
        """).strip())

    # Flanking Columns (Ranks 4-12)
    html_parts.append('<h4 style="font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #173730; padding-bottom: 4px; color: #173730;">Subnational Surveillance Grid (Ranks 4–12)</h4>')
    html_parts.append('<ul style="padding-left: 20px; font-size: 13px; color: #333; line-height: 1.6;">')
    
    for item in layout.get("flankingColumns", []):
        html_parts.append(f"""
          <li style="margin-bottom: 10px;">
            <strong>{item.get('state')} (Rank {item.get('rank')} | PSI: {item.get('psi')}):</strong> {item.get('headline')} 
            <span style="font-size: 11px; color: #666; font-style: italic;">— {item.get('title')} {item.get('governor')}</span>
          </li>
        """)
        
    html_parts.append('</ul></div>')
    
    return optimize_blogger_images("\n".join(html_parts))

def publish_daily_edition():
    try:
        front_page_payload = compile_front_page_layout()
        
        os.makedirs('output', exist_ok=True)
        with open('output/front-page-engine.json', 'w', encoding='utf-8') as f_out:
            json.dump(front_page_payload, f_out, indent=2)
        print("Successfully compiled and updated output/front-page-engine.json from master telemetry.")

        edition_date = front_page_payload["editionMetadata"]["date"]
        daily_title = f"Diploman Times Daily Briefing & Front Page Intelligence – {edition_date}"
        post_content = build_daily_front_page_html(front_page_payload)

        service = get_blogger_service()
        body = {
            "kind": "blogger#post",
            "title": daily_title,
            "content": post_content,
            "labels": ["Front Page Edition", "Daily Briefing", "Governance Intelligence"]
        }
        
        result = service.posts().insert(blogId=BLOG_ID, body=body, isDraft=False).execute()
        print(f"Successfully published single daily edition post: '{daily_title}' -> {result.get('url')}")

    except Exception as err:
        print(f"Error during daily edition compilation/publishing: {err}")

    try:
        subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"], check=True)
        
        subprocess.run(["git", "add", "output/front-page-engine.json"], check=True)
        
        status_result = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, check=True)
        if status_result.stdout.strip():
            subprocess.run(["git", "commit", "-m", "auto: update front-page engine payload from master-data [skip ci]"], check=True)
            subprocess.run(["git", "push"], check=True)
            print("Successfully pushed front-page layout engine state to repository.")
        else:
            print("No changes detected; git commit/push skipped.")
    except Exception as e:
        print(f"Note: Git auto-commit skipped or failed: {e}")

if __name__ == "__main__":
    publish_daily_edition()
