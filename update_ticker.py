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
    Parses the current month's master-data.json strictly targeting the B1 stream,
    filters for active official jurisdictions, sanitizes text, and exports to ticker.json.
    """
    items = []
    
    # Target current active month explicitly based on system repository structure
    now = datetime.now()
    current_month_key = f"{now.strftime('%b').lower()}{now.year}" # e.g. nov2026
    
    target_master = f"{current_month_key}/master-data.json"
    if not os.path.exists(target_master):
        # Fallback: find all master-data.json files and sort them chronologically
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
            
        # Target strictly the B1 telemetry stream
        b1_source = payload.get("globalCodeData_B1") or payload.get("B1") or payload.get("b1")
        if not b1_source:
            # Fallback to checking root payload if B1 key isn't isolated
            b1_source = payload

        all_records = []
        
        # Helper to process B1 day groups safely
        def add_record_to_list(d_num, item):
            if not isinstance(item, dict):
                return
            # Ensure day number is tagged onto the record if missing
            if 'dayNumber' not in item and 'day' not in item:
                item['dayNumber'] = d_num
            all_records.append(item)

        if isinstance(b1_source, dict):
            for key, day_data in b1_source.items():
                try:
                    d_num = int(key)
                    if day_data:
                        if isinstance(day_data, list):
                            for it in day_data:
                                add_record_to_list(d_num, it)
                        elif isinstance(day_data, dict):
                            sub_list = day_data.get('jurisdictions') or day_data.get('states')
                            if isinstance(sub_list, list):
                                for it in sub_list:
                                    add_record_to_list(d_num, it)
                            else:
                                add_record_to_list(d_num, day_data)
                except ValueError:
                    # Key is not a day number (e.g., metadata keys), ignore
                    continue
        elif isinstance(b1_source, list):
            for item in b1_source:
                if isinstance(item, dict):
                    d_num = item.get('dayNumber') or item.get('day') or 1
                    add_record_to_list(d_num, item)

        # Find the maximum day number available in B1 stream
        max_day = 0
        for record in all_records:
            day_num = record.get('dayNumber') or record.get('day')
            if day_num is not None:
                try:
                    d_int = int(day_num)
                    if d_int > max_day:
                        max_day = d_int
        
        print(f"Detected latest active B1 telemetry day number: {max_day}")

        # Extract headlines strictly for that highest (latest) day number & active jurisdictions
        for record in all_records:
            day_num = record.get('dayNumber') or record.get('day')
            if day_num is not None and int(day_num) == max_day:
                
                # 1. Validate state name and ensure it belongs to the 37 official jurisdictions
                state = record.get('stateName') or record.get('stateKey') or record.get('jurisdiction') or record.get('state')
                if not state:
                    continue
                
                clean_state = str(state).strip().upper()
                is_valid_jurisdiction = any(v.upper() == clean_state for v in MASTER_JURISDICTIONS)
                if not is_valid_jurisdiction:
                    continue
                
                # 2. Explicitly skip if status is marked dormant, inactive, or suspended
                status = str(record.get('status', '')).lower()
                if status in ['dormant', 'inactive', 'suspended']:
                    continue

                brief = record.get('dailyBrief') or record.get('summary') or record.get('headline')
                psi = record.get('psi') or record.get('psiScore')
                
                if brief and len(str(brief)) > 10 and not "baseline administrative" in str(brief).lower():
                    # Sanitize text: strip leading/trailing whitespace and remove stray quotation/citation marks
                    clean_brief = str(brief).strip().strip('"\'“”‘’')
                    
                    # Safely parse PSI value
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
        
        with open("ticker.json", "w", encoding="utf-8") as out_f:
            json.dump(ticker_payload, out_f, indent=2, ensure_ascii=False)
            
        print(f"Successfully generated latest B1 day (Day {max_day}) active ticker JSON with {len(items)} headlines.")
        
    except Exception as e:
        print(f"Error generating B1 ticker JSON: {e}")

if __name__ == "__main__":
    generate_latest_day_ticker()
    
    # Safely commit and push ticker.json updates
    try:
        subprocess.run(["git", "config", "user.name", "github-actions[bot]"], check=True)
        subprocess.run(["git", "config", "user.email", "github-actions[bot]@users.noreply.github.com"], check=True)
        
        status_result = subprocess.run(["git", "status", "--porcelain", "ticker.json"], capture_output=True, text=True, check=True)
        if status_result.stdout.strip():
            subprocess.run(["git", "add", "ticker.json"], check=True)
            subprocess.run(["git", "commit", "-m", "auto: update ticker.json from latest B1 active telemetry [skip ci]"], check=True)
            subprocess.run(["git", "push"], check=True)
            print("Successfully pushed isolated ticker.json update to repository.")
        else:
            print("No changes detected in ticker.json; git commit/push skipped.")
    except Exception as e:
        print(f"Note: Git auto-commit skipped or failed: {e}")
