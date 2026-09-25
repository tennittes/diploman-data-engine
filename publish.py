import os
import json
import glob
import textwrap
import subprocess
import re
import urllib.request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

CLIENT_ID = os.environ.get("BLOGGER_CLIENT_ID")
CLIENT_SECRET = os.environ.get("BLOGGER_CLIENT_SECRET")
REFRESH_TOKEN = os.environ.get("BLOGGER_REFRESH_TOKEN")
BLOG_ID = os.environ.get("BLOGGER_BLOG_ID")

BATCH_LIMIT = 4

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

def load_governors_registry():
    """Loads the fixed 37-jurisdiction governors registry lookup table."""
    registry_path = "governors-registry.json"
    if os.path.exists(registry_path):
        try:
            with open(registry_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error: Malformed JSON syntax in {registry_path} at line {e.lineno} column {e.colno}: {e.msg}")
        except Exception as e:
            print(f"Error reading {registry_path}: {e}")
    return {}

def is_image_url_working(url):
    """Tests if an image URL is reachable and returns a healthy HTTP 200 response."""
    if not url or not url.startswith("http"):
        return False
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=4) as response:
            return response.status == 200
    except Exception:
        return False

def extract_state_from_item(item, registry):
    raw_state = item.get('stateName') or item.get('state') or item.get('jurisdiction')
    text_to_check = (item.get('headline') or item.get('title') or "").lower()
    
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

def format_front_page_layout_data(items):
    """Sorts items by PSI descending and maps them to center and flanking columns using the registry."""
    registry = load_governors_registry()
    
    # Sort items by PSI score descending if available
    sorted_items = sorted(items, key=lambda x: float(x.get('psi', 3.0)), reverse=True)
    
    def get_reg_info(state_name):
        return registry.get(state_name, {
            "executive": "Executive Office",
            "title": "Gov.",
            "src": "",
            "alt": f"{state_name} Executive Office",
            "aria_label": f"{state_name} Governance Policy Intelligence"
        })

    center_column = {}
    flanking_columns = []

    # Map top 3 for center column
    center_keys = ["leadStory", "firstRunnerUp", "secondRunnerUp"]
    for idx, key in enumerate(center_keys):
        if idx < len(sorted_items):
            item = sorted_items[idx]
            state_name = item.get('stateName', item.get('state', 'Unknown'))
            reg = get_reg_info(state_name)
            center_column[key] = {
                "rank": idx + 1,
                "state": state_name,
                "governor": reg["executive"],
                "title": reg["title"],
                "psi": item.get('psi', 3.0),
                "sis": item.get('sis', 2.8),
                "headline": item.get('headline', item.get('title', f"Telemetry update for {state_name}")),
                "imageUrl": reg["src"],
                "imageAlt": reg["alt"],
                "imageAriaLabel": reg["aria_label"]
            }

    # Map ranks 4 through 12 to left/right flanking columns alternatively
    flanking_states = sorted_items[3:12]
    for idx, item in enumerate(flanking_states):
        state_name = item.get('stateName', item.get('state', 'Unknown'))
        reg = get_reg_info(state_name)
        side = "left" if idx % 2 == 0 else "right"
        flanking_columns.append({
            "positionIndex": idx + 1,
            "side": side,
            "rank": idx + 4,
            "state": state_name,
            "governor": reg["executive"],
            "title": reg["title"],
            "psi": item.get('psi', 3.0),
            "sis": item.get('sis', 2.8),
            "headline": item.get('headline', item.get('title', f"Telemetry update for {state_name}")),
            "imageUrl": reg["src"],
            "imageAlt": reg["alt"],
            "imageAriaLabel": reg["aria_label"]
        })

    return {
        "centerColumn": center_column,
        "flankingColumns": flanking_columns
    }

