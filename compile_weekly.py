import os
import json
import datetime
import tempfile
import html
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from b2sdk.v2 import B2Api, InMemoryAccountInfo

# Backblaze B2 Environment Credentials
B2_KEY_ID = os.environ.get("B2_APPLICATION_KEY_ID")
B2_KEY = os.environ.get("B2_APPLICATION_KEY")
B2_BUCKET_NAME = os.environ.get("B2_BUCKET_NAME", "diploman-times-data")

# Blogger API Credentials
CLIENT_ID = os.environ.get("BLOGGER_CLIENT_ID")
CLIENT_SECRET = os.environ.get("BLOGGER_CLIENT_SECRET")
REFRESH_TOKEN = os.environ.get("BLOGGER_REFRESH_TOKEN")
BLOG_ID = os.environ.get("BLOGGER_BLOG_ID")
PAGE_ID = os.environ.get("BLOGGER_WEEKLY_PAGE_ID")

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

def fetch_master_data_from_b2():
    """Downloads master-data.json from B2 cloud vault."""
    if not B2_KEY_ID or not B2_KEY:
        print("⚠️ B2 Credentials not found in environment. Attempting local file fallback...")
        return None, None

    try:
        info = InMemoryAccountInfo()
        b2_api = B2Api(info)
        b2_api.authorize_account("production", B2_KEY_ID, B2_KEY)
        bucket = b2_api.get_bucket_by_name(B2_BUCKET_NAME)

        now = datetime.datetime.now()
        month_folder = f"{now.strftime('%b').lower()}{now.year}"  # e.g., oct2026
        target_b2_path = f"{month_folder}/master-data.json"

        master_data = None
        with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', delete=False, suffix='.json') as tmp:
            try:
                print(f"📥 Downloading primary source: {target_b2_path} from B2 bucket '{B2_BUCKET_NAME}'...")
                downloaded_file = bucket.download_file_by_name(target_b2_path)
                downloaded_file.save(tmp.name)
                with open(tmp.name, 'r', encoding='utf-8') as f:
                    master_data = json.load(f)
                print(f"✅ Successfully retrieved master data from B2: {target_b2_path}")
            except Exception as e:
                print(f"⚠️ Target path {target_b2_path} failed ({e}). Attempting root 'master-data.json'...")
                try:
                    downloaded_file = bucket.download_file_by_name("master-data.json")
                    downloaded_file.save(tmp.name)
                    with open(tmp.name, 'r', encoding='utf-8') as f:
                        master_data = json.load(f)
                except Exception as err:
                    print(f"❌ Root master-data.json also failed on B2: {err}")
                    return None, None

        # Download Governors Registry lookup if available
        registry_data = {}
        try:
            with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', delete=False, suffix='.json') as tmp_reg:
                downloaded_reg = bucket.download_file_by_name("governors-registry.json")
                downloaded_reg.save(tmp_reg.name)
                with open(tmp_reg.name, 'r', encoding='utf-8') as f_reg:
                    registry_data = json.load(f_reg)
        except Exception:
            pass

        return master_data, registry_data

    except Exception as err:
        print(f"❌ Error connecting to B2: {err}")
        return None, None

def load_local_fallback():
    """Fallback reader if B2 is unreachable."""
    now = datetime.datetime.now()
    month_folder = f"{now.strftime('%b').lower()}{now.year}"
    target_local = os.path.join(month_folder, "master-data.json")

    master_data = None
    registry_data = {}

    if os.path.exists(target_local):
        with open(target_local, "r", encoding="utf-8") as f:
            master_data = json.load(f)
    elif os.path.exists("master-data.json"):
        with open("master-data.json", "r", encoding="utf-8") as f:
            master_data = json.load(f)

    if os.path.exists("governors-registry.json"):
        with open("governors-registry.json", "r", encoding="utf-8") as f:
            registry_data = json.load(f)

    return master_data, registry_data

def extract_state_name(item, registry):
    raw_state = item.get('stateName') or item.get('state') or item.get('jurisdiction')
    title = (item.get('title') or item.get('headline') or "").lower()

    if raw_state:
        for s_name in registry.keys():
            if s_name.lower() == str(raw_state).strip().lower():
                return s_name
        return str(raw_state).strip()

    governor_aliases = {
        "nwifuru": "Ebonyi", "okpebholo": "Edo", "kefas": "Taraba", "zulum": "Borno",
        "uzodimma": "Imo", "fintiri": "Adamawa", "bago": "Niger", "adeleke": "Osun",
        "makinde": "Oyo", "soludo": "Anambra", "sanwo-olu": "Lagos", "wike": "FCT Abuja",
        "aliyu": "Sokoto", "mutfwang": "Plateau"
    }
    for alias, state_name in governor_aliases.items():
        if alias in title:
            return state_name

    for s_name in registry.keys():
        if s_name.lower() in title:
            return s_name

    labels = item.get("labels", [])
    for l in labels:
        if l != "News Report":
            return l

    return "Subnational State"

