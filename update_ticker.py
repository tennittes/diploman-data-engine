import os
import json
import glob
import subprocess
from datetime import datetime

def generate_latest_day_ticker():
    """
    Parses the current month's master-data.json, finds the highest dayNumber available,
    extracts headlines/briefs for that latest day, and exports them directly to ticker.json.
    """
    items = []
    
    # Target current active month explicitly based on system date or repository structure
    now = datetime.now()
    current_month_key = f"{now.strftime('%b').lower()}{now.year}" # e.g. sep2026
    
    target_master = f"{current_month_key}/master-data.json"
    if not os.path.exists(target_master):
        # Fallback to glob if explicit path doesn't exist
        master_files = sorted(glob.glob("**/master-data.json", recursive=True))
        if not master_files:
            print("No master-data.json found for ticker generation.")
            return
        target_master = master_files[-1]

    print(f"Reading telemetry source from: {target_master}")
    try:
        with open(target_master, "r", encoding="utf-8") as f:
            payload = json.load(f)
            
        all_records = []
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
            day_num = record.get('dayNumber') or record.get('day')
            if day_num is not None and int(day_num) == max_day:
                brief = record.get('dailyBrief') or record.get('summary') or record.get('headline')
                state = record.get('stateName') or record.get('stateKey') or record.get('jurisdiction')
                psi = record.get('psi') or record.get('psiScore')
                
                if brief and len(brief) > 10 and not "baseline administrative" in brief.lower():
                    clean_text = f"{state.upper()} (PSI {float(psi):.1f}): {brief}" if state and psi is not None else brief
                    if clean_text not in items:
                        items.append(clean_text)
                        
        if not items:
            items = [
                "Diploman Times Subnational Governance &amp; Policy Intelligence Archive.",
                "Tracking Policy Signals and Public Order Strain Across 37 Jurisdictions."
            ]
            
        ticker_payload = {"items": items}
        
        with open("ticker.json", "w", encoding="utf-8") as out_f:
            json.dump(ticker_payload, out_f, indent=2)
            
        print(f"Successfully generated latest day (Day {max_day}) ticker JSON with {len(items)} headlines.")
        
    except Exception as e:
        print(f"Error generating latest day ticker JSON: {e}")

if __name__ == "__main__":
    generate_latest_day_ticker()
    
    # Safely commit and push ticker.json updates
    try:
        subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"], check=True)
        
        # Check if ticker.json has actual modifications
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
