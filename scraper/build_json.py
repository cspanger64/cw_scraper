from datetime import date


def build_payload(core: dict) -> dict:
return {
"date": date.today().isoformat(),
"title": core.get("title", "Daily Crossword"),
"rows": core["rows"],
"cols": core["cols"],
"grid": core["grid"],
"across": core.get("across", []),
"down": core.get("down", []),
}
