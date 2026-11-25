import os
import json
import glob
import textwrap
import subprocess
import re
import urllib.request
import urllib.error
import time
import datetime
import argparse
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

CLIENT_ID = os.environ.get("BLOGGER_CLIENT_ID")
CLIENT_SECRET = os.environ.get("BLOGGER_CLIENT_SECRET")
REFRESH_TOKEN = os.environ.get("BLOGGER_REFRESH_TOKEN")
BLOG_ID = os.environ.get("BLOGGER_BLOG_ID")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")

DIPLOMAN_TIMES_URL = "https://www.diplomantimes.com"

VERTICAL_HOMEPAGE_URLS = {
    "governancescore": f"{DIPLOMAN_TIMES_URL}/",
    "policingintel": f"{DIPLOMAN_TIMES_URL}/",
    "footballtally": f"{DIPLOMAN_TIMES_URL}/",
}

VERTICAL_CONFIG = {
    "governancescore": {
        "label": "Governance Score",
        "default_alt": "Diploman Times Governance Score Telemetry",
        "aria_label": "Diploman Times Governance Policy Intelligence",
        "social_cta": "Read the full 37-jurisdiction brief:",
    },
    "policingintel": {
        "label": "Policing Intel",
        "default_alt": "Diploman Times Policing Intel Telemetry",
        "aria_label": "Diploman Times Policing Intelligence",
        "social_cta": "Read the full 37-jurisdiction brief:",
    },
    "footballtally": {
        "label": "Football Tally",
        "default_alt": "Diploman Times Football Tally Standings",
        "aria_label": "Diploman Times Football Tally Analytics",
        "social_cta": "Read the full multi-league telemetry brief:",
    },
}

ALLOWED_VERTICALS = set(VERTICAL_CONFIG.keys())

