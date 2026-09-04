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


ANSWER_TOKEN_RE = re.compile(r"^[A-Z]{2,}$")
NOISE_TOKENS = {"REVEAL", "HINTS", "REVEALALL", "ACROSS", "DOWN"}


def _extract_clues_single_stage(soup: BeautifulSoup) -> List[Dict]:
    """Walk the DOM in document order (same robust approach as
    _extract_clue_list): for each '1A' label, find the next clue link,
    then keep scanning forward for the first plausible all-caps answer
    token before hitting the next position label. This tolerates minor
    HTML differences around individual clues (e.g. the boundary clue
    between the Across and Down sections) that broke a stricter
    'answer immediately before the word Reveal' regex before."""
def _extract_clues_single_stage(soup: BeautifulSoup) -> List[Dict]:
    """Stream through the page word-by-word (not node-by-node -- text can
    be split across DOM nodes in ways that vary per clue, which is what
    broke an earlier, more rigid version of this). State machine:
      idle -> saw a '1A'-style token -> pos_found
      pos_found -> accumulate words until literal 'Crossword Clue' -> clue_found
      clue_found -> first all-caps 2+ letter word starts the answer -> answer_found
      answer_found -> keep appending consecutive all-caps words (multi-word
                       answers like "TEAM GOAL") until noise/next clue
    """
    clues = []
    pending_pos = None
    pending_clue_words: List[str] = []
    clue_text = ""
    answer_words: List[str] = []
    state = "idle"

    def emit():
        if pending_pos and answer_words:
            clues.append({"position": pending_pos, "clue": clue_text, "answer": " ".join(answer_words)})

    for node in soup.descendants:
        if not isinstance(node, NavigableString):
            continue
        for w in str(node).split():
            if POS_RE.match(w):
                if state == "answer_found":
                    emit()
                pending_pos = w
                pending_clue_words = []
                answer_words = []
                state = "pos_found"
                continue

            if state == "pos_found":
                pending_clue_words.append(w)
                if (w.rstrip(".,!?") == "Clue" and len(pending_clue_words) >= 2
                        and pending_clue_words[-2].rstrip(".,!?") == "Crossword"):
                    clue_text = " ".join(pending_clue_words[:-2]).strip()
                    state = "clue_found"
                continue

            token = w.upper().strip(".,!?\"'\u2018\u2019\u201c\u201d")

            if state == "clue_found":
                if token in NOISE_TOKENS or not token:
                    continue
                if ANSWER_TOKEN_RE.match(token):
                    answer_words = [token]
                    state = "answer_found"
                continue

            if state == "answer_found":
                if token in NOISE_TOKENS or not token:
                    emit()
                    pending_pos = None
                    answer_words = []
                    state = "idle"
                elif ANSWER_TOKEN_RE.match(token):
                    answer_words.append(token)
                else:
                    emit()
                    pending_pos = None
                    answer_words = []
                    state = "idle"
                continue

    if state == "answer_found":
        emit()

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
    all_stubs = _extract_clue_list(soup)  # position+clue+url for every clue on the page

    fast_positions = {c["position"] for c in fast_clues}
    all_positions = {s["position"] for s in all_stubs}
    missing_positions = all_positions - fast_positions

    print(f"[+] Fast path: found {len(fast_clues)}/{len(all_positions)} clues with answers "
          f"directly on the main page", flush=True)
    if missing_positions:
        print(f"[-] Fast path missing: {sorted(missing_positions)} -- will fetch these "
              f"individually", flush=True)

    if not fast_clues:
        print("[-] Fast path found nothing at all (site may be gating answers behind "
              "the reveal widget) -- falling back to per-clue page scrape for everything", flush=True)
        missing_positions = all_positions  # fetch every clue the slow way

    clues = list(fast_clues)
    missing_stubs = [s for s in all_stubs if s["position"] in missing_positions]

    for i, stub in enumerate(missing_stubs):
        if i > 0:
            time.sleep(0.8)  # throttle -- avoid tripping the rate limiter
        try:
            r2 = _get_with_retry(session, stub["url"], attempts=3, base_delay=3)
            page_text = BeautifulSoup(r2.text, "html.parser").get_text(" ")
            answer = _extract_answer(page_text)
            if not answer:
                print(f"[-] No answer found on {stub['url']}", flush=True)
                continue
            clues.append({"position": stub["position"], "clue": stub["clue"], "answer": answer})
            print(f"[i] (fallback) {stub['position']}: {stub['clue']!r} -> {answer}", flush=True)
        except requests.RequestException as e:
            print(f"[-] Error fetching {stub['url']}: {e}", flush=True)

    print(f"[+] Found {len(clues)}/{len(all_positions)} total clues with answers", flush=True)
    return {"clues": clues}


if __name__ == "__main__":
    from url_get import find_todays_mini_url
    print(fetch_crossword(find_todays_mini_url()))