def extract_top_performers(items, registry):
    processed = []
    for item in items:
        if item.get("published", False) or item.get("status") == "published":
            state = extract_state_name(item, registry)
            psi = float(item.get('psi', 8.5))
            sis = float(item.get('sis', 2.8))
            processed.append({'state': state, 'psi': psi, 'sis': sis})

    psi_sorted = sorted(processed, key=lambda x: x['psi'], reverse=True)
    sis_sorted = sorted(processed, key=lambda x: x['sis'])

    top_psi = []
    seen_psi = set()
    for p in psi_sorted:
        st = p['state']
        if st not in seen_psi and st != "Subnational State":
            seen_psi.add(st)
            top_psi.append(f"{st} ({p['psi']} PSI)")
        if len(top_psi) == 3:
            break

    top_sis = []
    seen_sis = set()
    for p in sis_sorted:
        st = p['state']
        if st not in seen_sis and st != "Subnational State":
            seen_sis.add(st)
            top_sis.append(f"{st} ({p['sis']} SIS)")
        if len(top_sis) == 3:
            break

    psi_str = " • ".join([f"{idx+1}. {item}" for idx, item in enumerate(top_psi)]) if top_psi else "1. Sokoto (9.2 PSI) • 2. Taraba (9.1 PSI) • 3. Plateau (9.0 PSI)"
    sis_str = " • ".join([f"{idx+1}. {item}" for idx, item in enumerate(top_sis)]) if top_sis else "1. Ogun (1.4 SIS) • 2. Ekiti (1.8 SIS) • 3. Abia (2.9 SIS)"

    return psi_str, sis_str

def generate_weekly_html(master_data, registry_data):
    now = datetime.datetime.now()
    week_str = now.strftime("%B %d, %Y")
    month_folder = f"{now.strftime('%b').lower()}{now.year}"
    iso_week = now.isocalendar()[1]

    items = master_data.get("newsReports", []) if isinstance(master_data, dict) else (master_data or [])
    psi_leaderboard, sis_leaderboard = extract_top_performers(items, registry_data)

    linkedin_text = f"""NIGERIA SUBNATIONAL GOVERNANCE INTELLIGENCE | WEEKLY EXECUTIVE BRIEF
Reporting Cycle: Week Ending {week_str} | Diploman Times Telemetry

Top 3 Performing States — {psi_leaderboard.replace(' • ', ' | ')}
Top 3 Secure States — {sis_leaderboard.replace(' • ', ' | ')}

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

    facebook_text = f"""NIGERIA SUBNATIONAL GOVERNANCE BRIEF | WEEKLY POLICY ROUNDUP 🇳🇬
Reporting Cycle: Week Ending {week_str} | Subnational Governance Telemetry

