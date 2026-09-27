import os
import requests
import json

# LinkedIn Credentials
LINKEDIN_TOKEN = os.environ.get("LINKEDIN_ACCESS_TOKEN")
LINKEDIN_URN = os.environ.get("LINKEDIN_AUTHOR_URN")

# Facebook Credentials
FB_TOKEN = os.environ.get("FACEBOOK_PAGE_ACCESS_TOKEN")
FB_PAGE_ID = os.environ.get("FACEBOOK_PAGE_ID")

def sanitize_and_trim(text, max_length=2900):
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + "..."

# ==================== LINKEDIN FUNCTIONS ====================
def post_to_linkedin(editorial_data):
    if not LINKEDIN_TOKEN or not LINKEDIN_URN:
        print("Skipping LinkedIn: Credentials missing.")
        return

    url = "https://api.linkedin.com/rest/posts"
    body_text = sanitize_and_trim(editorial_data["body"])
    comment_pointer = editorial_data.get("comment_pointer", "")

    payload = {
        "author": LINKEDIN_URN,
        "commentary": body_text,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": []
        },
        "lifecycleState": "PUBLISHED"
    }

    headers = {
        "Authorization": f"Bearer {LINKEDIN_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202607"
    }

    print(f"Publishing LinkedIn Editorial: {editorial_data.get('title')}...")
    response = requests.post(url, headers=headers, data=json.dumps(payload))
    
    if response.status_code == 201:
        print("Successfully published primary post to LinkedIn.")
        if comment_pointer:
            post_id = response.headers.get("x-restli-id")
            if post_id:
                add_linkedin_comment(post_id, comment_pointer)
    else:
        print(f"Failed to post to LinkedIn: {response.status_code} - {response.text}")

def add_linkedin_comment(post_urn, comment_text):
    comments_url = "https://api.linkedin.com/rest/comments"
    comment_payload = {
        "actor": LINKEDIN_URN,
        "object": post_urn,
        "message": {"text": comment_text}
    }
    headers = {
        "Authorization": f"Bearer {LINKEDIN_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202607"
    }
    res = requests.post(comments_url, headers=headers, data=json.dumps(comment_payload))
    if res.status_code == 201:
        print("Successfully attached LinkedIn comment pointer.")
    else:
        print(f"Could not attach LinkedIn comment pointer: {res.status_code} - {res.text}")

# ==================== FACEBOOK FUNCTIONS ====================
def post_to_facebook(editorial_data):
    if not FB_TOKEN or not FB_PAGE_ID:
        print("Skipping Facebook: Credentials missing.")
        return

    url = f"https://graph.facebook.com/v25.0/{FB_PAGE_ID}/feed"
    body_text = editorial_data["body"]
    comment_pointer = editorial_data.get("comment_pointer", "")

    payload = {
        "message": body_text,
        "access_token": FB_TOKEN
    }

    print(f"Publishing Facebook Editorial: {editorial_data.get('title')}...")
    response = requests.post(url, data=payload)
    
    if response.status_code == 200:
        res_data = response.json()
        print("Successfully published primary post to Facebook.")
        if comment_pointer:
            post_id = res_data.get("id")
            if post_id:
                add_facebook_comment(post_id, comment_pointer)
    else:
        print(f"Failed to post to Facebook: {response.status_code} - {response.text}")

def add_facebook_comment(post_id, comment_text):
    comments_url = f"https://graph.facebook.com/v25.0/{post_id}/comments"
    comment_payload = {
        "message": comment_text,
        "access_token": FB_TOKEN
    }
    res = requests.post(comments_url, data=comment_payload)
    if res.status_code == 200:
        print("Successfully attached Facebook comment pointer.")
    else:
        print(f"Could not attach Facebook comment pointer: {res.status_code} - {res.text}")

# ==================== MAIN EXECUTION ====================
if __name__ == "__main__":
    if os.path.exists("social-queue.json"):
        with open("social-queue.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            
        platforms = data.get("platforms", {})
        
        # 1. Process LinkedIn Editorials
        linkedin_posts = platforms.get("linkedin", {})
        for key, editorial in linkedin_posts.items():
            post_to_linkedin(editorial)
            
        # 2. Process Facebook Editorials
        facebook_posts = platforms.get("facebook", {})
        for key, editorial in facebook_posts.items():
            post_to_facebook(editorial)
            
    else:
        print("social-queue.json file not found.")
