# scraper/url_get.py

# Sources are tried in order; the first one that yields a usable puzzle wins.
# wordhint serves a plain HTML table (# / clue / answer) for every clue,
# including explicit numbers for linked clues, at an evergreen URL.
# dazepuzzle is kept as a fallback only -- it currently sits behind a
# Cloudflare browser challenge that plain HTTP clients can't pass.
PUZZLE_SOURCES = {
    "mini": [
        "https://www.wordhint.net/crossword-clues-answers/nyt-mini/today/",
        "https://dazepuzzle.com/nyt-mini-crossword/",
    ],
    "midi": [
        "https://www.wordhint.net/crossword-clues-answers/nyt-midi/today/",
        "https://dazepuzzle.com/nyt-midi-crossword/",
    ],
}


def find_urls(kind: str):
    return list(PUZZLE_SOURCES[kind])


if __name__ == "__main__":
    for kind, urls in PUZZLE_SOURCES.items():
        print(kind, urls)
