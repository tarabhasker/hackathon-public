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
# Tried in order when the preferred model is overloaded (503/504) or retired
# (404). A lite model sits second on purpose: when the flagship is congested
# (common at peak), the chain reaches a healthy model after one failover
# instead of three.
GEN_FALLBACKS = [
    GEN_MODEL,
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
]


class LLMUnavailable(Exception):
    pass


def _client():
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return None
    from google import genai
    # per-request cap so an overloaded model fails over instead of hanging;
    # kept short because hosted platforms cut the whole request at ~30s
    return genai.Client(api_key=api_key, http_options={"timeout": 12_000})


# Index of the model that answered most recently: later calls start there, so
# only the first request after a restart pays for discovering an outage.
_preferred = 0


def _generate(client, contents, config=None):
    """generate_content with model fallbacks for overload/retirement errors."""
    global _preferred
    from google.genai import errors

    order = GEN_FALLBACKS[_preferred:] + GEN_FALLBACKS[:_preferred]
    last = None
    for model in order:
        try:
            response = client.models.generate_content(
                model=model, contents=contents, config=config
            )
            _preferred = GEN_FALLBACKS.index(model)
            return response
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

We are looking for: the {role} of {company}.

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
Rules: only people who hold, or very recently held, that role (or its local
equivalent, e.g. Country Manager, General Manager or CEO of the local entity);
leave out colleagues who merely appear in the same results. At most 3
candidates, most likely first. Include the current company in
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


class SearchQuotaExceeded(Exception):
    """Every configured web search route is out of quota."""


# Which web search Find the Target uses:
#   auto   - Gemini's Google Search grounding, falling back to Serper (Google
#            results via google.serper.dev) when grounding is unavailable
#   gemini - grounding only;  serper - Serper only (fastest for a live demo)
TARGET_SEARCH = os.environ.get("TARGET_SEARCH", "auto").lower()
SERPER_URL = "https://google.serper.dev/search"


def _search_grounded(client, company: str, role: str) -> tuple[str, list[dict]]:
    """(research note, sources) from Gemini with Google Search grounding.

    Grounding quota is per account, so one 429 means every model will 429:
    stop at the first instead of walking the whole fallback list."""
    from google.genai import errors, types

    config = types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())])
    last = None
    for model in GEN_FALLBACKS:
        try:
            response = client.models.generate_content(
                model=model, contents=TARGET_SEARCH_PROMPT.format(role=role, company=company), config=config
            )
            return (response.text or "").strip(), _grounding_sources(response)
        except errors.APIError as e:
            if getattr(e, "code", None) in (403, 429):
                raise SearchQuotaExceeded("Google Search grounding is not enabled for this Gemini key") from e
            if getattr(e, "code", None) in (404, 503, 504):
                last = e
                continue
            raise
    raise last


