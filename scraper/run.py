import json
import os
import sys
import traceback
from scraper.url_get import find_urls
from scraper.fetch_crossword import fetch_crossword
from scraper.parse_crossword import parse_crossword

# Mini is always <=7x7 (standard NYT Mini). Midi runs 9x9-11x11 and can
# occasionally use asymmetric/themed layouts, so it gets a larger search
# ceiling -- see parse_crossword's max_dim.
PUZZLES = {
    "mini": {"max_dim": 9},
    "midi": {"max_dim": 11},
}


def log(*args):
    print(*args, flush=True)


def build_one(kind: str, max_dim: int) -> bool:
    """Returns True on success. Never raises -- a failure here should not
    stop the other puzzle from being generated."""
    log(f"=== {kind} ===")
    try:
        clues = []
        for url in find_urls(kind):
            log(f"Fetching {kind} crossword from: {url}")
            try:
                data = fetch_crossword(url)
            except Exception as e:
                log(f"[-] [{kind}] source failed ({type(e).__name__}: {e}); trying next source")
                continue
            clues = data["clues"]
            log(f"[{kind}] Found {len(clues)} clues from {url}")
            if not clues:
                log(f"[-] [{kind}] no clues from this source; trying next source")
                continue
            try:
                puzzle_json = parse_crossword(clues, max_dim=max_dim)
            except Exception as e:
                log(f"[-] [{kind}] couldn't build a grid from this source ({e}); trying next source")
                clues = []
                continue
            break
        else:
            log(f"[-] [{kind}] every source failed, skipping.")
            return False

        os.makedirs("docs", exist_ok=True)
        out_path = f"docs/puzzle-{kind}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(puzzle_json, f, ensure_ascii=False, indent=2)
        log(f"[+] [{kind}] Wrote {out_path}")
        return True
    except Exception:
        log(f"[-] [{kind}] Unhandled exception:")
        traceback.print_exc()
        sys.stdout.flush()
        return False


def main():
    results = {kind: build_one(kind, cfg["max_dim"]) for kind, cfg in PUZZLES.items()}
    log(f"Summary: {results}")
    if not any(results.values()):
        log("[-] Every puzzle failed, aborting.")
        sys.exit(1)
    # At least one puzzle succeeded -- exit 0 so the workflow commits it,
    # even if another one failed this run.


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
