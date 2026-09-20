import json
import os
from datetime import datetime

# Anchor paths relative to the script's own location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
QUEUE_FILE = os.path.join(BASE_DIR, 'news-queue.json')
POSTS_DIR = os.path.join(BASE_DIR, 'posts')

def main():
    if not os.path.exists(QUEUE_FILE):
        print(f"Error: {QUEUE_FILE} not found.")
        return

    with open(QUEUE_FILE, 'r', encoding='utf-8') as f:
        queue = json.load(f)

    # Find the next unpublished item in the queue
    item_to_publish = None
    for idx, item in enumerate(queue):
        # Gracefully handle items that might be plain strings instead of dictionaries
        if isinstance(item, str):
            queue[idx] = {
                "title": item[:40] + "..." if len(item) > 40 else item,
                "content": item,
                "published": False
            }
            item = queue[idx]

        if isinstance(item, dict) and not item.get('published', False):
            item_to_publish = item
            break

    if not item_to_publish:
        print("No pending posts in the queue.")
        return

    # Prepare file content and unique slug filename
    title = item_to_publish.get('title', 'Untitled')
    content = item_to_publish.get('content', '')
    date_str = datetime.utcnow().strftime('%Y-%m-%d')
    
    # Create safe filename slug from the title
    slug = "".join([c if c.isalnum() else "-" for c in title.lower()])
    slug = "-".join([part for part in slug.split("-") if part])[:50]
    filename = f"{date_str}-{slug}.html"
    
    os.makedirs(POSTS_DIR, exist_ok=True)
    filepath = os.path.join(POSTS_DIR, filename)

    # Write individual standalone HTML post file
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
</head>
<body>
    <article>
        <h1>{title}</h1>
        <p><em>Published on {date_str}</em></p>
        <div class="post-body">{content}</div>
    </article>
</body>
</html>
"""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html_content)

    # Mark this item as published so it won't repeat on the next run
    item_to_publish['published'] = True
    item_to_publish['published_at'] = date_str
    item_to_publish['filename'] = filename
    
    with open(QUEUE_FILE, 'w', encoding='utf-8') as f:
        json.dump(queue, f, indent=2)

    print(f"Successfully generated post file: {filepath}")

if __name__ == '__main__':
    main()
