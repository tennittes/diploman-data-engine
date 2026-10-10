import re

def resolve_iso_week_window(target_week_input):
    """
    Parses input strings like 'Week 41 (OCT 09) [CURRENT]' or 'Week 40 (OCT 02)'
    and derives the exact ISO Monday-to-Friday (5-day) reporting window.
    """
    today = datetime.date.today()
    iso_year = today.year

    # Extract the week number integer using regex
    match = re.search(r'Week\s+(\d+)', target_week_input, re.IGNORECASE)
    if match:
        iso_week = int(match.group(1))
    else:
        # Fallback to current calendar week if unparsed
        _, iso_week, _ = today.isocalendar()

    # Derive Monday (ISO weekday 1) and Friday (ISO weekday 5)
    monday_date = datetime.date.fromisocalendar(iso_year, iso_week, 1)
    friday_date = datetime.date.fromisocalendar(iso_year, iso_week, 5)

    return iso_year, iso_week, monday_date, friday_date
