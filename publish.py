import os
import json
import glob
import textwrap
import subprocess
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

CLIENT_ID = os.environ.get("BLOGGER_CLIENT_ID")
CLIENT_SECRET = os.environ.get("BLOGGER_CLIENT_SECRET")
REFRESH_TOKEN = os.environ.get("BLOGGER_REFRESH_TOKEN")
BLOG_ID = os.environ.get("BLOGGER_BLOG_ID")

BATCH_LIMIT = 1  # Updated: Process exactly 1 post per execution (every 30 mins)

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

def build_news_report_html(item):
    """
    Renders structured news report JSON components into a clean Blogger HTML payload.
    """
    html_parts = []
    
    # 1. Featured Image
    if "featured_image" in item:
        img = item["featured_image"]
        html_parts.append(textwrap.dedent(f"""
        <figure class="post-featured-image-container" style="box-sizing: border-box; margin: 0px 0px 8px; padding: 0px; position: relative; width: 100%;">
          <a href="{img.get('target_url', 'https://www.diplomantimes.com')}" style="display: block; margin: 0px; padding: 0px; text-decoration: none;">
            <img alt="{img.get('alt', '')}" border="0" src="{img.get('src', '')}" style="border: 0px; display: block; height: auto; margin: 0px; padding: 0px; width: 100%;" />
          </a>
        </figure>
        """).strip())

    # 2. Lead Narrative (Before <!--more--> tag)
    if "lead_narrative" in item:
        html_parts.append(textwrap.dedent(f"""
        <p style="font-size: 15px; line-height: 1.8; color: #334155; margin-bottom: 12px; font-weight: 500;">
          {item['lead_narrative']}
        </p>
        <!--more-->
        """).strip())

    # 3. Editorial Notice Badge
    if "editorial_notice" in item:
        notice_text = item['editorial_notice'].replace('EDITORIAL NOTICE:', '').strip()
        html_parts.append(textwrap.dedent(f"""
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #173730; padding: 10px 14px; margin: 16px 0 24px 0; border-radius: 4px; font-size: 12px; color: #475569;">
          <strong>EDITORIAL NOTICE:</strong> {notice_text}
        </div>
        """).strip())

    # 4. Body Paragraphs
    if "story_body" in item:
        for p in item["story_body"]:
            html_parts.append(textwrap.dedent(f"""
            <p style="font-size: 15px; line-height: 1.8; color: #334155; margin-bottom: 18px;">
              {p}
            </p>
            """).strip())

    # 5. Call To Action Terminal Interlink Block
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

    return "\n\n".join(html_parts)

def get_target_file_and_data():
    json_files = sorted(glob.glob("**/master-data.json", recursive=True))
    if not json_files:
        raise FileNotFoundError("No master-data.json file found in repository.")
    
    target_file = json_files[-1]
    with open(target_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    return target_file, data

def publish_batch_content():
    file_path, data = get_target_file_and_data()
    
    # Extract items array from dictionary or root list
    if isinstance(data, dict) and "newsReports" in data:
        items = data["newsReports"]
    elif isinstance(data, list):
        items = data
    else:
        print("Unrecognized data format in master-data.json.")
        return

    published_count = 0
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
                content = item.get("content", "<p>No content provided.</p>")

            body = {
                "kind": "blogger#post",
                "title": title,
                "content": content,
                "labels": labels
            }
            
            # Send payload to Google Blogger API
            posts = service.posts()
            result = posts.insert(blogId=BLOG_ID, body=body, isDraft=False).execute()
            print(f"[{published_count + 1}/{BATCH_LIMIT}] Published: '{title}' -> {result.get('url')}")

            # Mark item as published in memory
            item["published"] = True
            published_count += 1

    if published_count == 0:
        print("No unpublished items found in master-data.json. Skipping execution.")
        return

    # Write updated state back to file
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Updated {published_count} item(s) to 'published': true in {file_path}")

    # Commit updated master-data.json back to GitHub
    try:
        subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"], check=True)
        subprocess.run(["git", "add", file_path], check=True)
        subprocess.run(["git", "commit", "-m", f"auto: publish single post (30-min cadence)"], check=True)
        subprocess.run(["git", "push"], check=True)
        print("Pushed publication state update to repository.")
    except Exception as e:
        print(f"Note: Git auto-commit skipped or failed: {e}")

if __name__ == "__main__":
    publish_batch_content()
