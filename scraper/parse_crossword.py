# scraper/parse_crossword.py
import re
from typing import List, Dict

try:
    from scraper.build_grid import build_grid
except ImportError:
    from build_grid import build_grid


def parse_crossword(clues: List[Dict]) -> dict:
    """
    Builds the full puzzle JSON (size, grid, clues w/ row+col) purely from
    scraped clue/answer text -- no image or AI call needed. Grid layout is
    reconstructed deterministically from clue numbers + answer lengths via
    build_grid().

    clues: list of {"position": "1A"/"6D", "clue": str, "answer": str}
    """
    across_raw, down_raw = [], []
    for c in clues:
        m = re.match(r"^(\d+)([AD])$", c["position"])
        if not m:
            raise ValueError(f"Bad clue position: {c['position']!r}")
        num = int(m.group(1))
        direction = m.group(2)
        answer = c["answer"].replace(" ", "").upper()
        entry = {"num": num, "clue": c["clue"], "answer": answer}
        (across_raw if direction == "A" else down_raw).append(entry)

    rows, cols, grid = build_grid(
        [{"num": e["num"], "answer": e["answer"]} for e in across_raw],
        [{"num": e["num"], "answer": e["answer"]} for e in down_raw],
    )

    # Re-derive each clue number's (row, col) start position by scanning the
    # reconstructed grid using the same standard numbering rule build_grid used.
    number_positions = {}
    number = 1
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] is None:
                continue
            starts_across = (c == 0 or grid[r][c - 1] is None) and (c + 1 < cols and grid[r][c + 1] is not None)
            starts_down = (r == 0 or grid[r - 1][c] is None) and (r + 1 < rows and grid[r + 1][c] is not None)
            if starts_across or starts_down:
                number_positions[number] = (r, c)
                number += 1

    def to_output(entries):
        out = []
        for e in sorted(entries, key=lambda x: x["num"]):
            if e["num"] not in number_positions:
                raise ValueError(f"Reconstructed grid has no cell numbered {e['num']}")
            r, c = number_positions[e["num"]]
            out.append({"num": e["num"], "clue": e["clue"], "answer": e["answer"], "row": r, "col": c})
        return out

    return {
        "size": [rows, cols],
        "grid": grid,
        "clues": {
            "across": to_output(across_raw),
            "down": to_output(down_raw),
        },
    }
