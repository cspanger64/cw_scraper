import json
from scraper.url_get import make_cnet_url
from scraper.fetch_crossword import fetch_crossword
from scraper.parse_crossword import parse_crossword


def main():
    url = make_cnet_url()
    print(f"Fetching crossword from: {url}")
    data = fetch_crossword(url, download_image=True)

    image_url = data["image_url"]
    clues = data["clues"]

    print("Image URL:", image_url)
    print("Clues:", clues)

    if not image_url or not clues:
        print("[-] Missing image or clues, aborting.")
        return

    puzzle_json = parse_crossword(image_url, clues)

    # Save JSON as text
    with open("puzzle.json", "w", encoding="utf-8") as f:
        json.dump(puzzle_json, f, ensure_ascii=False, indent=2)

    print("[+] Saved puzzle.json")


if __name__ == "__main__":
    main()