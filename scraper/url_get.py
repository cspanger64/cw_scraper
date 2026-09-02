# scraper/url_get.py

# Both puzzles live at evergreen URLs on dazepuzzle -- no date arithmetic
# needed for either.
PUZZLE_URLS = {
    "mini": "https://dazepuzzle.com/nyt-mini-crossword/",
    "midi": "https://dazepuzzle.com/nyt-midi-crossword/",
}


def find_todays_mini_url() -> str:
    return PUZZLE_URLS["mini"]


def find_todays_midi_url() -> str:
    return PUZZLE_URLS["midi"]


def find_url(kind: str) -> str:
    return PUZZLE_URLS[kind]


if __name__ == "__main__":
    for kind, url in PUZZLE_URLS.items():
        print(kind, url)
