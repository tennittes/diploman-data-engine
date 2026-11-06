import os
import json
import glob
import subprocess
from datetime import datetime

# Official list of 37 valid Nigerian jurisdictions
MASTER_JURISDICTIONS = [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", 
    "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", 
    "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", 
    "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", 
    "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT Abuja"
]

def generate_latest_day_ticker():
    """
    Parses the current month's master-data.json safely, handles chronological folder sorting,
    filters strictly for active jurisdictions, and exports to ticker.json.
    """
    items = []
    
    now = datetime.now()
    current_month_key = f"{now.strftime('%b').lower()}{now.year}"
    
    target_master = f"{current_month_key}/master-data.json"
    if not os.path.exists(target_master):
        master_files = glob.glob("**/master-data.json", recursive=True)
        if not master_files:
            print("No master-data.json found for ticker generation.")
            return
        
        def parse_folder_date(filepath):
            parts = filepath.split(os.sep)
            for part in parts:
                if len(part) >= 5:
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
        
        # Robust payload flattener for multi-stream objects
        def extract_records(node):
            if isinstance(node, list):
                for item in node:
                    extract_records(item)
            elif isinstance(node, dict):
                if any(k in node for k in ('state', 'stateName', 'jurisdiction', 'stateKey', 'dailyBrief', 'summary', 'headline')):
                    all_records.append(node)
                for val in node.values():
                    if isinstance(val, (list, dict)):
                        extract_records(val)

        extract_records(payload)
        
    except Exception as e:
        print(f"Error reading or parsing master telemetry JSON: {e}")
        return

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
    
    print(f"Detected latest active telemetry day number: {max_day}")

    # Extract headlines strictly for that highest (latest) day number & active jurisdictions
    for record in all_records:
        if not isinstance(record, dict):
            continue
        
        day_num = record.get('dayNumber') or record.get('day')
        if day_num is not None and int(day_num) == max_day:
            
            state = record.get('stateName') or record.get('stateKey') or record.get('jurisdiction') or record.get('state')
            if not state:
                continue
            
            clean_state = str(state).strip().upper()
            is_valid_jurisdiction = any(v.upper() == clean_state for v in MASTER_JURISDICTIONS)
            if not is_valid_jurisdiction:
                continue
            
            status = str(record.get('status', '')).lower()
            if status in ['dormant', 'inactive', 'suspended']:
                continue

            brief = record.get('dailyBrief') or record.get('summary') or record.get('headline')
            psi = record.get('psi') or record.get('psiScore')
            
            if brief and len(str(brief)) > 10 and not "baseline administrative" in str(brief).lower():
                clean_brief = str(brief).strip().strip('"\'“”‘’')
                
                psi_val = None
                if psi is not None and str(psi).strip() != "":
                    try:
                        psi_val = float(psi)
                    except ValueError:
                        pass

                clean_text = f"{clean_state} (PSI {psi_val:.1f}): {clean_brief}" if psi_val is not None else f"{clean_state}: {clean_brief}"
                
                if clean_text not in items:
                    items.append(clean_text)
                    
    if not items:
        items = [
            "Diploman Times Subnational Governance & Policy Intelligence Archive.",
            "Tracking Policy Signals and Public Order Strain Across Active Jurisdictions."
        ]
        
    ticker_payload = {"items": items}
    
    try:
        with open("ticker.json", "w", encoding="utf-8") as out_f:
            json.dump(ticker_payload, out_f, indent=2, ensure_ascii=False)
        print(f"Successfully generated latest day (Day {max_day}) active ticker JSON with {len(items)} headlines.")
    except Exception as e:
        print(f"Error writing ticker.json: {e}")

if __name__ == "__main__":
    generate_latest_day_ticker()
    
    try:
        subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"], check=True)
        
        status_result = subprocess.run(["git", "status", "--porcelain", "ticker.json"], capture_output=True, text=True, check=True)
        if status_result.stdout.strip():
            subprocess.run(["git", "add", "ticker.json"], check=True)
            subprocess.run(["git", "commit", -m, "auto: update ticker.json from latest active telemetry [skip ci]"], check=True)
            subprocess.run(["git", "push"], check=True)
            print("Successfully pushed isolated ticker.json update to repository.")
        else:
            print("No changes detected in ticker.json; git commit/push skipped.")
    except Exception as e:
        print(f"Note: Git auto-commit skipped or failed: {e}")
