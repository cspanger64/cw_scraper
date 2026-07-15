"""
Reconstructs a crossword grid (which cells are black, which letters go where)
purely from the clue numbers, directions, and answers -- no image needed.

This works because standard crossword numbering is deterministic: cells are
numbered in reading order (left-to-right, top-to-bottom), and a cell gets a
number if and only if it starts an across entry and/or a down entry. Given
the full ordered list of across/down (number, answer) pairs, there's exactly
one grid layout (for a given size) consistent with that numbering -- so we
can search for it.
"""
from typing import List, Dict, Optional, Tuple

State = Optional[Tuple[str, int]]  # (letters, index_of_next_letter_to_place) or None


def _try_size(rows: int, cols: int, across: List[Dict], down: List[Dict]) -> Optional[List[List[Optional[str]]]]:
    grid: List[List[Optional[str]]] = [[None] * cols for _ in range(rows)]
    down_col: List[State] = [None] * cols

    def solve(r: int, c: int, ai: int, di: int, number: int, row_across: State) -> bool:
        if r == rows:
            if any(s is not None for s in down_col):
                return False
            return ai == len(across) and di == len(down)

        if c == cols:
            if row_across is not None:
                return False
            return solve(r + 1, 0, ai, di, number, None)

        across_active = row_across is not None
        down_active = down_col[c] is not None
        must_be_white = across_active or down_active

        choices = [True] if must_be_white else [False, True]

        for white in choices:
            if not white:
                # BLACK: only reachable when neither word is active here
                if solve(r, c + 1, ai, di, number, None):
                    return True
                continue

            new_ai, new_di, new_number = ai, di, number
            started_across = started_down = False

            # --- across letter for this cell ---
            if across_active:
                a_letters, a_idx = row_across
                letter_a = a_letters[a_idx]
                next_across_state = (a_letters, a_idx + 1) if a_idx + 1 < len(a_letters) else None
            else:
                if ai >= len(across):
                    continue
                entry = across[ai]
                a_letters = entry["answer"]
                if c + len(a_letters) > cols:
                    continue
                letter_a = a_letters[0]
                next_across_state = (a_letters, 1) if len(a_letters) > 1 else None
                started_across = True

            # --- down letter for this cell ---
            if down_active:
                d_letters, d_idx = down_col[c]
                letter_d = d_letters[d_idx]
                next_down_state = (d_letters, d_idx + 1) if d_idx + 1 < len(d_letters) else None
            else:
                if di >= len(down):
                    continue
                entry = down[di]
                d_letters = entry["answer"]
                if r + len(d_letters) > rows:
                    continue
                letter_d = d_letters[0]
                next_down_state = (d_letters, 1) if len(d_letters) > 1 else None
                started_down = True

            if letter_a != letter_d:
                continue

            if started_across and started_down:
                if across[ai]["num"] != number or down[di]["num"] != number:
                    continue
                new_ai, new_di, new_number = ai + 1, di + 1, number + 1
            elif started_across:
                if across[ai]["num"] != number:
                    continue
                new_ai, new_number = ai + 1, number + 1
            elif started_down:
                if down[di]["num"] != number:
                    continue
                new_di, new_number = di + 1, number + 1
            # else: continuing both, no new number

            grid[r][c] = letter_a
            saved_down_col_c = down_col[c]
            down_col[c] = next_down_state

            if solve(r, c + 1, new_ai, new_di, new_number, next_across_state):
                return True

            grid[r][c] = None
            down_col[c] = saved_down_col_c

        return False

    if solve(0, 0, 0, 0, 1, None):
        return grid
    return None


def build_grid(across: List[Dict], down: List[Dict], max_dim: int = 9) -> Tuple[int, int, List[List[Optional[str]]]]:
    """
    across, down: lists of {"num": int, "answer": str} (answer = letters only,
    no spaces -- strip spaces from multi-word answers before calling this).
    Returns (rows, cols, grid) where grid[r][c] is an uppercase letter or None.

    Does not assume a square grid (a plain 5x5/7x7 guess would miss the rare
    non-square Mini). Instead, bounds the search using the actual clue data:
    the longest across answer is a hard lower bound on the column count, and
    the longest down answer is a hard lower bound on the row count. Sizes are
    tried smallest-first, since the Mini is virtually always as small as the
    clues allow.
    """
    across = sorted(across, key=lambda x: x["num"])
    down = sorted(down, key=lambda x: x["num"])

    min_cols = max((len(e["answer"]) for e in across), default=1)
    min_rows = max((len(e["answer"]) for e in down), default=1)

    candidates = sorted(
        (
            (r, c)
            for r in range(min_rows, max_dim + 1)
            for c in range(min_cols, max_dim + 1)
        ),
        key=lambda rc: (rc[0] * rc[1], abs(rc[0] - rc[1])),  # smallest area first, squarest first
    )

    for rows, cols in candidates:
        result = _try_size(rows, cols, across, down)
        if result:
            return rows, cols, result

    raise ValueError(
        f"Could not reconstruct a grid (rows>={min_rows}, cols>={min_cols}, "
        f"max_dim={max_dim}) from {len(across)} across / {len(down)} down clues"
    )
