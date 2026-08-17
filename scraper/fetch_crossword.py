# scraper/fetch_crossword.py
#
# dazepuzzle.com now hides its answer letters behind an interactive
# "reveal" widget (added ~Aug 15 2026), so the main listing page only
# gives us clue text + a link to each clue's own page -- not the answer
# itself. Each individual clue page, however, has an SEO-oriented FAQ
# block that states the answer as plain text (e.g. "The most common and
# recent 5-letter answer for '...' is COOPS."), which is NOT gated behind
# the reveal widget. So this is a two-stage scrape: get the clue list +
# links from the main page, then fetch each clue's page for its answer.
import re
import requests
from bs4 import BeautifulSoup, NavigableString
from typing import Dict, List

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
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


def fetch_crossword(url: str) -> Dict:
    session = requests.Session()
    session.headers.update(HEADERS)

    resp = session.get(url, timeout=15)
    print(f"[i] GET {url} -> status {resp.status_code}, {len(resp.text)} bytes", flush=True)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    clue_stubs = _extract_clue_list(soup)
    print(f"[+] Found {len(clue_stubs)} clue links on main page", flush=True)

    if not clue_stubs:
        print("[-] Could not find any clue links. First 2000 chars of response:", flush=True)
        print(soup.prettify()[:2000], flush=True)
        return {"clues": []}

    clues = []
    for stub in clue_stubs:
        try:
            r2 = session.get(stub["url"], timeout=15)
            r2.raise_for_status()
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
