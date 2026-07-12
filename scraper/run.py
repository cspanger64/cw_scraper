import json
import sys
import traceback
from scraper.url_get import find_todays_mini_url
from scraper.fetch_crossword import fetch_crossword
from scraper.parse_crossword import parse_crossword
import os


def log(*args):
    print(*args, flush=True)


def main():
    url = find_todays_mini_url()
    log(f"Fetching crossword from: {url}")
    data = fetch_crossword(url, download_image=True)

    image_url = data["image_url"]
    clues = data["clues"]

    log("Image URL:", image_url)
    log("Clues:", clues)

    if not image_url or not clues:
        log("[-] Missing image or clues, aborting.")
        sys.exit(1)

    puzzle_json = parse_crossword(image_url, clues)

    os.makedirs("docs", exist_ok=True)
    with open("docs/puzzle.json", "w", encoding="utf-8") as f:
        json.dump(puzzle_json, f, ensure_ascii=False, indent=2)
    log("Wrote docs/puzzle.json")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        log("[-] Unhandled exception:")
        traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        sys.exit(1)