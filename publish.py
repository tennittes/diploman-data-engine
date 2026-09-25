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

    items = []
    if isinstance(master_data, dict):
        for key in ["states", "newsReports", "data", "items"]:
            if key in master_data and isinstance(master_data[key], list):
                items = master_data[key]
                break
        if not items:
            for k, v in master_data.items():
                if isinstance(v, dict):
                    item_copy = v.copy()
                    if "stateName" not in item_copy and "state" not in item_copy:
                        item_copy["stateName"] = k
                    items.append(item_copy)
    elif isinstance(master_data, list):
        items = master_data

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
    meta = payload["editionMetadata"]
    layout = payload["frontPageLayout"]
    lead = layout["centerColumn"].get("leadStory", {})
    r1 = layout["centerColumn"].get("firstRunnerUp", {})
    r2 = layout["centerColumn"].get("secondRunnerUp", {})
    
    left_flank_html = ""
    right_flank_html = ""

    for item in layout.get("flankingColumns", []):
        img_src = item.get("imageUrl", "")
        img_alt = item.get("imageAlt", "")
        img_tag = f'<img src="{img_src}" alt="{img_alt}" style="width: 100%; height: auto; border: 1px solid #d1d5db; display: block; margin-bottom: 6px;" />' if img_src else ''
        
        card = f"""
        <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 12px;">
          {img_tag}
          <div style="font-size: 9px; font-weight: bold; color: #173730; text-transform: uppercase; margin-bottom: 2px;">{item.get('state')} (PSI: {item.get('psi')})</div>
          <h4 style="font-size: 13px; line-height: 1.25; margin: 0 0 4px 0; color: #111; font-family: Georgia, serif;">{item.get('headline')}</h4>
          <span style="font-size: 10px; color: #555; font-style: italic;">{item.get('title')} {item.get('governor')}</span>
        </div>
        """
        if item.get("side") == "left":
            left_flank_html += card
        else:
            right_flank_html += card

    lead_url = lead.get('imageUrl', '')
    lead_alt = lead.get('imageAlt', '')
    lead_img_tag = f'<img src="{lead_url}" alt="{lead_alt}" style="width: 100%; height: auto; border: 1px solid #173730; display: block; margin: 10px 0;" />' if lead_url else ''

    r1_url = r1.get('imageUrl', '')
    r1_alt = r1.get('imageAlt', '')
    r1_img_tag = f'<img src="{r1_url}" alt="{r1_alt}" style="width: 100%; height: auto; border: 1px solid #d1d5db; display: block; margin-bottom: 6px;" />' if r1_url else ''

    r2_url = r2.get('imageUrl', '')
    r2_alt = r2.get('imageAlt', '')
    r2_img_tag = f'<img src="{r2_url}" alt="{r2_alt}" style="width: 100%; height: auto; border: 1px solid #d1d5db; display: block; margin-bottom: 6px;" />' if r2_url else ''

    html_code = f"""
    <div style="font-family: Georgia, serif; background-color: #fdfbf7; border: 3px double #173730; padding: 24px; max-width: 1100px; margin: 0 auto; color: #111;">
      
      <!-- Broadsheet Top Bar -->
      <div style="border-bottom: 1px solid #173730; padding-bottom: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; text-transform: uppercase; font-weight: bold; color: #333;">
        <span>{meta.get('date')}</span>
        <span>{meta.get('portalUrl')}</span>
        <span>{meta.get('volNumber')}</span>
      </div>

      <!-- Masthead Header -->
      <div style="border-bottom: 3px solid #173730; padding-bottom: 12px; margin-bottom: 20px; text-align: center;">
        <h1 style="font-size: 42px; font-family: 'Times New Roman', Times, serif; font-weight: 900; margin: 0; color: #173730; letter-spacing: 3px;">DIPLOMAN TIMES</h1>
        <p style="font-size: 11px; text-transform: uppercase; margin: 4px 0 0 0; color: #555; letter-spacing: 1.5px; font-weight: 600;">Subnational Governance & Policy Intelligence</p>
      </div>

      <!-- Main 3-Column Newspaper Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1.8fr 1fr; gap: 20px; align-items: start;">
        
        <!-- Left Flanking Column -->
        <div style="border-right: 1px solid #d1d5db; padding-right: 15px;">
          <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #173730; padding-bottom: 4px; margin-bottom: 12px; color: #173730;">Surveillance Grid</div>
          {left_flank_html}
        </div>

        <!-- Center Column (Lead & Runners-Up) -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          
          <!-- Lead Story -->
          <div style="border-bottom: 2px solid #173730; padding-bottom: 16px;">
            <span style="background: #173730; color: #fff; font-size: 10px; padding: 3px 8px; text-transform: uppercase; font-weight: bold; display: inline-block; margin-bottom: 6px;">Strategic Lead | PSI: {lead.get('psi')}</span>
            <h2 style="font-size: 24px; line-height: 1.2; margin: 6px 0 10px 0; color: #111; font-family: 'Times New Roman', Times, serif;">{lead.get('headline')}</h2>
            {lead_img_tag}
            <p style="font-size: 12px; color: #441; font-style: italic; margin: 0;">Focus: {lead.get('title')} {lead.get('governor')} ({lead.get('state')}) — SIS Index: {lead.get('sis')}</p>
          </div>
          <!--more-->

          <!-- Runners Up Section -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; border-bottom: 1px solid #d1d5db; padding-bottom: 16px;">
            <div>
              <div style="font-size: 9px; font-weight: bold; color: #2A4B23; text-transform: uppercase; margin-bottom: 4px;">2nd Rank ({r1.get('state')} - PSI: {r1.get('psi')})</div>
              {r1_img_tag}
              <h3 style="font-size: 14px; line-height: 1.3; margin: 4px 0; color: #111;">{r1.get('headline')}</h3>
              <p style="font-size: 10px; color: #555; margin: 0; font-style: italic;">{r1.get('title')} {r1.get('governor')}</p>
            </div>
            <div>
              <div style="font-size: 9px; font-weight: bold; color: #2A4B23; text-transform: uppercase; margin-bottom: 4px;">3rd Rank ({r2.get('state')} - PSI: {r2.get('psi')})</div>
              {r2_img_tag}
              <h3 style="font-size: 14px; line-height: 1.3; margin: 4px 0; color: #111;">{r2.get('headline')}</h3>
              <p style="font-size: 10px; color: #555; margin: 0; font-style: italic;">{r2.get('title')} {r2.get('governor')}</p>
            </div>
          </div>

        </div>

        <!-- Right Flanking Column -->
        <div style="border-left: 1px solid #d1d5db; padding-left: 15px;">
          <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #173730; padding-bottom: 4px; margin-bottom: 12px; color: #173730;">Policy Index Feed</div>
          {right_flank_html}
        </div>

      </div>

      <!-- Footer Bar -->
      <div style="border-top: 2px solid #173730; margin-top: 20px; padding-top: 10px; text-align: center; font-size: 10px; text-transform: uppercase; color: #555; font-weight: bold;">
        Governors. News. Live Telemetry. Tracking governance across Nigeria's 36 States and Abuja. &bull; {meta.get('portalUrl')}
      </div>

    </div>
    """

    return optimize_blogger_images(html_code)

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
