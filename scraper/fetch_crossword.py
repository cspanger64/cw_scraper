# scraper/fetch_crossword.py
#
# dazepuzzle.com has flip-flopped on whether the main listing page shows
# answers as plain text or hides them behind an interactive "reveal"
# widget (?  placeholders). Rather than assume one or the other, this
# tries the fast single-page extraction first (answer sits right after
# the clue link, before the word "Reveal"), and only falls back to the
# slower per-clue-page scrape (an SEO FAQ block states the answer even
# when the widget hides it) if that comes up empty.
import re
import time
import requests
from bs4 import BeautifulSoup, NavigableString
from typing import Dict, List

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Referer": "https://www.google.com/",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "sec-ch-ua": '"Chromium";v="126", "Not.A/Brand";v="24", "Google Chrome";v="126"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}

POS_RE = re.compile(r"^(\d+)([AD])$")

# Fast path: "1A ... Crossword Clue \n LETBE \n Reveal" -- the answer sits
# in plain text right before the literal word "Reveal", when the site
# isn't gating it.
SINGLE_STAGE_RE = re.compile(
    r"""(?P<num>\d+)(?P<dir>[AD])\s*\n+\s*
        (?P<clue>[^\n]+?)\s*Crossword\s*Clue\s*\n+\s*
        (?P<answer>[A-Z]{2,})\s*\n+\s*
        Reveal""",
    re.VERBOSE,
)

ANSWER_RE = re.compile(
    r"""most\s+(?:common\s+and\s+recent|recent|common)\s+\d+-letter\s+answer\s+for\s+".*?"\s+is\s+
        (?P<answer>[A-Z]+(?:\s[A-Z]+)*)\.""",
    re.VERBOSE,
)
# fallback pattern seen elsewhere on the page:
# "5-letter answer to <clue> in NYT Mini Crossword <date> is COOPS."
ANSWER_RE_FALLBACK = re.compile(
    r"""\d+-letter\s+answer\s+to\s+.*?\s+is\s+(?P<answer>[A-Z]+(?:\s[A-Z]+)*)\.""",
    re.VERBOSE,
)


def _extract_clues_single_stage(soup: BeautifulSoup) -> List[Dict]:
    text = soup.get_text("\n")
    clues = []
    seen = set()
    for m in SINGLE_STAGE_RE.finditer(text):
        pos = f"{m.group('num')}{m.group('dir')}"
        if pos in seen:
            continue
        seen.add(pos)
        clues.append({
            "position": pos,
            "clue": m.group("clue").strip().strip("\u201c\u201d\"' "),
            "answer": m.group("answer").strip().upper(),
        })
    return clues


def _extract_clue_list(soup: BeautifulSoup) -> List[Dict]:
    """Walk the page in document order, pairing each bare '1A' text label
    with the very next '... Crossword Clue' link that follows it."""
    clues = []
    pending = None
    for node in soup.descendants:
        if isinstance(node, NavigableString):
            text = node.strip()
            if POS_RE.match(text):
                pending = text
        elif getattr(node, "name", None) == "a" and pending:
            atext = node.get_text(" ", strip=True)
            if "Crossword Clue" in atext:
                clue_text = atext.replace("Crossword Clue", "").strip()
                href = node.get("href")
                if href:
                    clues.append({"position": pending, "clue": clue_text, "url": href})
                pending = None
    return clues


def _extract_answer(text: str):
    m = ANSWER_RE.search(text)
    if not m:
        m = ANSWER_RE_FALLBACK.search(text)
    return m.group("answer").strip().upper() if m else None


def _get_with_retry(session, url, attempts=4, base_delay=3):
    last_exc = None
    for i in range(attempts):
        try:
            resp = session.get(url, timeout=15)
            print(f"[i] GET {url} -> status {resp.status_code}, {len(resp.text)} bytes "
                  f"(attempt {i + 1}/{attempts})", flush=True)
            if resp.status_code == 403 and i < attempts - 1:
                delay = base_delay * (i + 1)
                print(f"[-] Got 403, retrying in {delay}s...", flush=True)
                time.sleep(delay)
                continue
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            last_exc = e
            if i < attempts - 1:
                delay = base_delay * (i + 1)
                print(f"[-] Request error ({e}), retrying in {delay}s...", flush=True)
                time.sleep(delay)
    raise last_exc


def fetch_crossword(url: str) -> Dict:
    session = requests.Session()
    session.headers.update(HEADERS)

    resp = _get_with_retry(session, url)
    soup = BeautifulSoup(resp.text, "html.parser")

    fast_clues = _extract_clues_single_stage(soup)
    if fast_clues:
        print(f"[+] Fast path: found {len(fast_clues)} clues with answers directly "
              f"on the main page (no per-clue fetches needed)", flush=True)
        return {"clues": fast_clues}

    print("[-] Fast path found nothing (site may be gating answers behind "
          "the reveal widget) -- falling back to per-clue page scrape", flush=True)

    clue_stubs = _extract_clue_list(soup)
    print(f"[+] Found {len(clue_stubs)} clue links on main page", flush=True)

    if not clue_stubs:
        print("[-] Could not find any clue links. First 2000 chars of response:", flush=True)
        print(soup.prettify()[:2000], flush=True)
        return {"clues": []}

    clues = []
    for i, stub in enumerate(clue_stubs):
        if i > 0:
            time.sleep(0.8)  # throttle -- this is what was tripping the rate
                              # limiter on Midi's ~27-30 clue pages
        try:
            r2 = _get_with_retry(session, stub["url"], attempts=3, base_delay=3)
            page_text = BeautifulSoup(r2.text, "html.parser").get_text(" ")
            answer = _extract_answer(page_text)
            if not answer:
                print(f"[-] No answer found on {stub['url']}", flush=True)
                continue
            clues.append({"position": stub["position"], "clue": stub["clue"], "answer": answer})
            print(f"[i] {stub['position']}: {stub['clue']!r} -> {answer}", flush=True)
        except requests.RequestException as e:
            print(f"[-] Error fetching {stub['url']}: {e}", flush=True)

    print(f"[+] Found {len(clues)} clues with answers", flush=True)
    return {"clues": clues}


if __name__ == "__main__":
    from url_get import find_todays_mini_url
    print(fetch_crossword(find_todays_mini_url()))
