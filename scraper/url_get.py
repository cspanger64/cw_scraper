# scraper/url_get.py

# dazepuzzle.com's Mini Crossword page is evergreen -- this single URL
# always shows the current day's puzzle, so no date arithmetic or
# weekday/author guessing is needed at all.
MINI_URL = "https://dazepuzzle.com/nyt-mini-crossword/"


def find_todays_mini_url() -> str:
    return MINI_URL


if __name__ == "__main__":
    print(find_todays_mini_url())
