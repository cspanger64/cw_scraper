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

def _largest_from_srcset(srcset: str) -> Optional[str]:
    # srcset: "url1 768w, url2 1024w, url3 1200w"
    parts = [p.strip() for p in srcset.split(",") if p.strip()]
    if not parts:
        return None
    return parts[-1].split()[0]  # pick the last (largest)

def _find_crossword_image_url(soup: BeautifulSoup) -> Optional[str]:
    # Look through all <picture><source srcset="..."> blocks for the crossword asset
    for picture in soup.find_all("picture"):
        for src in picture.find_all("source"):
            srcset = src.get("srcset", "")
            if "completed-nyt-mini-crossword" in srcset:
                url = _largest_from_srcset(srcset)
                if url:
                    return url
    # Fallback: sometimes the <img> itself has the src
    img = soup.find("img", src=lambda x: x and "completed-nyt-mini-crossword" in x.lower())
    return img.get("src") if img else None

CLUE_RE = re.compile(
    r"""^\s*(?P<num>\d+)\s*(?P<dir>[AaDd])\s*clue:\s*(?P<clue>.*?)\s*answer:\s*(?P<answer>.+?)\s*$""",
    re.IGNORECASE
)

def _extract_clues(soup: BeautifulSoup) -> List[Dict]:
    clues: List[Dict] = []
    # Join text inside <p> including <strong> and <br>
    for p in soup.find_all("p"):
        # skip ad placeholders
        if p.get("data-ad-callout"):
            continue
        text = " ".join(p.stripped_strings)  # keeps strong/br content
        if not text:
            continue

        m = CLUE_RE.match(text)
        if m:
            pos = f"{m.group('num').upper()}{m.group('dir').upper()}"
            clues.append({
                "position": pos,
                "clue": m.group("clue").strip().strip("“”\"' "),
                "answer": m.group("answer").strip().upper()
            })
    return clues

def fetch_crossword(url: str, download_image: bool = False) -> Dict:
    resp = requests.get(url, headers=HEADERS, timeout=15)
    print(f"[i] GET {url} -> status {resp.status_code}, {len(resp.text)} bytes")

    # Blow up loudly on 403/404/etc instead of silently parsing a challenge/error page
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    image_url = _find_crossword_image_url(soup)
    clues = _extract_clues(soup)

    if download_image and image_url:
        img_bytes = requests.get(image_url, headers=HEADERS, timeout=15).content
        with open("crossword.png", "wb") as f:
            f.write(img_bytes)
        print(f"[+] Saved crossword.png from {image_url}")

    print(f"[+] Found {len(clues)} clues")

    if not image_url or not clues:
        # Dump a snippet of what we actually got back so Actions logs show WHY it failed
        # (e.g. a bot-check/consent page instead of the real article)
        print("[-] Could not find image and/or clues. First 2000 chars of response:")
        print(soup.prettify()[:2000])

    return {"image_url": image_url, "clues": clues}

if __name__ == "__main__":
    url = "https://www.cnet.com/tech/gaming/todays-nyt-mini-crossword-answers-for-friday-aug-29/"
    data = fetch_crossword(url, download_image=False)
    print(data)
