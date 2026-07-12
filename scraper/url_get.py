# scraper/url_get.py
from datetime import datetime, timedelta
import re
import sys

import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

HUB_URL = "https://www.cnet.com/feature/daily-puzzle-answers/"

# Matches both the old /tech/gaming/... path and the new /tech/... path,
# and both "today's" and "todays" spellings, since CNET has served both
# variants inconsistently.
MINI_LINK_RE = re.compile(
    r"https://www\.cnet\.com/tech/(?:gaming/)?todays?-nyt-mini-crossword-answers-for-[a-z0-9\-]+/?",
    re.IGNORECASE,
)

MONTHS = {
    1: "jan", 2: "feb", 3: "march", 4: "april", 5: "may", 6: "june",
    7: "july", 8: "aug", 9: "sept", 10: "oct", 11: "nov", 12: "dec",  # CNET uses "sept", not "sep"
}

PATH_VARIANTS = ["tech", "tech/gaming"]


def _candidate_urls_for_date(date) -> list:
    month_str = MONTHS[date.month]
    day = date.day
    weekday = date.strftime("%A").lower()
    return [
        f"https://www.cnet.com/{path}/todays-nyt-mini-crossword-answers-for-{weekday}-{month_str}-{day}/"
        for path in PATH_VARIANTS
    ]


def make_cnet_url(date=None):
    """
    Builds a best-guess CNET crossword answer URL for a given date
    (defaults to yesterday, since that's usually the safer guess).
    Kept for backwards compatibility / manual testing; find_todays_mini_url()
    is the one actually used by run.py.
    """
    if date is None:
        date = datetime.today() - timedelta(1)
    return _candidate_urls_for_date(date)[0]


def find_todays_mini_url() -> str:
    """
    CNET's URL slug has proven unstable on two independent axes:
      - the path segment (sometimes /tech/gaming/..., sometimes /tech/...)
      - the weekday name in the slug (has been off-by-one from the real
        calendar weekday before)
    Rather than bet on one guess, build every plausible candidate (both
    path variants x both date offsets) and use whichever one actually
    resolves with a 200. Falls back to scraping CNET's hub page if none
    of the candidates work.
    """
    today = datetime.today()
    candidates = []
    for offset in (0, 1):  # try today, then yesterday (publish-day offset)
        candidates.extend(_candidate_urls_for_date(today - timedelta(offset)))

    for url in candidates:
        try:
            resp = requests.head(url, headers=HEADERS, timeout=10, allow_redirects=True)
            print(f"[i] HEAD {url} -> {resp.status_code}")
            if resp.status_code == 200:
                return url
        except requests.RequestException as e:
            print(f"[-] Error checking {url}: {e}")

    print("[-] None of the guessed URLs worked, falling back to hub page scrape")

    try:
        resp = requests.get(HUB_URL, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        matches = MINI_LINK_RE.findall(resp.text)
        if matches:
            print(f"[i] Found Mini Crossword link on hub page: {matches[0]}")
            return matches[0]
        print("[-] No Mini Crossword link found on hub page either")
    except requests.RequestException as e:
        print(f"[-] Could not fetch hub page ({e})")

    # Nothing worked -- return the first candidate anyway so the caller gets
    # a real 404 (and a clear traceback) rather than a confusing None.
    return candidates[0]


if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            date = datetime.strptime(sys.argv[1], "%Y-%m-%d")
        except ValueError:
            print("Please provide date as YYYY-MM-DD")
            sys.exit(1)
        print(make_cnet_url(date))
    else:
        print(find_todays_mini_url())
