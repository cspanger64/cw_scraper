import json
import os
import sys
import traceback
from scraper.url_get import find_todays_mini_url
from scraper.fetch_crossword import fetch_crossword
from scraper.parse_crossword import parse_crossword


def log(*args):
    print(*args, flush=True)


def main():
    url = find_todays_mini_url()
    log(f"Fetching crossword from: {url}")
    data = fetch_crossword(url)

    clues = data["clues"]
    log(f"Found {len(clues)} clues")

    if not clues:
        log("[-] No clues found, aborting.")
        sys.exit(1)

    puzzle_json = parse_crossword(clues)

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
