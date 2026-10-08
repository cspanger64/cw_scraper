# scraper/fetch_crossword.py
#
# dazepuzzle.com has flip-flopped on whether the main listing page shows
# answers as plain text or hides them behind an interactive "reveal"
# widget (?  placeholders). Rather than assume one or the other, this
# tries the fast single-page extraction first (answer sits right after
# the clue link, before the word "Reveal"), and only falls back to the
# slower per-clue-page scrape (an SEO FAQ block states the answer even
# when the widget hides it) for any specific clue the fast path missed.
#
# One more wrinkle: on themed puzzles with "linked" clues (e.g. "1A: With
# 6- and 8-Across, ..."), the site sometimes omits the secondary clue's
# own position label ("6A") entirely -- no number anywhere near its
# answer. When that happens we still capture the orphaned clue+answer
# pair, then recover its number (and direction) by cross-referencing
# other clues' text for the standard crossword convention of citing
# "N-Across"/"N-Down" by name.
import re
import time
import requests
from bs4 import BeautifulSoup, NavigableString
from typing import Dict, List, Optional

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
ANSWER_TOKEN_RE = re.compile(r"^[A-Z]{2,}$")
NOISE_TOKENS = {"REVEAL", "HINTS", "REVEALALL", "ACROSS", "DOWN"}

# "6-Across", "6 Across", "6-Down", and the shared-reference form
# "6- and 8-Across" (both numbers refer to "Across") -- as clues
# conventionally cite each other by number. Used to recover a missing
# position label.
CROSS_REF_RE = re.compile(
    r"((?:\d+-\s*(?:and\s+|,\s*)?)+)(Across|Down)",
    re.IGNORECASE,
)


def _find_cross_refs(text: str):
    """Yields (num, direction) for every reference found, including
    shared ones like '6- and 8-Across' -> (6, Across), (8, Across)."""
    for nums_part, direction in CROSS_REF_RE.findall(text or ""):
        for num in re.findall(r"\d+", nums_part):
            yield num, direction

ANSWER_RE = re.compile(
    r"""most\s+(?:common\s+and\s+recent|recent|common)\s+\d+-letter\s+answer\s+for\s+".*?"\s+is\s+
        (?P<answer>[A-Z]+(?:\s[A-Z]+)*)\.""",
    re.VERBOSE,
)
ANSWER_RE_FALLBACK = re.compile(
    r"""\d+-letter\s+answer\s+to\s+.*?\s+is\s+(?P<answer>[A-Z]+(?:\s[A-Z]+)*)\.""",
    re.VERBOSE,
)


def _all_words(soup: BeautifulSoup) -> List[str]:
    words: List[str] = []
    for node in soup.descendants:
        if isinstance(node, NavigableString):
            words.extend(str(node).split())
    return words


def _extract_clue_answer_pairs(soup: BeautifulSoup, want_url: bool) -> List[Dict]:
    """
    One shared word-stream walk used by both the fast path (answers) and
    the clue-link list (urls). For each '... Crossword Clue' phrase: grabs
    the clue text, whichever position label most recently preceded it (or
    None if there wasn't one -- an orphaned linked-clue case), and either
    the run of all-caps word(s) that follow as the answer, or the href of
    the clue's link, depending on `want_url`.

    Every consumed token (including noise words like "Reveal"/"Hints") is
    always advanced past exactly once -- never left for the next clue's
    buffer to accidentally re-absorb.
    """
    words = _all_words(soup)
    anchors = [a for a in soup.find_all("a") if "Crossword Clue" in a.get_text(" ", strip=True)]
    anchor_i = 0

    n = len(words)
    clues: List[Dict] = []
    pending_pos: Optional[str] = None
    buffer: List[str] = []
    i = 0

    while i < n:
        w = words[i]

        if POS_RE.match(w):
            pending_pos = w
            buffer = []
            i += 1
            continue

        if w.upper().strip(".,!?") in NOISE_TOKENS:
            i += 1
            continue

        buffer.append(w)
        i += 1
        is_clue_end = (
            w.rstrip(".,!?") == "Clue"
            and len(buffer) >= 2
            and buffer[-2].rstrip(".,!?") == "Crossword"
        )
        if not is_clue_end:
            continue

        clue_text = " ".join(buffer[:-2]).strip()
        this_pos = pending_pos
        pending_pos = None
        buffer = []

        href = anchors[anchor_i].get("href") if anchor_i < len(anchors) else None
        anchor_i += 1

        # Always walk past this clue's answer/noise region (in BOTH modes),
        # so none of it leaks into the next clue's text buffer.
        answer_words: List[str] = []
        while i < n:
            raw = words[i].strip("\"'\u2018\u2019\u201c\u201d.,!?")
            if POS_RE.match(words[i]):
                break  # next clue's label -- leave it for the outer loop
            if not raw or raw.upper() in NOISE_TOKENS:
                i += 1
                if answer_words:
                    break
                continue
            # answers are printed ALL CAPS; mixed-case words are the start of
            # the next (possibly unlabeled) clue's text, so don't consume them
            if raw.isupper() and ANSWER_TOKEN_RE.match(raw):
                answer_words.append(raw)
                i += 1
                continue
            break

        if want_url:
            clues.append({"position": this_pos, "clue": clue_text, "url": href})
        elif answer_words:
            clues.append({
                "position": this_pos,
                "clue": clue_text,
                "answer": " ".join(answer_words),
            })

    return clues


