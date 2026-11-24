import os
import json
import glob
import textwrap
import subprocess
import re
import urllib.request
import time
import datetime
import argparse
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

CLIENT_ID = os.environ.get("BLOGGER_CLIENT_ID")
CLIENT_SECRET = os.environ.get("BLOGGER_CLIENT_SECRET")
REFRESH_TOKEN = os.environ.get("BLOGGER_REFRESH_TOKEN")
BLOG_ID = os.environ.get("BLOGGER_BLOG_ID")

DIPLOMAN_TIMES_URL = "https://www.diplomantimes.com"

VERTICAL_CONFIG = {
    "governancescore": {
        "label": "Governance Score",
        "default_alt": "Diploman Times Governance Score Telemetry",
        "aria_label": "Diploman Times Governance Policy Intelligence",
    },
    "policingintel": {
        "label": "Policing Intel",
        "default_alt": "Diploman Times Policing Intel Telemetry",
        "aria_label": "Diploman Times Policing Intelligence",
    },
    "footballtally": {
        "label": "Football Tally",
        "default_alt": "Diploman Times Football Tally Standings",
        "aria_label": "Diploman Times Football Tally Analytics",
    },
}

ALLOWED_VERTICALS = set(VERTICAL_CONFIG.keys())


def is_allowed_vertical(item):
    if not isinstance(item, dict):
        return False
    return str(item.get("vertical", "")).strip().lower() in ALLOWED_VERTICALS


def get_blogger_service():
    creds = Credentials(
        token=None,
        refresh_token=REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        scopes=["https://www.googleapis.com/auth/blogger"],
    )
    return build("blogger", "v3", credentials=creds)


def get_live_published_verticals_for_utc_date(service, target_utc_date):
    """Queries the latest Blogger posts to find which verticals already published on target_utc_date (YYYY-MM-DD)."""
    already_live = set()
    try:
        res = service.posts().list(blogId=BLOG_ID, maxResults=12, fetchBodies=False).execute()
        for post in res.get("items", []):
            pub_raw = str(post.get("published", ""))
            if not pub_raw.startswith(target_utc_date):
                continue
            labels = [str(lbl).strip().lower() for lbl in post.get("labels", [])]
            for v_key, v_cfg in VERTICAL_CONFIG.items():
                if v_cfg["label"].lower() in labels:
                    already_live.add(v_key)
    except Exception as e:
        print(f"Warning: Could not verify existing live posts via Blogger API: {e}")
    return already_live


def optimize_blogger_images(html_content):
    """Forces Blogger image CDN URLs to an optimized width (s720) with WebP compression (-rw)."""
    if not html_content:
        return html_content
    pattern = r"(https?://blogger\.googleusercontent\.com/img/[^/]+/)s\d+((-[a-zA-Z0-9\-_]+)*)(/)"
    replacement = r"\1s720-rw\2\4"
    return re.sub(pattern, replacement, html_content)


