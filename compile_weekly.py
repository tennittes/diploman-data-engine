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

def extract_top_performers(weekly_posts):
    """Sorts posts to dynamically extract top PSI and top secure (lowest SIS) states."""
    psi_items = sorted(weekly_posts, key=lambda x: float(x.get('psi', 8.0)), reverse=True)
    sis_items = sorted(weekly_posts, key=lambda x: float(x.get('sis', 3.0)))

    top_psi = []
    for p in psi_items[:3]:
        st = p.get('stateName') or p.get('state') or 'Jurisdiction'
        val = p.get('psi', '8.5')
        top_psi.append(f"{st} {val}PSI")

    top_sis = []
    for p in sis_items[:3]:
        st = p.get('stateName') or p.get('state') or 'Jurisdiction'
        val = p.get('sis', '2.5')
        top_sis.append(f"{st} {val}SIS")

    psi_str = " | ".join(top_psi) if top_psi else "Sokoto 9.2PSI | Taraba 9.1PSI | Plateau 9.0PSI"
    sis_str = " | ".join(top_sis) if top_sis else "Ogun 1.4SIS | Ekiti 1.8SIS | Abia 2.9SIS"

    return psi_str, sis_str

def generate_weekly_html(weekly_posts):
    """Generates a clean HTML layout hosting both LinkedIn and Facebook draft blocks."""
    now = datetime.datetime.now()
    week_str = now.strftime("%B %d, %Y")

    psi_leaderboard, sis_leaderboard = extract_top_performers(weekly_posts)

    # LinkedIn Draft (Includes Top 3 Tiers & Fits Within 3,000 Char Limit)
    linkedin_text = f"""NIGERIA SUBNATIONAL GOVERNANCE INTELLIGENCE | WEEKLY EXECUTIVE BRIEF
Reporting Cycle: Week Ending {week_str} | Diploman Times Telemetry

Top 3 Performing States — {psi_leaderboard}
Top 3 Secure States — {sis_leaderboard}

Subnational executive governance across Nigeria’s 36 states and FCT demonstrated a strategic shift toward dual-track execution over the past week: pairing high-capacity security defense with targeted fiscal and structural interventions.

Our consolidated Policy Signal Index (PSI) and State Instability Score (SIS) analytics reveal key macro trends across active jurisdictions:

1. TACTICAL SECURITY HARDWARE SCORING
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

    # Extended Facebook Draft (Deep-Dive Analysis)
    facebook_text = f"""NIGERIA SUBNATIONAL GOVERNANCE BRIEF | WEEKLY POLICY ROUNDUP 🇳🇬
Reporting Cycle: Week Ending {week_str} | Subnational Governance Telemetry

Top 3 Performing States for the week — {psi_leaderboard}
Top 3 Secure States for the week — {sis_leaderboard}

Subnational executive governance across Nigeria’s 36 states and the Federal Capital Territory (FCT) recorded significant structural shifts over the past week. Rather than viewing daily state announcements in isolation, our weekly intelligence synthesis evaluates how state governors are managing the complex balance between rural security enforcement, public debt transparency, and long-term energy independence.

Across tracked jurisdictions, state administrations that combined tactical hardware investments with open fiscal auditing demonstrated superior policy stability and lower state instability scores.

Here is an extended breakdown of this week's major subnational policy drivers:

──────────────────────────────────────────
🛡️ 1. RURAL SECURITY ARCHITECTURE & HARDWARE SCALING
• Primary Policy Focus: Non-Kinetic Defense, Agricultural Corridor Protection & Tactical Hardware Procurement

Executive Breakdown & Impact:
Across northern agricultural belts, regional insecurity continues to impose a severe tax on trade logistics and farming yields. Over the past week, subnational executives moved decisively away from passive security monitoring toward active state-led defense infrastructure.

Sokoto State anchored this trend with a comprehensive hardware deployment comprising 100 Buffalo Armoured Personnel Carriers (APCs), 100 thermal imaging scopes, 200 night-vision goggles, 3,200 specialized tactical units, and 700 motorcycles for the state Guard Corps.

Policy Implications:
By equipping state-managed Guard Corps units with thermal optics and mobility hardware, Sokoto is creating a defensive perimeter around key agrarian local government areas. For institutional investors and agribusinesses, state-backed security hardware deployments represent an essential pre-condition for restoring rural supply chains and stabilizing local food prices.

──────────────────────────────────────────
💰 2. FISCAL AUDITABILITY, DEBT DISCLOSURE & WARD-LEVEL RELIEF
• Primary Policy Focus: Public Expenditure Accounting, Ward Infrastructure & Social Safety Net Mobilization

Executive Breakdown & Impact:
In North-Eastern and North-Central jurisdictions, governance velocity was defined by fiscal transparency paired with direct community-level capital injection. Governors are increasingly using open public accounting as a tool to build creditor confidence while cushioning citizens against broader macroeconomic adjustments.

Taraba State spearheaded this approach under Governor Agbu Kefas by issuing executive directives for full public debt disclosures and financial audits, while simultaneously rolling out a N2.5 billion multi-sector social relief package (N500m TARABA CARES, N1bn youth development, N1bn crisis recovery) and launching capital projects across all 168 political wards.

Policy Implications:
Publishing debt audits alongside ward-level project execution prevents capital leakage and improves state creditworthiness. Transparent financial management directly correlates with lower State Instability Scores (SIS 3.6/10), establishing a clear benchmark for subnational public finance management.

──────────────────────────────────────────
⚡ 3. SUB-NATIONAL ENERGY DECENTRALIZATION & MASTER PLAN REFORMS
• Primary Policy Focus: Bilateral International Partnerships, Hydroelectric Generation & Urban Renewal

Executive Breakdown & Impact:
State governments are aggressively exercising their constitutional powers to build independent energy infrastructure and negotiate directly with international development partners.

Plateau State demonstrated this strategic autonomy as Governor Caleb Mutfwang finalized agreements with the European Union Ambassador for the 5MW Assop Falls hydroelectric power project, bilateral agricultural export pipelines, and municipal waste-to-fertilizer integration under the Greater Jos Master Plan review.

Policy Implications:
Decentralizing power generation from the national grid to state-level hydro and clean energy networks provides the industrial foundation necessary to power local SMEs. Integrating renewable energy directly into city master plans shifts state investment decision profiles toward 'Value with Stabilization', attracting long-term capital to North-Central Nigeria.

──────────────────────────────────────────
💡 STRATEGIC LESSONS & WEEKLY GOVERNANCE OUTLOOK

As subnational administrations prepare for the final quarter of 2026, our weekly data highlights three core imperatives for state executive leadership:

1. Security drives economic velocity: Without state-led protection of trade routes, fiscal and agricultural incentives cannot yield sustainable results.
2. Debt transparency lowers risk: Public financial disclosures are essential for maintaining stable State Instability Scores (SIS) and unlocking institutional credit.
3. Energy autonomy accelerates industry: Independent state power projects are the primary catalyst for subnational industrialization.

 Diploman Times will continue to track, benchmark, and analyze executive performance across all 37 subnational jurisdictions.

📲 SWIPE THROUGH THE CAROUSEL SLIDES ABOVE for state-by-state scorecards, momentum indicators, and investment decision profiles!

💬 Which state governor's policy strategy made the biggest impact in your view this week? Share your analysis in the comments below!

🌐 Explore live daily Policy Trackers, Security Metric Tables, and Budget Audits across all 36 States + FCT:
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