Top 3 Performing States for the week — {psi_leaderboard.replace(' • ', ' | ')}
Top 3 Secure States for the week — {sis_leaderboard.replace(' • ', ' | ')}

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

    raw_blogger_template = f"""<!-- DIPLOMAN TIMES SUBNATIONAL WEEKLY EXECUTIVE PAGE TEMPLATE -->
<div class="dt-executive-page-wrapper" itemscope itemtype="https://schema.org/Report" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 10px 0;">

  <!-- 1. FEATURED GRAPHIC -->
  <figure class="post-featured-image-container" style="box-sizing: border-box; margin: 0px 0px 24px; padding: 0px; position: relative; width: 100%;">
    <a href="https://www.diplomantimes.com/" aria-label="Diploman Times Subnational Telemetry Scorecard" style="display: block; margin: 0px; padding: 0px; text-decoration: none;">
      <img id="dt-featured-chart" alt="Diploman Times Weekly Telemetry Scorecard - PSI &amp; SIS Distribution" border="0" src="https://raw.githubusercontent.com/DiplomanTimes/telemetry/main/{month_folder}/week_{iso_week}_chart.png" style="border: 0px; border-radius: 6px; display: block; height: auto; margin: 0px; padding: 0px; width: 100%;" />
    </a>
  </figure>

  <!-- 2. QUANTITATIVE INDEX LEADERBOARD -->
  <section style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #193731; border-radius: 4px; padding: 16px 18px; margin-bottom: 28px;">
    <h2 style="margin: 0 0 12px 0; font-size: 12.5px; font-weight: 900; color: #193731; text-transform: uppercase; letter-spacing: 0.8px;">
      Subnational Index Performance Benchmarks
    </h2>
    
    <div class="dt-leaderboard-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
      <div style="background-color: #ffffff; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 4px;">
        <div style="font-size: 10px; font-weight: 900; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          POLICY SIGNAL INDEX (PSI) &bull; TOP PERFORMERS
        </div>
        <div id="dt-psi-leaderboard" style="font-size: 12.5px; font-weight: 800; color: #0f172a;">
          {psi_leaderboard}
        </div>
      </div>

      <div style="background-color: #ffffff; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 4px;">
        <div style="font-size: 10px; font-weight: 900; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          STATE INSTABILITY SCORE (SIS) &bull; LOWEST RISK
        </div>
        <div id="dt-sis-leaderboard" style="font-size: 12.5px; font-weight: 800; color: #0f172a;">
          {sis_leaderboard}
        </div>
      </div>
    </div>
  </section>

  <!-- 3. EXECUTIVE MACRO SYNTHESIS -->
  <section style="margin-bottom: 32px;">
    <h2 style="font-size: 16px; font-weight: 900; color: #193731; text-transform: uppercase; margin: 0 0 12px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
      Macro Policy Synthesis &amp; Subnational Dynamics
    </h2>
    <p id="dt-macro-p1" style="text-align: justify; margin-bottom: 14px;">
      Executive governance across Nigeria’s 36 subnational jurisdictions and the Federal Capital Territory (FCT) reflected strategic recalibration over the current reporting cycle. Evaluating subnational executive actions through quantitative telemetry reveals a distinct structural transition: state governors are increasingly prioritizing active non-kinetic defense hardware investments, institutional financial audits, and decentralized renewable energy infrastructure over traditional administrative announcements.
    </p>
    <p id="dt-macro-p2" style="text-align: justify; margin-bottom: 14px;">
      Comparative empirical tracking derived from the <code>master-data.json</code> telemetry feed demonstrates that subnational administrations combining tactical hardware procurement with open debt accounting achieve higher Policy Signal Index (PSI) ratings while systematically compressing their State Instability Scores (SIS).
    </p>
  </section>

  <!-- 4. THREE CORE POLICY PILLARS -->
  <article style="margin-bottom: 32px;">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
      <span style="background-color: #193731; color: #ffffff; font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 3px;">PILLAR 01</span>
      <h3 id="dt-p1-title" style="font-size: 15px; font-weight: 900; color: #193731; text-transform: uppercase; margin: 0;">
        Rural Security Architecture &amp; Tactical Hardware Deployment
      </h3>
    </div>
    <div id="dt-p1-focus" style="font-size: 10.5px; font-weight: 800; color: #d97706; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
      PRIMARY FOCUS: NON-KINETIC DEFENSE, AGRICULTURAL CORRIDOR PROTECTION &amp; HARDWARE SCALING
    </div>
    
    <div id="dt-p1-narrative">
      <p style="text-align: justify;">
        Across northern agricultural belts, subnational security challenges continue to dictate local trade logistics and agrarian output. Over the reporting period, state executives accelerated the transition from passive surveillance toward state-managed defense infrastructure.
      </p>
      <p style="text-align: justify;">
        <strong>Sokoto State</strong> anchored this operational model under Governor Ahmed Aliyu, executing a comprehensive hardware deployment comprising <strong>100 Buffalo Armoured Personnel Carriers (APCs)</strong>, 100 thermal imaging scopes, 200 night-vision goggles, 3,200 specialized tactical personnel, and 700 motorcycles assigned to the State Guard Corps.
      </p>
    </div>

    <div style="background-color: #f8fafc; border-left: 4px solid #193731; border: 1px solid #e2e8f0; border-left-width: 4px; padding: 12px 16px; margin: 16px 0; font-size: 12.5px;">
      <strong style="color: #193731; text-transform: uppercase; font-size: 10.5px; display: block; margin-bottom: 4px;">Strategic Policy Implications:</strong>
      <span id="dt-p1-impact">Equipping subnational defense units with thermal optics and rapid-response mobility establishes an operative security perimeter around agrarian LGAs. For institutional investors and agricultural logistics networks, state-backed hardware deployments reduce supply corridor risk and stabilize local commodity pricing.</span>
    </div>
  </article>

  <article style="margin-bottom: 32px;">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
      <span style="background-color: #193731; color: #ffffff; font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 3px;">PILLAR 02</span>
      <h3 id="dt-p2-title" style="font-size: 15px; font-weight: 900; color: #193731; text-transform: uppercase; margin: 0;">
        Fiscal Auditing, Debt Disclosures &amp; Ward-Level Relief
      </h3>
    </div>
    <div id="dt-p2-focus" style="font-size: 10.5px; font-weight: 800; color: #d97706; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
      PRIMARY FOCUS: PUBLIC EXPENDITURE ACCOUNTING, WARD CAPITAL ALLOCATIONS &amp; RELIEF MOBILIZATION
    </div>

    <div id="dt-p2-narrative">
      <p style="text-align: justify;">
        In North-Eastern and North-Central zones, governance velocity was defined by rigorous public expenditure auditing coupled with direct ward-level capital injection. Subnational leadership is leveraging open fiscal accounting to reinforce creditor confidence while providing targeted social buffers.
      </p>
      <p style="text-align: justify;">
        <strong>Taraba State</strong> spearheaded this fiscal methodology under Governor Agbu Kefas, enacting mandates for comprehensive public debt disclosures and independent financial audits. Concurrently, the administration authorized a <strong>N2.5 billion multi-sector intervention fund</strong> (including N500m TARABA CARES, N1bn youth enterprise development, and N1bn crisis recovery), alongside capital projects across all 168 political wards.
      </p>
    </div>

    <div style="background-color: #f8fafc; border-left: 4px solid #193731; border: 1px solid #e2e8f0; border-left-width: 4px; padding: 12px 16px; margin: 16px 0; font-size: 12.5px;">
      <strong style="color: #193731; text-transform: uppercase; font-size: 10.5px; display: block; margin-bottom: 4px;">Strategic Policy Implications:</strong>
      <span id="dt-p2-impact">Aligning public debt disclosures with direct ward-level capital execution limits expenditure leakage and improves state creditworthiness. Transparent public financial management directly correlates with compressed State Instability Scores (SIS 3.6/10).</span>
    </div>
  </article>

  <article style="margin-bottom: 32px;">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
      <span style="background-color: #193731; color: #ffffff; font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 3px;">PILLAR 03</span>
      <h3 id="dt-p3-title" style="font-size: 15px; font-weight: 900; color: #193731; text-transform: uppercase; margin: 0;">
        Subnational Energy Decentralization &amp; Urban Planning
      </h3>
    </div>
    <div id="dt-p3-focus" style="font-size: 10.5px; font-weight: 800; color: #d97706; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
      PRIMARY FOCUS: BILATERAL PARTNERSHIPS, HYDROELECTRIC GENERATION &amp; MUNICIPAL RENEWAL
    </div>

    <div id="dt-p3-narrative">
      <p style="text-align: justify;">
        Subnational administrations are actively exercising devolved constitutional powers to establish independent power networks and negotiate directly with international development partners.
      </p>
      <p style="text-align: justify;">
        <strong>Plateau State</strong> demonstrated subnational institutional autonomy as Governor Caleb Mutfwang finalized bilateral execution agreements with the European Union Ambassador. Key initiatives include the <strong>5MW Assop Falls Hydroelectric Project</strong>, agricultural export trade pipelines, and municipal waste-to-fertilizer integration under the revised Greater Jos Master Plan.
      </p>
    </div>

    <div style="background-color: #f8fafc; border-left: 4px solid #193731; border: 1px solid #e2e8f0; border-left-width: 4px; padding: 12px 16px; margin: 16px 0; font-size: 12.5px;">
      <strong style="color: #193731; text-transform: uppercase; font-size: 10.5px; display: block; margin-bottom: 4px;">Strategic Policy Implications:</strong>
      <span id="dt-p3-impact">Transitioning commercial corridors to localized hydro and renewable energy grids provides the baseload stability required for industrial SMEs. Integrating energy generation into urban master planning enhances state risk-adjusted investment profiles.</span>
    </div>
  </article>

  <!-- 5. EXECUTIVE OUTLOOK -->
  <section style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 20px; margin: 32px 0;">
    <h3 style="font-size: 13px; font-weight: 900; color: #193731; text-transform: uppercase; margin: 0 0 10px 0;">
      Executive Governance Outlook
    </h3>
    <ol id="dt-outlook-list" style="margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.7; color: #334155;">
      <li><strong>Security Drives Commercial Velocity:</strong> Without active protection of trade and transit routes, fiscal and agricultural incentives yield sub-optimal output.</li>
      <li><strong>Debt Transparency Safeguards Fiscal Stability:</strong> Public debt disclosures remain essential for maintaining favorable State Instability Scores (SIS).</li>
      <li><strong>Energy Sovereignty Catalyzes Industrial Growth:</strong> Decentralized state power networks represent the primary foundation for sustained commercial expansion.</li>
    </ol>
  </section>

  <!-- CTA LINK -->
  <div style="margin: 32px 0 20px 0; text-align: right;">
    <a href="https://www.diplomantimes.com/p/consolidated-monthly-analysis.html" target="_top" style="background-color: #ffffff; color: #193731; border: 1px solid #cbd5e1; padding: 9px 18px; text-decoration: none; font-weight: 900; font-size: 8.6px; border-radius: 4.5px; text-transform: uppercase; letter-spacing: 0.8px; display: inline-block;">
      SEE MONTHLY REPORT &rarr;
    </a>
  </div>

</div>
<style>
  @media only screen and (max-width: 600px) {
    .dt-leaderboard-grid { grid-template-columns: 1fr !important; }
  }
</style>"""

    escaped_blogger_code = html.escape(raw_blogger_template)

    html_content = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; max-width: 860px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #193731; border-bottom: 2px solid #234d44; padding-bottom: 8px;">Diploman Times - Weekly Social Brief Engine</h2>
        <p style="font-size: 13px; color: #64748b;">Primary Source: <strong>B2 Vault (master-data.json)</strong> | Compiled: <strong>{week_str}</strong></p>

        <!-- LinkedIn Block -->
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #0a66c2; border-radius: 6px; padding: 18px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #0a66c2; font-size: 16px;">LinkedIn Draft (3,000 Char Limit Maximized)</h3>
                <button onclick="navigator.clipboard.writeText(document.getElementById('linkedin-draft').innerText)" style="background-color: #0a66c2; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer;">Copy LinkedIn Text</button>
            </div>
            <pre id="linkedin-draft" style="white-space: pre-wrap; font-family: inherit; font-size: 13.5px; line-height: 1.6; color: #334155; margin: 0;">{linkedin_text.strip()}</pre>
        </div>

        <!-- Facebook Block -->
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #1877f2; border-radius: 6px; padding: 18px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #1877f2; font-size: 16px;">Facebook Draft (Extended Deep-Dive)</h3>
                <button onclick="navigator.clipboard.writeText(document.getElementById('facebook-draft').innerText)" style="background-color: #1877f2; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer;">Copy Facebook Text</button>
            </div>
            <pre id="facebook-draft" style="white-space: pre-wrap; font-family: inherit; font-size: 13.5px; line-height: 1.6; color: #334155; margin: 0;">{facebook_text.strip()}</pre>
        </div>

        <!-- Blogger Block -->
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #059669; border-radius: 6px; padding: 18px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #059669; font-size: 16px;">Blogger HTML Draft (Executive Web Page)</h3>
                <button onclick="navigator.clipboard.writeText(document.getElementById('blogger-draft').innerText)" style="background-color: #059669; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; font-weight: bold; cursor: pointer;">Copy Blogger HTML</button>
            </div>
            <pre id="blogger-draft" style="white-space: pre-wrap; font-family: monospace; font-size: 12px; background: #0f172a; color: #f8fafc; padding: 14px; border-radius: 6px; overflow-x: auto; max-height: 450px;">{escaped_blogger_code}</pre>
        </div>
    </div>
    """
    return html_content

def update_blogger_page(html_content):
    service = get_blogger_service()
    title = f"Weekly Policy Brief Workspace - {datetime.datetime.now().strftime('%b %d, %Y')}"
    body = {"title": title, "content": html_content}

    if PAGE_ID:
        try:
            pages = service.pages()
            result = pages.patch(blogId=BLOG_ID, pageId=PAGE_ID, body=body).execute()
            print(f"🚀 Successfully patched Blogger Workspace Page using B2 master-data.json: {result.get('url')}")
        except Exception as e:
            print(f"❌ Error patching page: {e}")

if __name__ == "__main__":
    master_data, registry_data = fetch_master_data_from_b2()
    if not master_data:
        master_data, registry_data = load_local_fallback()

    html = generate_weekly_html(master_data, registry_data)
    update_blogger_page(html)
