import json
from scraper.sites.example_site import ExampleSiteScraper
from scraper.build_json import build_payload


# Swap ExampleSiteScraper for your permitted source implementation.


def main():
scraper = ExampleSiteScraper()
html = scraper.fetch_html()
core = scraper.parse_to_grid(html)
payload = build_payload(core)
with open("todays-crossword.json", "w", encoding="utf-8") as f:
json.dump(payload, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
main()
