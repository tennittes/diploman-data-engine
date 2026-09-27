import os
import requests
import json
import datetime

# Fetch credentials securely from GitHub Actions environment secrets
ACCESS_TOKEN = os.environ.get("LINKEDIN_ACCESS_TOKEN")
AUTHOR_URN = os.environ.get("LINKEDIN_AUTHOR_URN")

def sanitize_and_trim_commentary(text, max_length=2900):
    """
    Ensures the commentary strictly complies with LinkedIn's 3,000 character hard cap,
    leaving a safety buffer for URLs and tags.
    """
    if len(text) <= max_length:
        return text
    print(f"⚠️ Warning: Commentary length ({len(text)}) exceeds safe threshold. Trimming to fit LinkedIn constraints...")
    return text[:max_length - 3] + "..."

def upload_image_to_linkedin(image_path):
    """
    Optional: Uploads a local image file (e.g., front-page graphic or chart) to LinkedIn 
    and returns the media URN for post attachment.
    """
    if not os.path.exists(image_path):
        print(f"Image path not found: {image_path}. Publishing as text/link share.")
        return None

    init_url = "https://api.linkedin.com/rest/images?action=initializeUpload"
    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202607"
    }
    
    init_payload = {
        "initializeUploadRequest": {
            "owner": AUTHOR_URN
        }
    }

    response = requests.post(init_url, headers=headers, data=json.dumps(init_payload))
    if response.status_code != 200:
        print(f"Failed to initialize image upload: {response.status_code} - {response.text}")
        return None

    res_data = response.json().get("value", {})
    upload_url = res_data.get("uploadUrl")
    image_urn = res_data.get("image")

    # Upload the binary image file
    with open(image_path, "rb") as img_file:
        img_bytes = img_file.read()
    
    upload_headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/octet-stream"
    }
    
    upload_res = requests.put(upload_url, headers=upload_headers, data=img_bytes)
    if upload_res.status_code in [200, 201]:
        print(f"Successfully uploaded image asset: {image_urn}")
        return image_urn
    else:
        print(f"Failed to push binary image bytes: {upload_res.status_code}")
        return None

def post_to_linkedin(headline, summary, post_url, psi_score, state_name, image_path=None):
    if not ACCESS_TOKEN or not AUTHOR_URN:
        print("Error: LinkedIn credentials (Token or URN) are missing from environment variables.")
        return

    url = "https://api.linkedin.com/rest/posts"
    
    raw_commentary = (
        f"🚨 #DiplomanTimes | Sub-National Governance & Policy Briefing\n\n"
        f"📍 Jurisdiction: {state_name}\n"
        f"📊 Policy Signal Index (PSI): {psi_score}\n\n"
        f"{headline}\n\n"
        f"{summary}\n\n"
        f"🔗 Access full intelligence report: {post_url}"
    )

    # Enforce character limit safety
    safe_commentary = sanitize_and_trim_commentary(raw_commentary)

    payload = {
        "author": AUTHOR_URN,
        "commentary": safe_commentary,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": []
        },
        "lifecycleState": "PUBLISHED",
        "isCommentDisabled": False
    }

    # Attach image media if provided and successfully uploaded
    if image_path:
        media_urn = upload_image_to_linkedin(image_path)
        if media_urn:
            payload["content"] = {
                "media": {
                    "id": media_urn
                }
            }

    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202607"
    }

    print(f"Dispatching intelligence update for {state_name} to LinkedIn...")
    response = requests.post(url, headers=headers, data=json.dumps(payload))
    
    if response.status_code == 201:
        print("✅ Successfully published executive briefing to LinkedIn!")
    else:
        print(f"❌ Failed to post to LinkedIn: {response.status_code} - {response.text}")

if __name__ == "__main__":
    current_month_year = datetime.datetime.now().strftime("%B %Y")
    post_to_linkedin(
        headline=f"Macro Intelligence Terminal Update — {current_month_year}",
        summary="Reviewing sub-national fiscal performance, policy telemetry, and administrative execution indices across regional jurisdictions.",
        post_url="https://www.diplomantimes.com/",
        psi_score="3.8",
        state_name="Cross River",
        image_path=None  # Pass a local file path like "output/card.png" here if you want to attach an image graphic
    )