def _serper(query: str) -> dict:
    import urllib.request

    body = {"q": query, "num": 10}
    if os.environ.get("TARGET_SEARCH_GL"):
        body["gl"] = os.environ["TARGET_SEARCH_GL"]  # e.g. "my" for Malaysian results
    req = urllib.request.Request(
        SERPER_URL,
        data=json.dumps(body).encode(),
        headers={"X-API-KEY": os.environ["SERPER_API_KEY"], "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        if e.code in (402, 403, 429):
            raise SearchQuotaExceeded("Serper credits are used up or the key is invalid") from e
        raise


def _search_serper(company: str, role: str, query: str | None) -> tuple[str, list[dict]]:
    """(research note, sources) from live Google results via Serper: two
    searches (who holds the role; their background), formatted as numbered
    snippets for the extraction step."""
    queries = [query or f"{company} {role}", f"{company} {role} appointed career background"]
    results, seen, boxes = [], set(), []
    for q in queries:
        data = _serper(q)
        kg = data.get("knowledgeGraph") or {}
        if kg:
            attrs = "; ".join(f"{k}: {v}" for k, v in (kg.get("attributes") or {}).items())
            boxes.append(f"Google knowledge panel: {kg.get('title', '')}. {kg.get('description', '')} {attrs}".strip())
        box = data.get("answerBox") or {}
        if box.get("answer") or box.get("snippet"):
            boxes.append(f"Google answer box: {box.get('answer') or box.get('snippet')}")
        for r in data.get("organic") or []:
            link = r.get("link")
            if link and link not in seen:
                seen.add(link)
                results.append(r)
    sources = [{"url": r["link"], "title": r.get("title") or r["link"]} for r in results[:15]]
    lines = boxes + [
        f"[{i + 1}] {r.get('title', '')} ({r['link']}){' · ' + r['date'] if r.get('date') else ''}\n"
        f"    {r.get('snippet', '')}"
        for i, r in enumerate(results[:15])
    ]
    note = (
        f"Google search results for who is the {role} of {company}. Use only what these "
        f"snippets say; snippets may be about other people or out of date.\n\n" + "\n".join(lines)
    )
    return (note if results or boxes else ""), sources


def find_target(company: str, role: str, query: str | None = None) -> dict:
    """Web-search who holds `role` at `company` and extract their public career.

    Step 1 searches the web: Gemini's Google Search grounding, or live Google
    results from Serper (see TARGET_SEARCH). Step 2 is a plain JSON-mode
    Gemini call that turns what was found into up to 3 candidates.

    Returns {"candidates": [...], "sources": [{url, title}], "note": str, "engine": str}.
    """
    client = _client()
    if client is None:
        raise LLMUnavailable("GOOGLE_API_KEY is not set in backend/.env")
    has_serper = bool(os.environ.get("SERPER_API_KEY"))

    note, sources, engine = "", [], None
    if TARGET_SEARCH in ("auto", "gemini"):
        try:
            note, sources = _search_grounded(client, company, role)
            engine = "Google Search (Gemini grounding)"
        except SearchQuotaExceeded:
            if TARGET_SEARCH == "gemini" or not has_serper:
                raise
    if engine is None:
        if not has_serper:
            raise LLMUnavailable("Set SERPER_API_KEY in backend/.env to search with Serper")
        note, sources = _search_serper(company, role, query)
        engine = "Google results (Serper)"

    if not note:
        return {"candidates": [], "sources": sources, "note": "", "engine": engine}

    numbered = "\n".join(
        f"[{i + 1}] {s['title']}" for i, s in enumerate(sources)
    ) or "(none)"
    extracted = _generate(
        client,
        TARGET_EXTRACT_PROMPT.format(role=role, company=company, note=note[:20000], sources=numbered),
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
    return {"candidates": clean, "sources": sources, "note": note, "engine": engine}


def draft_cold_intro(target: dict, requester: dict) -> str | None:
    """A short, respectful cold-outreach note built on the target's public
    profile; None when no key or on failure (the caller templates it)."""
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return None
    import time

    from google import genai

    # A nicety, not worth a stalled page: short per-call timeout, ~15 s in
    # total across models, then the caller's template takes over
    client = genai.Client(api_key=api_key, http_options={"timeout": 10_000})  # the API minimum
    deadline = time.monotonic() + 15
    prompt = (
        "Write a short LinkedIn-style first message (max 90 words, no subject line, "
        "no placeholders in brackets) from the sender to the recipient. Be specific "
        "about one genuine point of common ground from their public careers if there "
        "is one, ask for a brief call, and stay professional. Use ONLY the facts below: "
        "never invent achievements, initiatives or news about the recipient.\n"
        f"Recipient: {target.get('name')}, {target.get('title')} at {target.get('company')}. "
        f"Career: {', '.join(e.get('org', '') for e in target.get('employers', []))}.\n"
        f"Sender: {requester.get('name')}, {requester.get('title') or ''}. "
        f"Career: {', '.join(requester.get('employers', []))}."
    )
    for model in reversed(GEN_FALLBACKS):  # the lite models answer fastest
        if time.monotonic() > deadline:
            break
        try:
            response = client.models.generate_content(model=model, contents=prompt)
            return (response.text or "").strip() or None
        except Exception:
            continue
    return None
