# scraper/url_get.py
from datetime import datetime
import re
import sys
from datetime import timedelta

import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

HUB_URL = "https://www.cnet.com/feature/daily-puzzle-answers/"

# Matches both the old /tech/gaming/... path and the new /tech/... path,
# and both "today's" and "todays" spellings, since CNET has changed all of
# these before without warning.
MINI_LINK_RE = re.compile(
    r"https://www\.cnet\.com/tech/(?:gaming/)?todays?-nyt-mini-crossword-answers-for-[a-z0-9\-]+/?",
    re.IGNORECASE,
)


def find_todays_mini_url() -> str:
    """
    CNET's URL slug (both the path segment and the weekday name inside it)
    has changed / been inconsistent more than once, so guessing the URL from
    today's date is fragile. Instead, scrape CNET's own daily-puzzle-answers
    hub page and pull the real Mini Crossword link straight out of it.
    Falls back to make_cnet_url() (date-guessing) if that doesn't work.
    """
    try:
        resp = requests.get(HUB_URL, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        matches = MINI_LINK_RE.findall(resp.text)
        if matches:
            print(f"[i] Found Mini Crossword link on hub page: {matches[0]}")
            return matches[0]
        print("[-] No Mini Crossword link found on hub page, falling back to guessed URL")
    except requests.RequestException as e:
        print(f"[-] Could not fetch hub page ({e}), falling back to guessed URL")

    return make_cnet_url()


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

    return f"https://www.cnet.com/tech/todays-nyt-mini-crossword-answers-for-{weekday}-{month_str}-{day}/"

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
