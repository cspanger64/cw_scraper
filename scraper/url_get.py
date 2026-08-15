# scraper/url_get.py
MINI_URL = "https://dazepuzzle.com/nyt-mini-crossword/"

def find_todays_mini_url() -> str:
    return MINI_URL

if __name__ == "__main__":
    print(find_todays_mini_url())
