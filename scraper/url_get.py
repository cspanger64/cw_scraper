# scraper/url_get.py
from datetime import datetime, timedelta
import sys

import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

# Forbes' NYT Mini recap has (so far) been consistently written by Kris Holt.
# If Forbes rotates authors again in the future, this is the one thing that
# would need updating.
FORBES_AUTHOR = "krisholt"


def _slug_for_date(date) -> str:
    weekday = date.strftime("%A").lower()
    month = date.strftime("%B").lower()
    day = date.day
    return f"nyt-mini-crossword-answers-{weekday}-{month}-{day}"


def make_forbes_url(date) -> str:
    """
    Builds the Forbes NYT Mini answers URL for a given puzzle date.
    Forbes publishes the article the evening before the puzzle's date, so the
    URL's date path (year/month/day) is one day earlier than the puzzle date
    itself, while the slug uses the puzzle's actual date, e.g.:
      puzzle for Monday June 15, 2026 ->
      https://www.forbes.com/sites/krisholt/2026/06/14/nyt-mini-crossword-answers-monday-june-15/
    """
    publish_date = date - timedelta(1)
    slug = _slug_for_date(date)
    return (
        f"https://www.forbes.com/sites/{FORBES_AUTHOR}/"
        f"{publish_date.year}/{publish_date.month:02d}/{publish_date.day:02d}/"
        f"{slug}/"
    )


def find_todays_mini_url() -> str:
    """
    Tries today's date first. Since GitHub Actions runs in UTC and Forbes
    publishes in US time, also tries yesterday/tomorrow as a safety net for
    timezone edge cases right around midnight.
    """
    today = datetime.today()
    candidates = [make_forbes_url(today - timedelta(days=d)) for d in (0, -1, 1)]

    for url in candidates:
        try:
            resp = requests.head(url, headers=HEADERS, timeout=10, allow_redirects=True)
            print(f"[i] HEAD {url} -> {resp.status_code}", flush=True)
            if resp.status_code == 200:
                return url
        except requests.RequestException as e:
            print(f"[-] Error checking {url}: {e}", flush=True)

    print("[-] None of the guessed URLs worked, returning today's guess anyway "
          "so the caller gets a real error to diagnose", flush=True)
    return candidates[0]


if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            date = datetime.strptime(sys.argv[1], "%Y-%m-%d")
        except ValueError:
            print("Please provide date as YYYY-MM-DD", flush=True)
            sys.exit(1)
        print(make_forbes_url(date), flush=True)
    else:
        print(find_todays_mini_url(), flush=True)
