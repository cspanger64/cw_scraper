import requests
from bs4 import BeautifulSoup
from .base import BaseScraper


SOURCE_URL = "https://example.com/todays-crossword" # replace with a permitted source


class ExampleSiteScraper(BaseScraper):
def fetch_html(self) -> str:
resp = requests.get(SOURCE_URL, timeout=30)
resp.raise_for_status()
return resp.text


def parse_to_grid(self, html: str) -> dict:
soup = BeautifulSoup(html, "lxml")
# TODO: Inspect the page structure and extract grid & clues.
# Below is a tiny demo grid so you can wire up the pipeline before real scraping:
rows, cols = 5, 5
grid = [[{"black": False, "solution": "A"} for _ in range(cols)] for _ in range(rows)]
# example: set a black square
grid[1][1] = {"black": True}
across = [{"num": 1, "row": 0, "col": 0, "len": 5, "clue": "Fruit", "answer": "APPLE"}]
down = [{"num": 1, "row": 0, "col": 0, "len": 5, "clue": "Even's friend?", "answer": "ODD?"}]
return {"rows": rows, "cols": cols, "grid": grid, "across": across, "down": down}
