"""Gemini helpers: embeddings, CV parsing and Find the Target web lookups.

Everything degrades gracefully when GOOGLE_API_KEY is absent:
- embed_texts returns None (callers fall back to keyword matching)
- parse_cv raises LLMUnavailable (intake returns a clear 503)
"""
import json
import os

EMBED_MODEL = os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = 768  # must match vector(768) in the facets schema
GEN_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
# Tried in order when the preferred model is overloaded (503) or retired (404)
GEN_FALLBACKS = [
    GEN_MODEL,
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]


class LLMUnavailable(Exception):
    pass


def _client():
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return None
    from google import genai
    # per-request cap so an overloaded model fails over instead of hanging
    return genai.Client(api_key=api_key, http_options={"timeout": 25_000})


def _generate(client, contents, config=None):
    """generate_content with model fallbacks for overload/retirement errors."""
    from google.genai import errors

    last = None
    for model in GEN_FALLBACKS:
        try:
            return client.models.generate_content(
                model=model, contents=contents, config=config
            )
        except errors.APIError as e:
            last = e
            if getattr(e, "code", None) in (404, 429, 503, 504):
                continue  # try the next model
            raise
        except Exception as e:
            # timeouts (overloaded model) fall through to the next model
            name = type(e).__name__.lower()
            if "timeout" not in name and "timeout" not in str(e).lower():
                raise
            last = e
    raise last


def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """Embed up to 100 texts; None when no API key is configured."""
    client = _client()
    if client is None:
        return None
    from google.genai import types

    result = client.models.embed_content(
        model=EMBED_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(output_dimensionality=EMBED_DIM),
    )
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

    response = _generate(client, contents, config={"response_mime_type": "application/json"})
    return json.loads(response.text)


def draft_why(query: str, person_summary: str, path_names: list[str]) -> str | None:
    """Optional LLM polish of the why-line; None when no key (caller templates it)."""
    client = _client()
    if client is None:
        return None
    via = " -> ".join(path_names) if path_names else "a direct connection"
    response = _generate(
        client,
        "In one short sentence (max 20 words), explain why this person fits the ask "
        f"and mention the intro path.\nAsk: {query}\nPerson: {person_summary}\nPath: {via}",
    )
    return response.text.strip()


# --- Find the Target (premium) ------------------------------------------------

TARGET_SEARCH_PROMPT = """Find out who currently holds this role, using web search.

Role: {role}
Company: {company}

Report only business-role facts from public sources (company leadership pages,
annual reports, press releases, news, conference speaker bios). For each person
who plausibly holds the role (up to 3 if the name is ambiguous or the role
recently changed hands), give:
- full name, exact current title, company
- career history: past employers with start and end years where known
- schools / universities
- other boards or directorships
Do not include personal contact details, family, home address or anything
outside their professional role. If you cannot find the person, say so plainly.
"""

TARGET_EXTRACT_PROMPT = """Convert this research note into JSON.

Research note:
{note}

Numbered sources found during the search:
{sources}

Return ONLY a JSON object:
{{"candidates": [{{
  "name": string,
  "title": string,
  "company": string,
  "employers": [{{"org": string, "start_year": int or null, "end_year": int or null}}],
  "schools": [string],
  "boards": [string],
  "source_ids": [int],          // numbers of the sources above that support this person
  "confidence": "high" | "medium" | "low"
}}]}}
Rules: at most 3 candidates, most likely first. Include the current company in
"employers" with end_year null. Use only facts in the note; never invent years
(use null). If the note found nobody, return {{"candidates": []}}.
"""


def _grounding_sources(response) -> list[dict]:
    """[{url, title}] web sources Google Search grounding used, deduplicated."""
    sources, seen = [], set()
    for cand in response.candidates or []:
        meta = getattr(cand, "grounding_metadata", None)
        for chunk in (getattr(meta, "grounding_chunks", None) or []):
            web = getattr(chunk, "web", None)
            uri = getattr(web, "uri", None)
            if not uri or uri in seen:
                continue
            seen.add(uri)
            sources.append({"url": uri, "title": getattr(web, "title", None) or uri})
    return sources


def find_target(company: str, role: str) -> dict:
    """Web-search who holds `role` at `company` and extract their public career.

    Two calls, because grounded search and strict JSON output don't combine
    reliably: (1) Gemini with Google Search grounding writes a cited research
    note, (2) a plain JSON-mode call turns the note into candidates.

    Returns {"candidates": [...], "sources": [{url, title}], "note": str}.
    """
    client = _client()
    if client is None:
        raise LLMUnavailable("GOOGLE_API_KEY is not set in backend/.env")
    from google.genai import types

    grounded = _generate(
        client,
        TARGET_SEARCH_PROMPT.format(role=role, company=company),
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())]
        ),
    )
    note = (grounded.text or "").strip()
    sources = _grounding_sources(grounded)
    if not note:
        return {"candidates": [], "sources": sources, "note": ""}

    numbered = "\n".join(
        f"[{i + 1}] {s['title']}" for i, s in enumerate(sources)
    ) or "(none)"
    extracted = _generate(
        client,
        TARGET_EXTRACT_PROMPT.format(note=note[:20000], sources=numbered),
        config={"response_mime_type": "application/json"},
    )
    data = json.loads(extracted.text)
    candidates = data.get("candidates", []) if isinstance(data, dict) else []

    clean = []
    for c in candidates[:3]:
        if not isinstance(c, dict) or not (c.get("name") or "").strip():
            continue
        ids = [i for i in c.get("source_ids") or [] if isinstance(i, int)]
        clean.append(
            {
                "name": c["name"].strip(),
                "title": (c.get("title") or role).strip(),
                "company": (c.get("company") or company).strip(),
                "employers": [
                    {
                        "org": (e.get("org") or "").strip(),
                        "start_year": e.get("start_year") if isinstance(e.get("start_year"), int) else None,
                        "end_year": e.get("end_year") if isinstance(e.get("end_year"), int) else None,
                    }
                    for e in c.get("employers") or []
                    if isinstance(e, dict) and (e.get("org") or "").strip()
                ],
                "schools": [s for s in c.get("schools") or [] if isinstance(s, str) and s.strip()],
                "boards": [b for b in c.get("boards") or [] if isinstance(b, str) and b.strip()],
                "sources": [sources[i - 1] for i in ids if 1 <= i <= len(sources)] or sources[:5],
                "confidence": c.get("confidence") if c.get("confidence") in ("high", "medium", "low") else "low",
            }
        )
    return {"candidates": clean, "sources": sources, "note": note}


def draft_cold_intro(target: dict, requester: dict) -> str | None:
    """A short, respectful cold-outreach note built on the target's public
    profile; None when no key or on failure (the caller templates it)."""
    client = _client()
    if client is None:
        return None
    try:
        response = _generate(
            client,
            "Write a short LinkedIn-style first message (max 90 words, no subject line, "
            "no placeholders in brackets) from the sender to the recipient. Be specific "
            "about one genuine point of common ground from their public careers if there "
            "is one, ask for a brief call, and stay professional.\n"
            f"Recipient: {target.get('name')}, {target.get('title')} at {target.get('company')}. "
            f"Career: {', '.join(e.get('org', '') for e in target.get('employers', []))}.\n"
            f"Sender: {requester.get('name')}, {requester.get('title') or ''}. "
            f"Career: {', '.join(requester.get('employers', []))}.",
        )
        return (response.text or "").strip() or None
    except Exception:
        return None
