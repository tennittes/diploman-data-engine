import os
import json
import glob
import subprocess

def generate_latest_day_ticker():
    """
    Parses master-data.json, finds the highest dayNumber available in the dataset,
    extracts the headlines/briefs for that latest day, and exports them directly to ticker.json.
    """
    items = []
    master_files = sorted(glob.glob("**/master-data.json", recursive=True))
    if not master_files:
        print("No master-data.json found for ticker generation.")
        return

    target_master = master_files[-1]
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
            
        # Find the maximum day number available (B1 / peak dayNumber)
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
    
    # Commit and push ticker.json independently
    try:
        subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"], check=True)
        if os.path.exists("ticker.json"):
            subprocess.run(["git", "add", "ticker.json"], check=True)
        subprocess.run(["git", "commit", "-m", "auto: update ticker.json from latest telemetry [skip ci]"], check=True)
        subprocess.run(["git", "push"], check=True)
        print("Successfully pushed isolated ticker.json update to repository.")
    except Exception as e:
        print(f"Note: Git auto-commit skipped or failed: {e}")
