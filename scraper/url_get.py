# scraper/url_get.py
from datetime import datetime
import sys
from datetime import timedelta

def make_cnet_url(date=None):
    """
    Builds the CNET crossword answer URL for a given date.
    If no date is passed, defaults to today.
    """
    from datetime import datetime

    MONTHS = {
        1: "jan",
        2: "feb",
        3: "march",
        4: "april",
        5: "may",
        6: "june",
        7: "july",
        8: "aug",
        9: "sept",   # 👈 CNET uses "sept", not "sep"
        10: "oct",
        11: "nov",
        12: "dec",
    }

    today = datetime.today() - timedelta(1) # you can change to .today() if you want local time
    month_str = MONTHS[today.month]
    day = today.day
    weekday = today.strftime("%A").lower()  # monday, tuesday, etc.

    return f"https://www.cnet.com/tech/gaming/todays-nyt-mini-crossword-answers-for-{weekday}-{month_str}-{day}/"

if __name__ == "__main__":
    # If you pass a date as YYYY-MM-DD, use that, otherwise default to today
    if len(sys.argv) > 1:
        try:
            date = datetime.strptime(sys.argv[1], "%Y-%m-%d")
        except ValueError:
            print("Please provide date as YYYY-MM-DD")
            sys.exit(1)
        print(make_cnet_url(date))
    else:
        print(make_cnet_url())
