from abc import ABC, abstractmethod
from datetime import date


class BaseScraper(ABC):
@abstractmethod
def fetch_html(self) -> str:
"""Return HTML for today's crossword page."""


@abstractmethod
def parse_to_grid(self, html: str) -> dict:
"""Return a dict with keys rows, cols, grid (2D array), and optional clues."""


def today_str(self) -> str:
return date.today().isoformat()
