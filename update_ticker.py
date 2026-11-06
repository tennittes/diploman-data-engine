
import os
import json
import glob
import subprocess
from datetime import datetime


def get_psi_value(record):
    """Read and safely convert PSI or psiScore."""

    psi = record.get("psi")

    if psi is None or str(psi).strip() == "":
        psi = record.get("psiScore")

    if psi is None or str(psi).strip() == "":
        return None

    try:
        return float(str(psi).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def generate_latest_day_ticker():

    items = []

    now = datetime.now()
    current_month_key = f"{now.strftime('%b').lower()}{now.year}"

    target_master = f"{current_month_key}/master-data.json"

    # Locate latest available master-data file if current month is absent.
    if not os.path.exists(target_master):

        master_files = glob.glob("**/master-data.json", recursive=True)

        if not master_files:
            print("No master-data.json found for ticker generation.")
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

        # Determine the latest telemetry day.
        max_day = 0

        for record in all_records:

            if not isinstance(record, dict):
                continue

            day_num = record.get("dayNumber")

            if day_num is None:
                day_num = record.get("day")

            try:
                max_day = max(max_day, int(day_num))
            except (ValueError, TypeError):
                continue

        print(f"Latest telemetry day: {max_day}")

        # Counters for classification and extraction.
        active_count = 0
        dormant_count = 0
        invalid_psi_count = 0

        # Extract headlines exclusively from the latest day.
        for record in all_records:

            if not isinstance(record, dict):
                continue

            day_num = record.get("dayNumber")

            if day_num is None:
                day_num = record.get("day")

            try:
                if int(day_num) != max_day:
                    continue
            except (ValueError, TypeError):
                continue

            # Read authoritative PSI classification.
            psi_val = get_psi_value(record)

            if psi_val is None:
                invalid_psi_count += 1
                continue

            # DORMANT: PSI <= 3.0.
            if psi_val <= 3.0:
                dormant_count += 1
                continue

            # ACTIVE: PSI > 3.0.
            active_count += 1

            # Extract headline information.
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

            if not brief or len(str(brief)) <= 10:
                continue

            if "baseline administrative" in str(brief).lower():
                continue

            # Sanitize headline and jurisdiction name.
            clean_brief = str(brief).strip().strip('"\'“”‘’')

            clean_state = (
                str(state).strip().upper()
                if state else ""
            )

            # Format ticker headline.
            if clean_state:
                clean_text = (
                    f"{clean_state} (PSI {psi_val:.1f}): {clean_brief}"
                )
            else:
                clean_text = clean_brief

            # Prevent duplicate headlines.
            if clean_text not in items:
                items.append(clean_text)

        print(f"Active jurisdictions detected: {active_count}")
        print(f"Dormant jurisdictions excluded: {dormant_count}")
        print(f"Records with invalid/missing PSI: {invalid_psi_count}")

        # Preserve archive fallback when no qualifying headlines exist.
        if not items:

            items = [
                "Diploman Times Subnational Governance & Policy Intelligence Archive.",
                "Tracking Policy Signals and Public Order Strain Across 37 Jurisdictions."
            ]

            print("No qualifying active headlines. Archive fallback applied.")

        # Generate ticker JSON.
        ticker_payload = {"items": items}

        with open("ticker.json", "w", encoding="utf-8") as out_f:

            json.dump(
                ticker_payload,
                out_f,
                indent=2,
                ensure_ascii=False
            )

        print(
            f"Successfully generated latest-day ticker: "
            f"{len(items)} headlines from Day {max_day}."
        )

    except Exception as e:

        print(f"Error generating ticker JSON: {e}")
        raise


if __name__ == "__main__":

    generate_latest_day_ticker()

    # Commit and push ticker.json updates.
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

            subprocess.run(
                ["git", "add", "ticker.json"],
                check=True
            )

            subprocess.run(
                [
                    "git",
                    "commit",
                    "-m",
                    "auto: update active jurisdictions ticker [skip ci]"
                ],
                check=True
            )

            subprocess.run(
                ["git", "push"],
                check=True
            )

            print("Successfully pushed ticker.json update.")

        else:

            print("No changes detected in ticker.json; push skipped.")

    except Exception as e:

        print(f"Git auto-commit skipped or failed: {e}")
