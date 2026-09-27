import os
import requests
import json

ACCESS_TOKEN = os.environ.get("LINKEDIN_ACCESS_TOKEN")
AUTHOR_URN = os.environ.get("LINKEDIN_AUTHOR_URN")

def sanitize_and_trim(text, max_length=2900):
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + "..."

def post_to_linkedin(editorial_data):
    if not ACCESS_TOKEN or not AUTHOR_URN:
        print("Error: LinkedIn credentials missing from environment.")
        return

    url = "https://api.linkedin.com/rest/posts"
    
    body_text = sanitize_and_trim(editorial_data["body"])
    comment_pointer = editorial_data.get("comment_pointer", "")

    payload = {
        "author": AUTHOR_URN,
        "commentary": body_text,
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
        "LinkedIn-Version": "202607"
    }

    print(f"Publishing LinkedIn Editorial: {editorial_data.get('title')}...")
    response = requests.post(url, headers=headers, data=json.dumps(payload))
    
    if response.status_code == 201:
        print("Successfully published primary post to LinkedIn.")
        
        # If a comment pointer exists, post it as a comment reply
        if comment_pointer:
            post_id = response.headers.get("x-restli-id")
            if post_id:
                add_comment_reply(post_id, comment_pointer)
    else:
        print(f"Failed to post to LinkedIn: {response.status_code} - {response.text}")

def add_comment_reply(post_urn, comment_text):
    comments_url = "https://api.linkedin.com/rest/comments"
    comment_payload = {
        "actor": AUTHOR_URN,
        "object": post_urn,
        "message": {
            "text": comment_text
        }
    }
    res = requests.post(comments_url, headers=headers_with_auth(), data=json.dumps(comment_payload))
    if res.status_code == 201:
        print("Successfully attached visual/video comment pointer.")
    else:
        print(f"Could not attach comment pointer: {res.status_code}")

def headers_with_auth():
    return {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202607"
    }

if __name__ == "__main__":
    if os.path.exists("social-queue.json"):
        with open("social-queue.json", "r", encoding="utf-8") as f:
            data = json.load(f)
            
        linkedin_posts = data.get("platforms", {}).get("linkedin", {})
        
        # Publish both LinkedIn editorials sequentially
        for key, editorial in linkedin_posts.items():
            post_to_linkedin(editorial)
    else:
        print("social-queue.json file not found.")
