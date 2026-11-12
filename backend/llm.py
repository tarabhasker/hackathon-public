"""Gemini helpers: embeddings and CV parsing.

Everything degrades gracefully when GOOGLE_API_KEY is absent:
- embed_texts returns None (callers fall back to keyword matching)
- parse_cv raises LLMUnavailable (intake returns a clear 503)
"""
import json
import os

EMBED_MODEL = "text-embedding-004"
GEN_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


class LLMUnavailable(Exception):
    pass


def _client():
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return None
    from google import genai
    return genai.Client(api_key=api_key)


def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """Embed up to 100 texts; None when no API key is configured."""
    client = _client()
    if client is None:
        return None
    result = client.models.embed_content(model=EMBED_MODEL, contents=texts)
    return [list(e.values) for e in result.embeddings]


CV_PROMPT = """You extract structured data from a CV / resume.
Return ONLY a JSON object with exactly these keys:
- name: string
- title: string (their current or most recent job title)
- org_unit: string or null (their field/department, one or two words)
- skills: array of strings (5-10 concrete skills)
- employers: array of {"org": string, "start_year": int or null, "end_year": int or null}
  (end_year null means current)
- projects: array of strings (named projects/products they worked on, may be empty)
- ask: string (one sentence: what they likely want to learn or need help with, inferred)
- offer: string (one sentence: what they can help others with)
- summary: string (2 sentences describing their expertise)
"""


def parse_cv(raw_text: str | None = None, pdf_bytes: bytes | None = None) -> dict:
    """Parse a CV from extracted text, or from the PDF itself (scanned/image CVs)."""
    client = _client()
    if client is None:
        raise LLMUnavailable("GOOGLE_API_KEY is not set in backend/.env")

    if pdf_bytes is not None:
        from google.genai import types

        contents = [
            types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
            CV_PROMPT + "\nThe CV is the attached document.",
        ]
    else:
        contents = CV_PROMPT + "\nCV text:\n" + raw_text[:30000]

    response = client.models.generate_content(
        model=GEN_MODEL,
        contents=contents,
        config={"response_mime_type": "application/json"},
    )
    return json.loads(response.text)


def draft_why(query: str, person_summary: str, path_names: list[str]) -> str | None:
    """Optional LLM polish of the why-line; None when no key (caller templates it)."""
    client = _client()
    if client is None:
        return None
    via = " -> ".join(path_names) if path_names else "a direct connection"
    response = client.models.generate_content(
        model=GEN_MODEL,
        contents=(
            "In one short sentence (max 20 words), explain why this person fits the ask "
            f"and mention the intro path.\nAsk: {query}\nPerson: {person_summary}\nPath: {via}"
        ),
    )
    return response.text.strip()