GOVERNOR_ALIASES = {
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


def format_human_date(iso_date_str):
    """Formats YYYY-MM-DD as 'Nov 24, 2026' without leading zero on day."""
    try:
        dt = datetime.datetime.strptime(str(iso_date_str).strip()[:10], "%Y-%m-%d")
        return f"{dt.strftime('%b')} {dt.day}, {dt.year}"
    except Exception:
        return str(iso_date_str)


def replace_iso_dates_in_text(text, fallback_iso_date=None):
    """Replaces YYYY-MM-DD date strings in report prose with 'Mon D, YYYY'."""
    if not text:
        return text
    result = re.sub(
        r"\b(\d{4})-(\d{2})-(\d{2})\b",
        lambda m: format_human_date(m.group(0)),
        str(text),
    )
    if fallback_iso_date and re.search(r"\b\d{4}-\d{2}-\d{2}\b", result) is None:
        return result
    return result


def _load_registry_file(filename, search_roots=None):
    candidates = [filename]
    for root in search_roots or []:
        for rel in (filename, os.path.join("config", filename), os.path.join("data", filename)):
            candidates.append(os.path.join(root, rel))

    for registry_path in candidates:
        if os.path.exists(registry_path):
            try:
                with open(registry_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    if isinstance(loaded, dict):
                        return loaded
            except Exception as e:
                print(f"Warning: Could not parse {registry_path}: {e}")
    return {}


def load_governors_registry(search_roots=None):
    """Loads governors-registry.json from the workspace or any checked-out repo root if present."""
    return _load_registry_file("governors-registry.json", search_roots=search_roots)


def load_commissioners_registry(search_roots=None):
    """Loads commissioners-registry.json from the workspace or any checked-out repo root if present."""
    return _load_registry_file("commissioners-registry.json", search_roots=search_roots)


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


def extract_state_from_item(item, registry, v_key="governancescore"):
    raw_state = item.get("stateName") or item.get("state") or item.get("jurisdiction")
    if raw_state:
        for s_name in registry.keys():
            if s_name.lower() == str(raw_state).strip().lower():
                return s_name
        return str(raw_state).strip()

    title_text = (item.get("headline") or item.get("title") or "").lower()
    lead_text = (item.get("lead_narrative") or "").lower()

    for search_text in (title_text, lead_text):
        if not search_text:
            continue
        if v_key == "governancescore":
            for alias, state_name in GOVERNOR_ALIASES.items():
                if re.search(rf"\b{re.escape(alias)}\b", search_text):
                    return state_name
        for s_name in sorted(registry.keys(), key=len, reverse=True):
            if re.search(rf"\b{re.escape(s_name.lower())}\b", search_text):
                return s_name

    return "Unknown"


def resolve_vertical_labels(item):
    v_key = str(item.get("vertical", "")).strip().lower()
    v_cfg = VERTICAL_CONFIG[v_key]
    provided = item.get("labels")
    if isinstance(provided, list) and len(provided) > 0:
        labels = [
            str(lbl).strip()
            for lbl in provided
            if lbl and not re.fullmatch(r"angle\s*\d+", str(lbl).strip(), flags=re.IGNORECASE)
        ]
    else:
        labels = ["News Report", "Diploman Times", v_cfg["label"]]
    if v_cfg["label"] not in labels:
        labels.append(v_cfg["label"])
    return labels


def build_social_excerpt(item, share_url=None):
    """Builds or updates a ready-to-paste social excerpt with the resolved article URL."""
    v_key = str(item.get("vertical", "")).strip().lower()
    v_cfg = VERTICAL_CONFIG.get(v_key, {})
    title = str(item.get("title") or f"Diploman Times {v_cfg.get('label', 'Report')}").strip()
    summary = str(item.get("summary") or "").strip()
    target = str(
        share_url
        or item.get("url")
        or item.get("permalink")
        or item.get("target_url")
        or DIPLOMAN_TIMES_URL
    ).strip()
    cta = v_cfg.get("social_cta") or "Read the full brief:"

    existing = item.get("social_excerpt")
    if isinstance(existing, str) and existing.strip():
        updated = re.sub(
            r"(https?://\S+)\s*$",
            target,
            existing.strip(),
        )
        if updated != existing.strip():
            return updated
        if target not in existing:
            return f"{existing.strip()}\n\n{cta} {target}"
        return existing.strip()

    parts = [p for p in (title, summary, f"{cta} {target}") if p]
    return "\n\n".join(parts)


def send_telegram_alert(text):
    """Posts the finalized social excerpt to the configured Telegram channel."""
    token = str(TELEGRAM_BOT_TOKEN or "").strip()
    chat_id = str(TELEGRAM_CHAT_ID or "").strip()
    if not token or not chat_id:
        print("[telegram] Skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured.")
        return False

    if chat_id.isdigit() and chat_id.startswith("100"):
        chat_id = f"-{chat_id}"

    api_url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps(
        {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": False,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        api_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            if body.get("ok"):
                msg_id = body.get("result", {}).get("message_id")
                print(f"[telegram] Posted excerpt to {chat_id} (message_id={msg_id})")
                return True
            print(f"[telegram] API returned non-ok response: {body}")
            return False
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"[telegram] HTTP {e.code} error: {err_body}")
        return False
    except Exception as e:
        print(f"[telegram] Warning: Failed to send Telegram alert: {e}")
        return False


def build_news_report_html(item, governors_registry=None, commissioners_registry=None):
    v_key = str(item.get("vertical", "")).strip().lower()
    v_cfg = VERTICAL_CONFIG[v_key]
    run_date = item.get("run_date_utc")
    governors_registry = governors_registry or {}
    commissioners_registry = commissioners_registry or {}

    html_parts = []
    img_src = ""
    img_alt = replace_iso_dates_in_text(v_cfg["default_alt"], run_date)
    target_url = DIPLOMAN_TIMES_URL
    aria_label = v_cfg["aria_label"]

    queue_img_src = ""
    if "featured_image" in item and isinstance(item["featured_image"], dict):
        img = item["featured_image"]
        target_url = img.get("target_url") or DIPLOMAN_TIMES_URL
        queue_img_src = img.get("src", "")
        raw_alt = img.get("alt") or item.get("title") or v_cfg["default_alt"]
        img_alt = replace_iso_dates_in_text(raw_alt, run_date)
        aria_label = img.get("aria_label") or v_cfg["aria_label"]

    if queue_img_src and is_image_url_working(queue_img_src):
        img_src = queue_img_src
    elif v_key == "policingintel" and commissioners_registry:
        state_name = extract_state_from_item(item, commissioners_registry, v_key=v_key)
        reg = commissioners_registry.get(
            state_name,
            {
                "executive": "Commissioner of Police",
                "title": "Commissioner of Police",
                "src": "",
                "alt": f"{state_name} State Commissioner of Police",
                "aria_label": v_cfg["aria_label"],
            },
        )
        img_src = reg.get("src", "")
        img_alt = replace_iso_dates_in_text(
            reg.get("alt") or f"{state_name} State Commissioner of Police",
            run_date,
        )
        aria_label = reg.get("aria_label") or v_cfg["aria_label"]
        if not img_src:
            print(f"[img-debug] vertical={v_key} resolved_state={state_name!r} reg_keys={len(commissioners_registry)}")
    elif v_key == "governancescore" and governors_registry:
        state_name = extract_state_from_item(item, governors_registry, v_key=v_key)
        reg = governors_registry.get(
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
        img_alt = replace_iso_dates_in_text(
            reg.get("alt") or f"{state_name} Executive Office", run_date
        )
        aria_label = reg.get("aria_label") or v_cfg["aria_label"]
        if not img_src:
            print(f"[img-debug] vertical={v_key} resolved_state={state_name!r} reg_keys={len(governors_registry)}")
    elif v_key in ("governancescore", "policingintel"):
        print(f"[img-debug] vertical={v_key} registry empty (queue_img_src={queue_img_src!r})")

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
        formatted_lead = replace_iso_dates_in_text(item["lead_narrative"], run_date)
        html_parts.append(
            textwrap.dedent(
                f"""
        <p style="font-size: 15px; line-height: 1.8; color: #334155; margin-bottom: 12px; font-weight: 500;">
          {formatted_lead}
        </p>
        <!--more-->
        """
            ).strip()
        )

    if "editorial_notice" in item and item["editorial_notice"]:
        notice_text = str(item["editorial_notice"]).replace("EDITORIAL NOTICE:", "").strip()
        formatted_notice = replace_iso_dates_in_text(notice_text, run_date)
        html_parts.append(
            textwrap.dedent(
                f"""
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #173730; padding: 10px 14px; margin: 16px 0 24px 0; border-radius: 4px; font-size: 12px; color: #475569;">
          <strong>EDITORIAL NOTICE:</strong> {formatted_notice}
        </div>
        """
            ).strip()
        )

    if "story_body" in item and isinstance(item["story_body"], list):
        for p in item["story_body"]:
            if p and str(p).strip():
                formatted_p = replace_iso_dates_in_text(p, run_date)
                html_parts.append(
                    textwrap.dedent(
                        f"""
            <p style="font-size: 15px; line-height: 1.8; color: #334155; margin-bottom: 18px;">
              {formatted_p}
            </p>
            """
                    ).strip()
                )

    homepage_url = VERTICAL_HOMEPAGE_URLS.get(v_key, f"{DIPLOMAN_TIMES_URL}/")

    html_parts.append(
        textwrap.dedent(
            f"""
    <div style="display: flex; justify-content: flex-end; margin: 28px 0;">
      <a href="{homepage_url}" target="_top" style="display: inline-flex; align-items: center; justify-content: center; background-color: #ffffff; color: #193731; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; text-decoration: none; padding: 6px 14px; border-radius: 4px; border: 1px solid #cbd5e1; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); white-space: nowrap; transition: all 0.15s ease;">
        Back To Homepage →
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
        else:
            print(f"[git] No changes to commit in {repo_dir} ({rel_path})")
    except Exception as e:
        print(f"[git] Warning: Could not push update for {repo_dir}: {e}")


def _queued_sort_key(item):
    ts = str(item.get("queued_at_utc") or item.get("run_date_utc") or "")
    return ts


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
    governors_registry = load_governors_registry(search_roots=repo_dirs)
    commissioners_registry = load_commissioners_registry(search_roots=repo_dirs)
    print(f"[registry] Loaded governors={len(governors_registry)} keys, commissioners={len(commissioners_registry)} keys")
    service = get_blogger_service()

    # Check live blog posts so a vertical never double-publishes on the same UTC date
    vertical_daily_counts = {v: 0 for v in ALLOWED_VERTICALS}
    if not is_draft:
        already_live = get_live_published_verticals_for_utc_date(service, today_utc)
        for v_key in already_live:
            vertical_daily_counts[v_key] = max_per_vertical_daily
            print(f"[guard] {VERTICAL_CONFIG[v_key]['label']} already published on {today_utc} UTC; locking slot.")

    total_published = 0
    cap_logged_verticals = set()

    for repo_dir in repo_dirs:
        if not publish_all and total_published >= limit:
            print(f"[stop] Run limit ({limit}) reached before scanning {repo_dir}.")
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

        unpublished_candidates = [
            entry for entry in items if is_allowed_vertical(entry) and not entry.get("published", False)
        ]
        if not unpublished_candidates:
            print(f"[queue] No unpublished items found in {queue_path}.")
            continue

        # Sort newest first by queued_at_utc / run_date_utc, preserving reverse list order as tie-breaker
        indexed_candidates = list(enumerate(reversed(unpublished_candidates)))
        indexed_candidates.sort(key=lambda pair: (_queued_sort_key(pair[1]), -pair[0]), reverse=True)
        ordered_candidates = [pair[1] for pair in indexed_candidates]

        repo_modified = False
        rate_limited = False
        matched_any_for_vertical = False

        for item in ordered_candidates:
            if not publish_all and total_published >= limit:
                print(f"[stop] Reached run limit ({limit}); remaining unpublished items left in queue.")
                break

            v_key = str(item.get("vertical", "")).strip().lower()
            v_cfg = VERTICAL_CONFIG[v_key]

            if requested_vertical != "all" and v_key != requested_vertical:
                continue

            matched_any_for_vertical = True

            # Enforce strict 1-post-per-vertical-per-UTC-day cap
            if vertical_daily_counts[v_key] >= max_per_vertical_daily:
                if is_draft:
                    if v_key not in cap_logged_verticals:
                        cap_logged_verticals.add(v_key)
                        print(f"[guard] Daily cap ({max_per_vertical_daily}) reached for {v_cfg['label']} in draft mode; skipping '{item.get('title')}'")
                    continue
                item["published"] = True
                item["skipped_duplicate_daily"] = True
                item["published_utc_date"] = today_utc
                repo_modified = True
                print(f"[guard] Skipped excess {v_cfg['label']} queued item for {today_utc} UTC: '{item.get('title')}'")
                continue

            title = item.get("title", f"Diploman Times {v_cfg['label']} Report")
            labels = resolve_vertical_labels(item)

            if item.get("type") in ("news_report", "scored_brief") or "lead_narrative" in item:
                content = build_news_report_html(
                    item,
                    governors_registry=governors_registry,
                    commissioners_registry=commissioners_registry,
                )
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

                item["social_excerpt"] = build_social_excerpt(item, share_url=post_url)
                print(f"[social_excerpt]\n{item['social_excerpt']}\n---")

                if not is_draft:
                    send_telegram_alert(item["social_excerpt"])

                time.sleep(5)

            except Exception as post_err:
                err_msg = str(post_err)
                print(f"Warning: Failed to publish '{title}': {err_msg}")
                if "429" in err_msg or "rateLimitExceeded" in err_msg:
                    print("Rate limit reached (429). Halting remaining batch execution.")
                    rate_limited = True
                    break
                continue

        if not matched_any_for_vertical and requested_vertical != "all":
            print(f"[queue] No unpublished items for vertical='{requested_vertical}' in {queue_path}.")

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
