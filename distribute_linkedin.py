import os
import requests
import json
import datetime

# Fetch credentials securely from GitHub Actions environment secrets
ACCESS_TOKEN = os.environ.get("LINKEDIN_ACCESS_TOKEN")
AUTHOR_URN = os.environ.get("LINKEDIN_AUTHOR_URN")

def post_to_linkedin(headline, summary, post_url, psi_score, state_name):
    if not ACCESS_TOKEN or not AUTHOR_URN:
        print("Error: LinkedIn credentials (Token or URN) are missing from environment variables.")
        return

    url = "https://api.linkedin.com/rest/posts"
    
    # Constructing the executive intelligence briefing post for Diploman Times
    commentary_text = (
        f"🚨 #DiplomanTimes | Sub-National Governance & Policy Briefing\n\n"
        f"📍 Jurisdiction: {state_name}\n"
        f"📊 Policy Signal Index (PSI): {psi_score}\n\n"
        f"{headline}\n\n"
        f"{summary}\n\n"
        f"🔗 Access full intelligence report: {post_url}"
    )

    payload = {
        "author": AUTHOR_URN,
        "commentary": commentary_text,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": []
        },
        "lifecycleState": "PUBLISHED",
        "isCommentDisabled": False
    }

    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202607"  # Current LinkedIn API release version header
    }

    print(f"Dispatching intelligence update for {state_name} to LinkedIn...")
    response = requests.post(url, headers=headers, data=json.dumps(payload))
    
    if response.status_code == 201:
        print("✅ Successfully published executive briefing to LinkedIn!")
    else:
        print(f"❌ Failed to post to LinkedIn: {response.status_code} - {response.text}")

if __name__ == "__main__":
    # Test execution payload (You can later hook this to pull dynamically from your master-data.json)
    current_month_year = datetime.datetime.now().strftime("%B %Y")
    post_to_linkedin(
        headline=f"Macro Intelligence Terminal Update — {current_month_year}",
        summary="Reviewing sub-national fiscal performance, policy telemetry, and administrative execution indices across regional jurisdictions.",
        post_url="https://www.diplomantimes.com/",
        psi_score="3.8",
        state_name="Cross River"
    )
