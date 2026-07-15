# scraper/fetch_crossword.py
import re
import requests
from bs4 import BeautifulSoup
from typing import Dict, List

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# dazepuzzle lays each clue out (in linearized page text) roughly as:
#   1A
#   ___ shrimp (classic oxymoron) Crossword Clue
#   Answer  JUMBO
#   Hint
CLUE_RE = re.compile(
    r"""(?P<num>\d+)(?P<dir>[AD])\s*\n+\s*
        (?P<clue>[^\n]+?)\s*Crossword\s*Clue\s*\n+\s*
        Answer\s+(?P<answer>[A-Z]{2,}(?:\s[A-Z]+)*)""",
    re.VERBOSE,
)


def _extract_clues(soup: BeautifulSoup) -> List[Dict]:
    text = soup.get_text("\n")
    clues = []
    seen = set()
    for m in CLUE_RE.finditer(text):
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


def fetch_crossword(url: str) -> Dict:
    resp = requests.get(url, headers=HEADERS, timeout=15)
    print(f"[i] GET {url} -> status {resp.status_code}, {len(resp.text)} bytes", flush=True)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    clues = _extract_clues(soup)
    print(f"[+] Found {len(clues)} clues", flush=True)

    if not clues:
        print("[-] Could not find clues. First 2000 chars of response:", flush=True)
        print(soup.prettify()[:2000], flush=True)

    return {"clues": clues}


if __name__ == "__main__":
    from url_get import find_todays_mini_url
    print(fetch_crossword(find_todays_mini_url()))