def build_news_report_html(item):
    html_parts = []
    registry = load_governors_registry()
    
    img_src = ""
    img_alt = ""
    target_url = "https://www.diplomantimes.com"
    aria_label = "Diploman Times Governance and Policy Intelligence"

    queue_img_src = ""
    if "featured_image" in item:
        img = item["featured_image"]
        target_url = img.get('target_url', target_url)
        queue_img_src = img.get('src', '')
        img_alt = img.get('alt', '')
        aria_label = img.get('aria_label', aria_label)

    # 1. Check if queue image URL is provided AND working. If broken, trigger registry fallback.
    if queue_img_src and is_image_url_working(queue_img_src):
        img_src = queue_img_src
    else:
        state_name = extract_state_from_item(item, registry)
        reg = registry.get(state_name, {
            "executive": "Executive Office",
            "title": "Gov.",
            "src": "",
            "alt": f"{state_name} Executive Office",
            "aria_label": f"{state_name} Governance Policy Intelligence"
        })
        img_src = reg.get("src", "")
        img_alt = reg.get("alt", f"{state_name} Executive Office")
        aria_label = reg.get("aria_label", f"{state_name} Governance Policy Intelligence")

    # 2. Featured Image Container Render
    if img_src:
        html_parts.append(textwrap.dedent(f"""
        <figure class="post-featured-image-container" style="box-sizing: border-box; margin: 0px 0px 8px; padding: 0px; position: relative; width: 100%;">
          <a href="{target_url}" aria-label="{aria_label}" style="display: block; margin: 0px; padding: 0px; text-decoration: none;">
            <img alt="{img_alt}" border="0" src="{img_src}" style="border: 0px; display: block; height: auto; margin: 0px; padding: 0px; width: 100%;" />
          </a>
        </figure>
        """).strip())

    # 3. Lead Narrative
    if "lead_narrative" in item:
        html_parts.append(textwrap.dedent(f"""
        <p style="font-size: 15px; line-height: 1.8; color: #334155; margin-bottom: 12px; font-weight: 500;">
          {item['lead_narrative']}
        </p>
        <!--more-->
        """).strip())

    # 4. Editorial Notice Badge
    if "editorial_notice" in item:
        notice_text = item['editorial_notice'].replace('EDITORIAL NOTICE:', '').strip()
        html_parts.append(textwrap.dedent(f"""
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #173730; padding: 10px 14px; margin: 16px 0 24px 0; border-radius: 4px; font-size: 12px; color: #475569;">
          <strong>EDITORIAL NOTICE:</strong> {notice_text}
        </div>
        """).strip())

    # 5. Body Paragraphs
    if "story_body" in item:
        for p in item["story_body"]:
            html_parts.append(textwrap.dedent(f"""
            <p style="font-size: 15px; line-height: 1.8; color: #334155; margin-bottom: 18px;">
              {p}
            </p>
            """).strip())

    # 6. Call To Action Terminal Interlink Block
    if "call_to_action" in item:
        cta = item["call_to_action"]
        html_parts.append(textwrap.dedent(f"""
        <div style="background: linear-gradient(135deg, #193731 0%, #112521 100%); border: 1px solid #234d44; border-left: 4px solid #38bdf8; border-radius: 6px; padding: 16px 20px; margin: 28px 0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span style="display: inline-block; width: 6px; height: 6px; background-color: #38bdf8; border-radius: 50%;"></span>
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #38bdf8; letter-spacing: 0.08em;">
              {cta.get('heading', 'Diploman Times Telemetry Interlink')}
            </span>
          </div>
          <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px;">
            <p style="font-size: 13px; margin: 0; line-height: 1.5; color: #e2e8f0; max-width: 540px; font-weight: 400;">
              {cta.get('text', '')}
            </p>
            <a href="{cta.get('button_url', '#')}" target="_top" style="display: inline-flex; align-items: center; gap: 6px; background-color: #2A4B23; color: #ffffff; font-size: 12px; font-weight: 700; text-decoration: none; padding: 9px 16px; border-radius: 4px; border: 1px solid #3a6631; transition: all 0.2s ease; white-space: nowrap;">
              {cta.get('button_label', 'Explore Terminal →')}
            </a>
          </div>
        </div>
        """).strip())

    raw_html = "\n\n".join(html_parts)
    return optimize_blogger_images(raw_html)

def get_target_file_and_data():
    target_file = "news-queue.json"
    if not os.path.exists(target_file):
        json_files = sorted(glob.glob("**/news-queue.json", recursive=True))
        if not json_files:
            raise FileNotFoundError("No news-queue.json file found in repository.")
        target_file = json_files[-1]
        
    try:
        with open(target_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Malformed JSON syntax in {target_file} at line {e.lineno} column {e.colno}: {e.msg}")
        raise
        
    return target_file, data

def publish_batch_content():
    published_count = 0
    file_path = None
    data = None

    try:
        file_path, data = get_target_file_and_data()
        
        if isinstance(data, dict) and "newsReports" in data:
            items = data["newsReports"]
        elif isinstance(data, list):
            items = data
        else:
            items = []

        # Generate and save structured front page layout mapping if items exist
        if items:
            front_page_layout = format_front_page_layout_data(items)
            os.makedirs('output', exist_ok=True)
            with open('output/front-page-engine.json', 'w', encoding='utf-8') as f_out:
                json.dump(front_page_layout, f_out, indent=2)
            print("Successfully compiled and updated output/front-page-engine.json layout mappings.")

        service = get_blogger_service()

        for item in items:
            if published_count >= BATCH_LIMIT:
                break

            if not item.get("published", False):
                title = item.get("title", "Diploman Times Report")
                labels = item.get("labels", ["Governance Intelligence"])
                
                if item.get("type") == "news_report" or "lead_narrative" in item:
                    content = build_news_report_html(item)
                else:
                    content = optimize_blogger_images(item.get("content", "<p>No content provided.</p>"))

                body = {
                    "kind": "blogger#post",
                    "title": title,
                    "content": content,
                    "labels": labels
                }
                
                posts = service.posts()
                result = posts.insert(blogId=BLOG_ID, body=body, isDraft=False).execute()
                post_url = result.get('url')
                print(f"[{published_count + 1}/{BATCH_LIMIT}] Published: '{title}' -> {post_url}")

                item["published"] = True
                published_count += 1

        if published_count > 0 and file_path and data:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            print(f"Updated {published_count} item(s) to 'published': true in {file_path}")

    except json.JSONDecodeError as json_err:
        print(f"Error: Publishing halted due to malformed JSON syntax at line {json_err.lineno} column {json_err.colno}: {json_err.msg}")
    except Exception as auth_err:
        print(f"Warning: Blogger API publishing skipped due to authentication/token error: {auth_err}")

    # Commit and push queue updates and layout configuration cleanly to GitHub
    try:
        subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"], check=True)
        
        subprocess.run(["git", "add", "output/front-page-engine.json"], check=True)
        if file_path and os.path.exists(file_path):
            subprocess.run(["git", "add", file_path], check=True)

        status_result = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, check=True)
        if status_result.stdout.strip():
            subprocess.run(["git", "commit", "-m", "auto: publish batch post state and update front-page layout [skip ci]"], check=True)
            subprocess.run(["git", "push"], check=True)
            print("Successfully pushed publishing queue state and front-page layout mapping to repository.")
        else:
            print("No changes detected; git commit/push skipped.")
    except Exception as e:
        print(f"Note: Git auto-commit skipped or failed: {e}")

if __name__ == "__main__":
    publish_batch_content()
