# scraper/parse_crossword.py
import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# STRICT JSON schema: only { size: [R,C], mask: [["B"/"W", ...], ...] }
GRID_MASK_SCHEMA = {
    "name": "grid_mask_schema",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "size": {
                "type": "array",
                "minItems": 2,
                "maxItems": 2,
                "items": {"type": "integer"}
            },
            "mask": {
                "type": "array",
                "items": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["B", "W"]}
                }
            }
        },
        "required": ["size", "mask"]
    },
    "strict": True
}

SYSTEM_PROMPT = """
You convert a screenshot of grid of letters into a map of where there are letters

Return ONLY JSON matching the provided schema.

How to detect the grid:
- Identify the rectangular 5x5 OR 7x7 grid composed of uniformly sized cells with visible grid lines.
- Determine exact rows (R) and columns (C) by COUNTING the cells inside the outer grid border. Do not infer.
- For each cell:
  - Output "B" if the cell is a black square.
  - Output "W" if the cell is a white, blue or yellow square with a letter in it.
- The "size" must be [R, C].
- The "mask" must be a 2-D array with exactly R rows, each row exactly C entries.
- No extra rows/columns, no padding, no nulls, only "B" or "W".
- DO NOT assume the amount of rows or columns, count it from the image using the image.
-ignore any numbers in the picture, they are not relevant
"""

def parse_crossword(image_url: str) -> dict:
    """
    Given a remote image URL of a completed crossword, return:
      {
        "size": [rows, cols],
        "mask": [["B"|"W", ...], ...]
      }
    """
    resp = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": image_url}}
            ]}
        ],
        response_format={"type": "json_schema", "json_schema": GRID_MASK_SCHEMA}
    )
    return json.loads(resp.choices[0].message.content)