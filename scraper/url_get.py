# scraper/url_get.py
from datetime import datetime
import sys
from datetime import timedelta

def make_cnet_url(date=None):
    """
    Builds the CNET crossword answer URL for a given date.
    If no date is passed, defaults to today.
    """
    if date is None:
        date = datetime.today() #- timedelta(days = 1)
    
    weekday = date.strftime("%A").lower()      # e.g. "saturday"
    month_abbrev = date.strftime("%b").lower() # e.g. "aug"
    day = str(int(date.strftime("%d")))        # remove leading 0

    url = f"https://www.cnet.com/tech/gaming/todays-nyt-mini-crossword-answers-for-{weekday}-{month_abbrev}-{day}/"
    return url

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