import os
import json
import glob
import subprocess
from datetime import datetime

def generate_latest_day_ticker():
    """
    Parses the current month's master-data.json safely, handles chronological folder sorting,
    sanitizes text (removing stray citation/quote marks), and exports to ticker.json.
    """
    items = []
    
    # Target current active month explicitly based on system repository structure
    now = datetime.now()
    current_month_key = f"{now.strftime('%b').lower()}{now.year}" # e.g. oct2026
    
    target_master = f"{current_month_key}/master-data.json"
    if not os.path.exists(target_master):
        # Fallback: find all master-data.json files and sort them chronologically
        master_files = glob.glob("**/master-data.json", recursive=True)
        if not master_files:
            print("No master-data.json found for ticker generation.")
            return
        
        # Sort folders properly by parsing year and month rather than pure string sorting
        def parse_folder_date(filepath):
            parts = filepath.split(os.sep)
            for part in parts:
                if len(part) >= 5: # e.g. oct2026, sep2026
                    try:
                        month_str = part[:3]
                        year_str = part[3:]
                        dt = datetime.strptime(f"{month_str} {year_str}", "%b %Y")
                        return dt
                    except ValueError:
                        continue
            return datetime.min

        master_files.sort(key=parse_folder_date)
        target_master = master_files[-1]

    print(f"Reading telemetry source from: {target_master}")
    try:
        with open(target_master, "r", encoding="utf-8") as f:
            payload = json.load(f)
            
        all_records = []
        if isinstance(payload, list):
            all_records = payload
        elif isinstance(payload, dict):
            for key, val in payload.items():
                if isinstance(val, list):
                    all_records.extend(val)
                elif isinstance(val, dict):
                    for sub_val in val.values():
                        if isinstance(sub_val, list):
                            all_records.extend(sub_val)
        
        # Find the maximum day number available
        max_day = 0
        for record in all_records:
            if not isinstance(record, dict):
                continue
            day_num = record.get('dayNumber') or record.get('day')
            if day_num is not None:
                try:
                    d_int = int(day_num)
                    if d_int > max_day:
                        max_day = d_int
                except ValueError:
                    pass
        
        print(f"Detected latest active telemetry day number: {max_day}")

        # Extract headlines strictly for that highest (latest) day number
        for record in all_records:
            if not isinstance(record, dict):
                continue
            day_num = record.get('dayNumber') or record.get('day')
            if day_num is not None and int(day_num) == max_day:
                brief = record.get('dailyBrief') or record.get('summary') or record.get('headline')
                state = record.get('stateName') or record.get('stateKey') or record.get('jurisdiction')
                psi = record.get('psi') or record.get('psiScore')
                
                if brief and len(str(brief)) > 10 and not "baseline administrative" in str(brief).lower():
                    # Sanitize text: strip leading/trailing whitespace and remove stray quotation/citation marks
                    clean_brief = str(brief).strip().strip('"\'“”‘’')
                    clean_state = str(state).strip().upper() if state else ""
                    
                    # Safely parse PSI value
                    psi_val = None
                    if psi is not None and str(psi).strip() != "":
                        try:
                            psi_val = float(psi)
                        except ValueError:
                            pass

                    clean_text = f"{clean_state} (PSI {psi_val:.1f}): {clean_brief}" if clean_state and psi_val is not None else clean_brief
                    
                    if clean_text not in items:
                        items.append(clean_text)
                        
        if not items:
            items = [
                "Diploman Times Subnational Governance & Policy Intelligence Archive.",
                "Tracking Policy Signals and Public Order Strain Across 37 Jurisdictions."
            ]
            
        ticker_payload = {"items": items}
        
        with open("ticker.json", "w", encoding="utf-8") as out_f:
            json.dump(ticker_payload, out_f, indent=2, ensure_ascii=False)
            
        print(f"Successfully generated latest day (Day {max_day}) ticker JSON with {len(items)} headlines.")
        
    except Exception as e:
        print(f"Error generating latest day ticker JSON: {e}")

if __name__ == "__main__":
    generate_latest_day_ticker()
    
    # Safely commit and push ticker.json updates
    try:
        subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"], check=True)
        
        status_result = subprocess.run(["git", "status", "--porcelain", "ticker.json"], capture_output=True, text=True, check=True)
        if status_result.stdout.strip():
            subprocess.run(["git", "add", "ticker.json"], check=True)
            subprocess.run(["git", "commit", "-m", "auto: update ticker.json from latest telemetry [skip ci]"], check=True)
            subprocess.run(["git", "push"], check=True)
            print("Successfully pushed isolated ticker.json update to repository.")
        else:
            print("No changes detected in ticker.json; git commit/push skipped.")
    except Exception as e:
        print(f"Note: Git auto-commit skipped or failed: {e}")
