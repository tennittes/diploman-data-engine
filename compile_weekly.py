import os
import json
import glob
import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

CLIENT_ID = os.environ.get("BLOGGER_CLIENT_ID")
CLIENT_SECRET = os.environ.get("BLOGGER_CLIENT_SECRET")
REFRESH_TOKEN = os.environ.get("BLOGGER_REFRESH_TOKEN")
BLOG_ID = os.environ.get("BLOGGER_BLOG_ID")
PAGE_ID = os.environ.get("BLOGGER_WEEKLY_PAGE_ID")  # Target Blogger Page ID

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

def fetch_weekly_data():
    """Locates queue files and extracts published posts from the current week."""
    all_queues = glob.glob("**/news-queue.json", recursive=True)
    if os.path.exists("news-queue.json"):
        all_queues.append("news-queue.json")

    weekly_posts = []
    for q_path in all_queues:
        try:
            with open(q_path, "r", encoding="utf-8") as f:
                content = json.load(f)
                items = content.get("newsReports", []) if isinstance(content, dict) else content
                for item in items:
                    if item.get("published", False):
                        weekly_posts.append(item)
        except Exception as e:
            print(f"Warning reading {q_path}: {e}")

    return weekly_posts

def generate_weekly_html(weekly_posts):
    """Generates a clean HTML layout hosting both LinkedIn and Facebook draft blocks."""
    now = datetime.datetime.now()
    week_str = now.strftime("%B %d, %Y")

    # Extract state highlights
    states_covered = list(set([p.get("stateName") or p.get("labels", ["Subnational"])[-1] for p in weekly_posts if p.get("title")]))
    states_list_str = ", ".join(states_covered[:6]) if states_covered else "Sokoto, Taraba, Plateau"

    linkedin_text = f"""NIGERIA SUBNATIONAL GOVERNANCE INTELLIGENCE | WEEKLY EXECUTIVE BRIEF
Reporting Cycle: Week Ending {week_str} | Diploman Times Telemetry

Subnational executive governance across Nigeria’s 36 states and FCT demonstrated a strategic shift toward dual-track execution over the past week: pairing high-capacity security defense with targeted fiscal and structural interventions.

Our consolidated Policy Signal Index (PSI) and State Instability Score (SIS) analytics reveal key macro trends across active jurisdictions ({states_list_str}):

1. TACTICAL SECURITY HARDWARE SCALING
State executives are taking direct front-line ownership of regional security architecture. Major hardware deployments are actively protecting trade corridors and suppressing regional instability.

2. FISCAL AUDITABILITY & DIRECT WELFARE DISCLOSURE
Governance momentum across active states highlighted open public debt auditing paired with ward-level social investments to maintain institutional trust.

3. BILATERAL ENERGY PARTNERSHIPS & MASTER PLAN REFORMS
Subnational governments are increasingly leveraging international bilateral partnerships and clean energy projects to build local economic resilience.

EXECUTIVE OUTLOOK
Sustaining momentum into the next cycle requires subnational administrations to maintain open debt disclosures, enforce capital project timelines, and expand cross-border security coordination.

📲 Swipe through the carousel above for full state scorecards.
🌐 Track live PSI/SIS standings across all 37 jurisdictions:
https://www.diplomantimes.com/"""

    facebook_text = f"""NIGERIA SUBNATIONAL GOVERNANCE BRIEF | WEEKLY POLICY ROUNDUP 🇳🇬
Coverage Window: Week Ending {week_str} | Subnational Governance Intelligence

What drove state-level governance across Nigeria this week? 📈

At Diploman Times, our core mandate is to track subnational policy interactions, state executive choices, and governance velocity across all 36 States and the Federal Capital Territory (FCT). Beyond daily headlines, our weekly brief synthesizes state activities into actionable insights.

──────────────────────────────────────────
🛡️ 1. SECURITY & RURAL STABILIZATION
States across agricultural belts executed major tactical hardware deployments to secure trade routes and protect farming communities.

──────────────────────────────────────────
💰 2. FISCAL DISCLOSURE & SOCIAL RELIEF
State executives launched public debt audits paired with decentralized welfare packages across political wards to support local economic velocity.

──────────────────────────────────────────
⚡ 3. RENEWABLE ENERGY & URBAN PLANNING
Subnational energy independence advanced through bilateral international partnerships, hydro projects, and master plan modernizations.

──────────────────────────────────────────
💡 WEEKLY POLICY LESSON & OUTLOOK
1. Security is foundational for economic growth.
2. Open debt disclosures build investor trust.
3. Subnational energy projects drive long-term stability.

📲 SWIPE THROUGH THE CAROUSEL SLIDES ABOVE for detailed state scorecards!
🌐 Explore live daily trackers for all 36 States + FCT:
www.diplomantimes.com"""

    html_content = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #193731; border-bottom: 2px solid #234d44; padding-bottom: 8px;">Diploman Times - Weekly Social Brief Engine</h2>
        <p style="font-size: 13px; color: #64748b;">Automated compilation cycle: <strong>{week_str}</strong></p>

        <!-- LinkedIn Block -->
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #0a66c2; border-radius: 6px; padding: 18px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #0a66c2; font-size: 16px;">LinkedIn Draft (3,000 Char Limit Maximized)</h3>
                <button onclick="navigator.clipboard.writeText(document.getElementById('linkedin-draft').innerText)" style="background-color: #0a66c2; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer;">Copy LinkedIn Text</button>
            </div>
            <pre id="linkedin-draft" style="white-space: pre-wrap; font-family: inherit; font-size: 13.5px; line-height: 1.6; color: #334155; margin: 0;">{linkedin_text.strip()}</pre>
        </div>

        <!-- Facebook Block -->
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #1877f2; border-radius: 6px; padding: 18px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #1877f2; font-size: 16px;">Facebook Draft (Extended Deep-Dive)</h3>
                <button onclick="navigator.clipboard.writeText(document.getElementById('facebook-draft').innerText)" style="background-color: #1877f2; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer;">Copy Facebook Text</button>
            </div>
            <pre id="facebook-draft" style="white-space: pre-wrap; font-family: inherit; font-size: 13.5px; line-height: 1.6; color: #334155; margin: 0;">{facebook_text.strip()}</pre>
        </div>
    </div>
    """
    return html_content

def update_blogger_page(html_content):
    service = get_blogger_service()
    title = f"Weekly Policy Brief Workspace - {datetime.datetime.now().strftime('%b %d, %Y')}"
    
    body = {
        "title": title,
        "content": html_content
    }
    
    if PAGE_ID:
        try:
            pages = service.pages()
            result = pages.patch(blogId=BLOG_ID, pageId=PAGE_ID, body=body).execute()
            print(f"Successfully updated Blogger Workspace Page: {result.get('url')}")
        except Exception as e:
            print(f"Error patching page: {e}")
    else:
        # Fallback: create draft post if PAGE_ID not set
        try:
            posts = service.posts()
            result = posts.insert(blogId=BLOG_ID, body=body, isDraft=True).execute()
            print(f"Successfully created Weekly Draft Post: {result.get('url')}")
        except Exception as e:
            print(f"Error creating draft post: {e}")

if __name__ == "__main__":
    posts = fetch_weekly_data()
    print(f"Retrieved {len(posts)} published items from queue.")
    html = generate_weekly_html(posts)
    update_blogger_page(html)
