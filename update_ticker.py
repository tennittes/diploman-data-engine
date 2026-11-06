
import os
import json
import glob
import subprocess
from datetime import datetime


def is_active_jurisdiction(record):
    """
    Include only jurisdictions explicitly identified as ACTIVE.
    Dormant, baseline, missing and unrecognised statuses are excluded.
    """

    status_fields = [
        "status",
        "jurisdictionStatus",
        "activityStatus",
        "operationalStatus"
    ]

    for field in status_fields:
        value = record.get(field)

        if value is not None:
            return str(value).strip().upper() in {
                "ACTIVE",
                "ACTIVATED"
            }

    return False


def generate_latest_day_ticker():

    items = []

    now = datetime.now()
    current_month_key = f"{now.strftime('%b').lower()}{now.year}"

    target_master = f"{current_month_key}/master-data.json"

    if not os.path.exists(target_master):

        master_files = glob.glob("**/master-data.json", recursive=True)

        if not master_files:
            print("No master-data.json found.")
            return

        def parse_folder_date(filepath):

            parts = filepath.split(os.sep)

            for part in parts:
                try:
                    return datetime.strptime(part, "%b%Y")
                except ValueError:
                    continue

            return datetime.min

        master_files.sort(key=parse_folder_date)
        target_master = master_files[-1]

    print(f"Reading telemetry source: {target_master}")

    try:

        with open(target_master, "r", encoding="utf-8") as f:
            payload = json.load(f)

        all_records = []

        if isinstance(payload, list):
            all_records = payload

        elif isinstance(payload, dict):

            for val in payload.values():

                if isinstance(val, list):
                    all_records.extend(val)

                elif isinstance(val, dict):

                    for sub_val in val.values():
                        if isinstance(sub_val, list):
                            all_records.extend(sub_val)

        # Identify latest available telemetry day.
        max_day = 0

        for record in all_records:

            if not isinstance(record, dict):
                continue

            day_num = record.get("dayNumber") or record.get("day")

            try:
                d_int = int(day_num)
                max_day = max(max_day, d_int)
            except (ValueError, TypeError):
                continue

        print(f"Latest telemetry day: {max_day}")

        active_count = 0
        excluded_count = 0

        # Extract qualifying records from the latest day only.
        for record in all_records:

            if not isinstance(record, dict):
                continue

            day_num = record.get("dayNumber") or record.get("day")

            try:
                if int(day_num) != max_day:
                    continue
            except (ValueError, TypeError):
                continue

            # Enforce active-jurisdiction filter.
            if not is_active_jurisdiction(record):
                excluded_count += 1
                continue

            brief = (
                record.get("dailyBrief")
                or record.get("summary")
                or record.get("headline")
            )

            state = (
                record.get("stateName")
                or record.get("stateKey")
                or record.get("jurisdiction")
            )

            psi = record.get("psi") or record.get("psiScore")

            if not brief or len(str(brief)) <= 10:
                continue

            if "baseline administrative" in str(brief).lower():
                continue

            clean_brief = str(brief).strip().strip('"\'“”‘’')
            clean_state = str(state).strip().upper() if state else ""

            psi_val = None

            if psi is not None and str(psi).strip() != "":
                try:
                    psi_val = float(psi)
                except (ValueError, TypeError):
                    pass

            if clean_state and psi_val is not None:
                clean_text = (
                    f"{clean_state} (PSI {psi_val:.1f}): {clean_brief}"
                )
            else:
                clean_text = clean_brief

            if clean_text not in items:
                items.append(clean_text)
                active_count += 1

        # Archive fallback.
        if not items:

            items = [
                "Diploman Times Subnational Governance & Policy Intelligence Archive.",
                "Tracking Policy Signals and Public Order Strain Across 37 Jurisdictions."
            ]

        ticker_payload = {"items": items}

        with open("ticker.json", "w", encoding="utf-8") as out_f:
            json.dump(
                ticker_payload,
                out_f,
                indent=2,
                ensure_ascii=False
            )

        print(
            f"Ticker generated: {len(items)} headlines. "
            f"Active records included: {active_count}. "
            f"Records excluded: {excluded_count}."
        )

    except Exception as e:
        print(f"Error generating ticker: {e}")


if __name__ == "__main__":

    generate_latest_day_ticker()

    try:

        subprocess.run(
            ["git", "config", "user.name", "github-actions[bot]"],
            check=True
        )

        subprocess.run(
            [
                "git", "config", "user.email",
                "github-actions[bot]@users.noreply.github.com"
            ],
            check=True
        )

        status_result = subprocess.run(
            ["git", "status", "--porcelain", "ticker.json"],
            capture_output=True,
            text=True,
            check=True
        )

        if status_result.stdout.strip():

            subprocess.run(["git", "add", "ticker.json"], check=True)

            subprocess.run(
                [
                    "git",
                    "commit",
                    "-m",
                    "auto: update active jurisdictions ticker [skip ci]"
                ],
                check=True
            )

            subprocess.run(["git", "push"], check=True)

            print("Successfully pushed ticker.json update.")

        else:
            print("No ticker changes detected.")

    except Exception as e:
        print(f"Git auto-commit skipped or failed: {e}")