def _extract_clues_single_stage(soup: BeautifulSoup) -> List[Dict]:
    return _extract_clue_answer_pairs(soup, want_url=False)


def _extract_clue_list(soup: BeautifulSoup) -> List[Dict]:
    return _extract_clue_answer_pairs(soup, want_url=True)


def _recover_missing_positions(clues: List[Dict]) -> List[Dict]:
    """Fill in position for any clue whose label was missing on the page,
    by finding the one 'N-Across'/'N-Down' reference (in any clue's text)
    that isn't already claimed by a positioned clue."""
    known = {c["position"] for c in clues if c["position"]}
    referenced = set()
    for c in clues:
        for num, direction in _find_cross_refs(c["clue"]):
            referenced.add(f"{num}{direction[0].upper()}")
    candidates = sorted(referenced - known)

    orphans = [c for c in clues if not c["position"]]
    if orphans and not candidates:
        print(f"[-] {len(orphans)} clue(s) with no position label and no "
              f"cross-reference to recover it from: {[o['clue'] for o in orphans]}", flush=True)

    for orphan in orphans:
        if candidates:
            assigned = candidates.pop(0)
            orphan["position"] = assigned
            print(f"[i] Recovered missing position for {orphan['clue']!r} -> {assigned} "
                  f"(via cross-reference in another clue)", flush=True)
        else:
            print(f"[-] Could not recover a position for {orphan['clue']!r} -- dropping it", flush=True)

    return [c for c in clues if c["position"]]


def _extract_answer(text: str):
    m = ANSWER_RE.search(text)
    if not m:
        m = ANSWER_RE_FALLBACK.search(text)
    return m.group("answer").strip().upper() if m else None


def _log_block_evidence(resp):
    """Print whatever actually identifies the block, instead of just
    guessing from the status code."""
    interesting_headers = ["server", "cf-ray", "cf-mitigated", "retry-after",
                            "x-sucuri-id", "x-sucuri-cache", "x-cache"]
    found = {h: resp.headers[h] for h in interesting_headers if h in resp.headers}
    if found:
        print(f"[i] Response headers of note: {found}", flush=True)
    else:
        print("[i] No Cloudflare/Sucuri/etc fingerprint headers present", flush=True)
    snippet = resp.text[:800].replace("\n", " ")
    print(f"[i] Response body snippet: {snippet!r}", flush=True)


def _get_with_retry(session, url, attempts=4, base_delay=3):
    last_exc = None
    last_resp = None
    for i in range(attempts):
        try:
            resp = session.get(url, timeout=15)
            last_resp = resp
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

    if last_resp is not None:
        print("[-] All attempts failed -- logging evidence from the last response:", flush=True)
        _log_block_evidence(last_resp)
    raise last_exc


def fetch_crossword(url: str) -> Dict:
    session = requests.Session()
    session.headers.update(HEADERS)

    resp = _get_with_retry(session, url)
    soup = BeautifulSoup(resp.text, "html.parser")

    fast_clues = _recover_missing_positions(_extract_clues_single_stage(soup))
    all_stubs = _recover_missing_positions(_extract_clue_list(soup))

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
        missing_positions = all_positions

    clues = list(fast_clues)
    missing_stubs = [s for s in all_stubs if s["position"] in missing_positions]

    for i, stub in enumerate(missing_stubs):
        if i > 0:
            time.sleep(0.8)
        if not stub.get("url"):
            print(f"[-] No link URL available for {stub['position']}, can't fetch it individually", flush=True)
            continue
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
