# scraper/fetch_crossword.py
import re
import requests
from bs4 import BeautifulSoup
from typing import Dict, List, Optional

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Matches lines like:
#   1 Across: Postponed, with "off" – PUT
#   3 Down: Texter's sign-off – TTYL (Talk to you later)
# Forbes' hints section has the same format but with a single-letter answer
# (e.g. "– P"), so requiring 2+ letters here automatically skips hints and
# only picks up the real answers section.
CLUE_RE = re.compile(
    r"""^\s*(?P<num>\d+)\s*(?P<dir>Across|Down)\s*:\s*(?P<clue>.+?)\s*[-\u2013\u2014]\s*(?P<answer>[A-Z]{2,}(?:\s[A-Z]+)*)\b"""
)

# Used to find the completed-grid screenshot, e.g.
# "Completed New York Times Mini crossword for Monday, June 15"
CAPTION_RE = re.compile(r"completed.*(mini|crossword)", re.IGNORECASE)


def _extract_clues(soup: BeautifulSoup) -> List[Dict]:
    clues: List[Dict] = []
    seen = set()
    for tag in soup.find_all(["p", "li"]):
        text = " ".join(tag.stripped_strings)
        if not text:
            continue
        m = CLUE_RE.match(text)
        if not m:
            continue
        pos = f"{m.group('num')}{m.group('dir')[0].upper()}"
        if pos in seen:
            continue
        seen.add(pos)
        clues.append({
            "position": pos,
            "clue": m.group("clue").strip().strip("\u201c\u201d\"' "),
            "answer": m.group("answer").strip().upper(),
        })
    return clues


def _find_crossword_image_url(soup: BeautifulSoup) -> Optional[str]:
    for figure in soup.find_all("figure"):
        caption = figure.find("figcaption")
        cap_text = caption.get_text(" ", strip=True) if caption else ""
        if CAPTION_RE.search(cap_text):
            img = figure.find("img")
            if img:
                url = img.get("data-src") or img.get("src")
                if url:
                    return url

    # Fallback: any <img> whose alt text matches the same pattern
    img = soup.find("img", alt=lambda a: bool(a) and CAPTION_RE.search(a))
    if img:
        url = img.get("data-src") or img.get("src")
        if url:
            return url

    # Last resort: og:image meta tag. Probably a generic thumbnail rather
    # than the actual completed grid, but logged clearly so it's obvious
    # if this path gets used.
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        print("[-] Using og:image fallback -- this is likely NOT the actual "
              "completed grid screenshot, just a generic thumbnail", flush=True)
        return og["content"]

    return None


def fetch_crossword(url: str, download_image: bool = False) -> Dict:
    resp = requests.get(url, headers=HEADERS, timeout=15)
    print(f"[i] GET {url} -> status {resp.status_code}, {len(resp.text)} bytes", flush=True)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    image_url = _find_crossword_image_url(soup)
    clues = _extract_clues(soup)

    if download_image and image_url:
        img_bytes = requests.get(image_url, headers=HEADERS, timeout=15).content
        with open("crossword.png", "wb") as f:
            f.write(img_bytes)
        print(f"[+] Saved crossword.png from {image_url}", flush=True)

    print(f"[+] Found {len(clues)} clues", flush=True)

    if not image_url or not clues:
        print("[-] Could not find image and/or clues. First 2000 chars of response:", flush=True)
        print(soup.prettify()[:2000], flush=True)

    return {"image_url": image_url, "clues": clues}


if __name__ == "__main__":
    from url_get import make_forbes_url
    from datetime import datetime
    url = make_forbes_url(datetime(2026, 6, 15))
    print(fetch_crossword(url))
