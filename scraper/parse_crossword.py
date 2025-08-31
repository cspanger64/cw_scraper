import os
from openai import OpenAI
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

PROMPT = """
You are given an image of a completed 5x5 or 7x7 crossword sqaure and its list of clues and answers.
Your task is to output a single JSON object describing the crossword puzzle in the image.
Only use the answers provided in the clue list. 

STRICT FORMAT RULES:
- "size": [rows, cols] → the exact grid size of the puzzle. Detect this from the image, it will be 5x5 or 7x7.
- "grid": a 2D array of shape [rows][cols]. Each cell must contain:
  - an uppercase letter if it is filled with an answer letter
  - null if the cell is black/empty
- "clues": {
    "across": [ { "num": number, "clue": text, "answer": word, "row": r, "col": c }, ... ],
    "down":   [ { "num": number, "clue": text, "answer": word, "row": r, "col": c }, ... ]
  }
  - "num" must match the clue numbering in the puzzle.
  - "row" and "col" are the 0-based coordinates of the first letter of the answer.
  - "answer" must exactly match the filled letters in the grid.

OUTPUT:
- Only return valid JSON.
- The "grid" must be exactly the true puzzle size with no padding rows or columns.
- The "clues" must align with the grid.
- The output must match exactly what is in the image.
"""

SCHEMA = {
    "name": "crossword_schema",
    "schema": {
        "type": "object",
        "properties": {
            "size": {
                "type": "array",
                "items": {"type": "integer"},
                "minItems": 2,
                "maxItems": 2,
                "additionalItems": False
            },
            "grid": {
                "type": "array",
                "items": {
                    "type": "array",
                    "items": {
                        "type": ["string", "null"],
                        "maxLength": 1
                    },
                    "additionalItems": False
                }
            },
            "clues": {
                "type": "object",
                "properties": {
                    "across": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "num": {"type": "integer"},
                                "clue": {"type": "string"},
                                "answer": {"type": "string"},
                                "row": {"type": "integer"},
                                "col": {"type": "integer"}
                            },
                            "required": ["num", "clue", "answer", "row", "col"],
                            "additionalProperties": False
                        }
                    },
                    "down": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "num": {"type": "integer"},
                                "clue": {"type": "string"},
                                "answer": {"type": "string"},
                                "row": {"type": "integer"},
                                "col": {"type": "integer"}
                            },
                            "required": ["num", "clue", "answer", "row", "col"],
                            "additionalProperties": False
                        }
                    }
                },
                "required": ["across", "down"],
                "additionalProperties": False
            }
        },
        "required": ["size", "grid", "clues"],
        "additionalProperties": False
    },
    "strict": True
}

def parse_crossword(image_url: str, clues: list[dict]) -> dict:
    """Send crossword image + clues to GPT and return structured JSON."""
    resp = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": [
                {
                    "type": "text",
                    "text": f"Here are the extracted clues and answers:\n{json.dumps(clues, indent=2)}"
                },
                {
                    "type": "image_url",
                    "image_url": {"url": image_url}
                }
            ]}
        ],
        response_format={"type": "json_schema", "json_schema": SCHEMA}
    )

    return json.loads(resp.choices[0].message.content)