def load_governors_registry(search_roots=None):
    """Loads governors-registry.json from the workspace or any checked-out repo root if present."""
    candidates = ["governors-registry.json"]
    for root in search_roots or []:
        candidates.append(os.path.join(root, "governors-registry.json"))

    for registry_path in candidates:
        if os.path.exists(registry_path):
            try:
                with open(registry_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Warning: Could not parse {registry_path}: {e}")
    return {}


def is_image_url_working(url):
    """Tests if an image URL is reachable and returns HTTP 200."""
    if not url or not url.startswith("http"):
        return False
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
        with urllib.request.urlopen(req, timeout=4) as response:
            return response.status == 200
    except Exception:
        return False


def extract_state_from_item(item, registry):
    raw_state = item.get("stateName") or item.get("state") or item.get("jurisdiction")
    text_to_check = (item.get("headline") or item.get("title") or "").lower()

    if raw_state:
        for s_name in registry.keys():
            if s_name.lower() == str(raw_state).strip().lower():
                return s_name
        return str(raw_state).strip()

    governor_aliases = {
        "nwifuru": "Ebonyi",
        "okpebholo": "Edo",
        "kefas": "Taraba",
        "zulum": "Borno",
        "uzodimma": "Imo",
        "fintiri": "Adamawa",
        "bago": "Niger",
        "adeleke": "Osun",
        "makinde": "Oyo",
        "soludo": "Anambra",
        "sanwo-olu": "Lagos",
        "wike": "FCT Abuja",
    }
    for alias, state_name in governor_aliases.items():
        if alias in text_to_check:
            return state_name

    for s_name in registry.keys():
        if s_name.lower() in text_to_check:
            return s_name

    return "Unknown"


def resolve_vertical_labels(item):
    v_key = str(item.get("vertical", "")).strip().lower()
    v_cfg = VERTICAL_CONFIG[v_key]
    provided = item.get("labels")
    if isinstance(provided, list) and len(provided) > 0:
        labels = list(provided)
    else:
        labels = ["News Report", "Diploman Times", v_cfg["label"]]
    if v_cfg["label"] not in labels:
        labels.append(v_cfg["label"])
    return labels


def build_news_report_html(item, registry):
    v_key = str(item.get("vertical", "")).strip().lower()
    v_cfg = VERTICAL_CONFIG[v_key]

    html_parts = []
    img_src = ""
    img_alt = v_cfg["default_alt"]
    target_url = DIPLOMAN_TIMES_URL
    aria_label = v_cfg["aria_label"]

    queue_img_src = ""
    if "featured_image" in item and isinstance(item["featured_image"], dict):
        img = item["featured_image"]
        target_url = img.get("target_url") or DIPLOMAN_TIMES_URL
        queue_img_src = img.get("src", "")
        img_alt = img.get("alt") or item.get("title") or v_cfg["default_alt"]
        aria_label = img.get("aria_label") or v_cfg["aria_label"]

    if queue_img_src and is_image_url_working(queue_img_src):
        img_src = queue_img_src
    elif v_key in ("governancescore", "policingintel") and registry:
        state_name = extract_state_from_item(item, registry)
        reg = registry.get(
            state_name,
            {
                "executive": "Executive Office",
                "title": "Gov.",
                "src": "",
                "alt": f"{state_name} Executive Office",
                "aria_label": v_cfg["aria_label"],
            },
        )
        img_src = reg.get("src", "")
        img_alt = reg.get("alt") or f"{state_name} Executive Office"
        aria_label = reg.get("aria_label") or v_cfg["aria_label"]

    if img_src:
        html_parts.append(
            textwrap.dedent(
                f"""
        <figure class="post-featured-image-container" style="box-sizing: border-box; margin: 0px 0px 8px; padding: 0px; position: relative; width: 100%;">
          <a href="{target_url}" aria-label="{aria_label}" style="display: block; margin: 0px; padding: 0px; text-decoration: none;">
            <img alt="{img_alt}" border="0" src="{img_src}" style="border: 0px; display: block; height: auto; margin: 0px; padding: 0px; width: 100%;" />
          </a>
        </figure>
        """
            ).strip()
        )

    if "lead_narrative" in item and item["lead_narrative"]:
        html_parts.append(
            textwrap.dedent(
                f"""
        <p style="font-size: 15px; line-height: 1.8; color: #334155; margin-bottom: 12px; font-weight: 500;">
          {item['lead_narrative']}
        </p>
        <!--more-->
        """
            ).strip()
        )

    if "editorial_notice" in item and item["editorial_notice"]:
        notice_text = str(item["editorial_notice"]).replace("EDITORIAL NOTICE:", "").strip()
        html_parts.append(
            textwrap.dedent(
                f"""
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #173730; padding: 10px 14px; margin: 16px 0 24px 0; border-radius: 4px; font-size: 12px; color: #475569;">
          <strong>EDITORIAL NOTICE:</strong> {notice_text}
        </div>
        """
            ).strip()
        )

    if "story_body" in item and isinstance(item["story_body"], list):
        for p in item["story_body"]:
            if p and str(p).strip():
                html_parts.append(
                    textwrap.dedent(
                        f"""
            <p style="font-size: 15px; line-height: 1.8; color: #334155; margin-bottom: 18px;">
              {p}
            </p>
            """
                    ).strip()
                )

    html_parts.append(
        textwrap.dedent(
            f"""
    <div style="display: flex; justify-content: flex-end; margin: 28px 0;">
      <a href="{DIPLOMAN_TIMES_URL}/" target="_top" style="display: inline-flex; align-items: center; justify-content: center; background-color: #ffffff; color: #193731; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; text-decoration: none; padding: 6px 14px; border-radius: 4px; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); white-space: nowrap; transition: all 0.15s ease;">
        Back To Diploman Times →
      </a>
    </div>
    """
        ).strip()
    )

    raw_html = "\n\n".join(html_parts)
    return optimize_blogger_images(raw_html)


def find_queue_file_in_repo(repo_dir, override_folder=None):
    """Locates the active news-queue.json inside a given repository directory."""
    now = datetime.datetime.now(datetime.timezone.utc)
    month_key = now.strftime("%b").lower()
    current_month_folder = override_folder or f"{month_key}{now.year}"
    dynamic_target = os.path.join(repo_dir, current_month_folder, "news-queue.json")
    root_target = os.path.join(repo_dir, "news-queue.json")

    def has_unpublished(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = json.load(f)
                items = content.get("newsReports", []) if isinstance(content, dict) else content
                return any(is_allowed_vertical(item) and not item.get("published", False) for item in items)
        except Exception:
            return False

    if os.path.exists(dynamic_target) and has_unpublished(dynamic_target):
        return dynamic_target
    if os.path.exists(root_target) and has_unpublished(root_target):
        return root_target

    all_queues = sorted(glob.glob(os.path.join(repo_dir, "**", "news-queue.json"), recursive=True), reverse=True)
    for q_path in all_queues:
        if has_unpublished(q_path):
            return q_path

    if os.path.exists(root_target):
        return root_target
    if os.path.exists(dynamic_target):
        return dynamic_target
    return all_queues[0] if all_queues else None


def commit_and_push_repo(repo_dir, queue_file_path):
    """Commits and pushes updated news-queue.json back to its own Git repository."""
    try:
        rel_path = os.path.relpath(queue_file_path, repo_dir)
        subprocess.run(["git", "-C", repo_dir, "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(
            ["git", "-C", repo_dir, "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
            check=True,
        )
        subprocess.run(["git", "-C", repo_dir, "add", rel_path], check=True)
        status = subprocess.run(
            ["git", "-C", repo_dir, "status", "--porcelain"], capture_output=True, text=True, check=True
        )
        if status.stdout.strip():
            subprocess.run(
                ["git", "-C", repo_dir, "commit", "-m", "auto: mark published briefs on Diploman Times [skip ci]"],
                check=True,
            )
            subprocess.run(["git", "-C", repo_dir, "push"], check=True)
            print(f"[git] Pushed queue update to {repo_dir} ({rel_path})")
    except Exception as e:
        print(f"[git] Warning: Could not push update for {repo_dir}: {e}")


def publish_across_repos(
    repo_dirs,
    publish_all=False,
    limit=3,
    target_folder=None,
    vertical="all",
    is_draft=False,
    max_per_vertical_daily=1,
):
    requested_vertical = str(vertical or "all").strip().lower()
    if requested_vertical != "all" and requested_vertical not in ALLOWED_VERTICALS:
        raise ValueError(
            f"Unsupported vertical '{vertical}'. Allowed: governancescore, policingintel, footballtally, all"
        )

    today_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    registry = load_governors_registry(search_roots=repo_dirs)
    service = get_blogger_service()

    # Check live blog posts so a vertical never double-publishes on the same UTC date
    vertical_daily_counts = {v: 0 for v in ALLOWED_VERTICALS}
    if not is_draft:
        already_live = get_live_published_verticals_for_utc_date(service, today_utc)
        for v_key in already_live:
            vertical_daily_counts[v_key] = max_per_vertical_daily
            print(f"[guard] {VERTICAL_CONFIG[v_key]['label']} already published on {today_utc} UTC; locking slot.")

    total_published = 0

    for repo_dir in repo_dirs:
        if not publish_all and total_published >= limit:
            break

        if not os.path.isdir(repo_dir):
            print(f"Skipping missing repo directory: {repo_dir}")
            continue

        queue_path = find_queue_file_in_repo(repo_dir, override_folder=target_folder)
        if not queue_path:
            print(f"No news-queue.json found in {repo_dir}")
            continue

        print(f"Scanning queue: {queue_path}")
        try:
            with open(queue_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Error reading {queue_path}: {e}")
            continue

        if isinstance(data, dict) and "newsReports" in data:
            items = data["newsReports"]
        elif isinstance(data, list):
            items = data
        else:
            items = []

        # Also check queue metadata for any item already marked published today in UTC
        for entry in items:
            if is_allowed_vertical(entry) and entry.get("published") and entry.get("published_utc_date") == today_utc:
                v_k = str(entry.get("vertical", "")).strip().lower()
                vertical_daily_counts[v_k] = max(vertical_daily_counts[v_k], max_per_vertical_daily)

        def matches_target(entry):
            if not is_allowed_vertical(entry) or entry.get("published", False):
                return False
            v_k = str(entry.get("vertical", "")).strip().lower()
            if requested_vertical != "all" and v_k != requested_vertical:
                return False
            return True

        repo_modified = False
        rate_limited = False

        # Iterate newest-first so if multiple items piled up in a queue, the latest brief wins today's slot
        for item in reversed(items):
            if not publish_all and total_published >= limit:
                break

            if not matches_target(item):
                continue

            v_key = str(item.get("vertical", "")).strip().lower()
            v_cfg = VERTICAL_CONFIG[v_key]

            # Enforce strict 1-post-per-vertical-per-UTC-day cap
            if vertical_daily_counts[v_key] >= max_per_vertical_daily:
                item["published"] = True
                item["skipped_duplicate_daily"] = True
                item["published_utc_date"] = today_utc
                repo_modified = True
                print(f"[guard] Skipped excess {v_cfg['label']} queued item for {today_utc} UTC: '{item.get('title')}'")
                continue

            title = item.get("title", f"Diploman Times {v_cfg['label']} Report")
            labels = resolve_vertical_labels(item)

            if item.get("type") in ("news_report", "scored_brief") or "lead_narrative" in item:
                content = build_news_report_html(item, registry)
            else:
                content = optimize_blogger_images(item.get("content", "<p>No content provided.</p>"))

            body = {
                "kind": "blogger#post",
                "title": title,
                "content": content,
                "labels": labels,
            }

            try:
                result = service.posts().insert(blogId=BLOG_ID, body=body, isDraft=is_draft).execute()
                post_url = result.get("url")
                vertical_daily_counts[v_key] += 1
                total_published += 1
                repo_modified = True
                print(f"[{total_published}] [{v_cfg['label']}] Published: '{title}' -> {post_url}")

                item["published"] = not is_draft
                item["published_utc_date"] = today_utc
                item["blogger_draft"] = bool(is_draft)
                item["blogger_post_id"] = result.get("id")
                if post_url:
                    item["url"] = post_url
                    item["permalink"] = post_url

                time.sleep(5)

            except Exception as post_err:
                err_msg = str(post_err)
                print(f"Warning: Failed to publish '{title}': {err_msg}")
                if "429" in err_msg or "rateLimitExceeded" in err_msg:
                    print("Rate limit reached (429). Halting remaining batch execution.")
                    rate_limited = True
                    break
                continue

        if repo_modified:
            with open(queue_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            print(f"Updated queue state in {queue_path}")
            commit_and_push_repo(repo_dir, queue_path)

        if rate_limited:
            break

    print(f"Done. Total briefs deployed across verticals on {today_utc} UTC: {total_published}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Central Diploman Times 3-Vertical Blogger Publisher")
    parser.add_argument(
        "--repo-dirs",
        nargs="+",
        default=["."],
        help="List of checked-out repository directories containing news-queue.json",
    )
    parser.add_argument("--publish-all", action="store_true", help="Publish every pending item across all queues")
    parser.add_argument("--limit", type=int, default=3, help="Max total posts per run across all 3 verticals (default: 3)")
    parser.add_argument("--month-folder", type=str, default=None, help="Optional month folder override (e.g. nov2026)")
    parser.add_argument(
        "--vertical",
        type=str,
        default="all",
        choices=["all", "governancescore", "policingintel", "footballtally"],
        help="Deploy all three ('all') or one specific vertical",
    )
    parser.add_argument("--draft", action="store_true", help="Create posts as Blogger drafts instead of live posts")

    args = parser.parse_args()
    publish_across_repos(
        repo_dirs=args.repo_dirs,
        publish_all=args.publish_all,
        limit=args.limit,
        target_folder=args.month_folder,
        vertical=args.vertical,
        is_draft=args.draft,
    )
