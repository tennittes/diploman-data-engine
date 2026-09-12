import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Load credentials from GitHub Secrets (environment variables)
CLIENT_ID = os.environ.get("BLOGGER_CLIENT_ID")
CLIENT_SECRET = os.environ.get("BLOGGER_CLIENT_SECRET")
REFRESH_TOKEN = os.environ.get("BLOGGER_REFRESH_TOKEN")
BLOG_ID = os.environ.get("BLOGGER_BLOG_ID")

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

def create_post(title, content):
    service = get_blogger_service()
    body = {
        "kind": "blogger#post",
        "title": title,
        "content": content
    }
    posts = service.posts()
    result = posts.insert(blogId=BLOG_ID, body=body).execute()
    print(f"Successfully published post! Post URL: {result.get('url')}")

if __name__ == "__main__":
    # Test post details
    title = "Automated Post Test"
    content = "<p>This is a test post automatically published using GitHub Actions and the Blogger API.</p>"
    
    create_post(title, content)
