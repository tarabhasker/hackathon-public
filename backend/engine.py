"""The 6 Degrees matching engine.

- relevance: query vs expertise facets (pgvector cosine when embeddings exist,
  keyword overlap otherwise)
- path strength: strongest path on the weighted graph via -log(weight)
- final score: relevance x path strength x willingness
"""
import math
import re

import networkx as nx
from sqlalchemy import text

from llm import embed_texts

THIS_YEAR = 2026
NO_PATH_STRENGTH = 0.02  # floor so unreachable people still rank, labeled "cold"


# --- Graph --------------------------------------------------------------------

def load_graph(conn) -> nx.Graph:
    G = nx.Graph()
    for src, dst, w in conn.execute(text("SELECT src, dst, weight FROM edges")):
        prev = G.get_edge_data(src, dst, default={}).get("w", 0.0)
        combined = 1 - (1 - prev) * (1 - w)  # parallel edge types reinforce
        G.add_edge(src, dst, w=combined, cost=-math.log(combined))
    return G


def strongest_path(G: nx.Graph, a: int, b: int):
    """(node_ids, strength) of the strongest path, or None if unreachable."""
    if a not in G or b not in G:
        return None
    try:
        path = nx.shortest_path(G, a, b, weight="cost")
    except nx.NetworkXNoPath:
        return None
    if len(path) > 5:  # cap at 4 hops: beyond that an intro chain is fiction
        return None
    strength = math.prod(G.edges[u, v]["w"] for u, v in zip(path, path[1:]))
    return path, strength


# --- Relevance ----------------------------------------------------------------

def _tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9+#]+", s.lower()) if len(t) > 2}


def relevance_candidates(conn, query: str, limit: int = 40) -> list[dict]:
    """[{person_id, relevance, snippet}] best expertise matches for the query."""
    vectors = None
    try:
        vectors = embed_texts([query])
    except Exception:
        vectors = None  # API hiccup -> fall back rather than fail the search

    if vectors:
        qvec = "[" + ",".join(f"{v:.6f}" for v in vectors[0]) + "]"
        rows = conn.execute(
            text(
                "SELECT person_id, text, 1 - (embedding <=> :q ::vector) AS sim "
                "FROM facets WHERE kind = 'expertise' AND embedding IS NOT NULL "
                "ORDER BY embedding <=> :q ::vector LIMIT :lim"
            ),
            {"q": qvec, "lim": limit},
        ).all()
        if rows:  # embeddings exist in the DB
            return [
                {"person_id": r.person_id, "relevance": max(0.0, float(r.sim)), "snippet": r.text}
                for r in rows
            ]

    # Keyword fallback: token overlap between query and expertise text
    q = _tokens(query)
    if not q:
        return []
    scored = []
    for r in conn.execute(
        text("SELECT person_id, text FROM facets WHERE kind = 'expertise'")
    ):
        hit = q & _tokens(r.text)
        if hit:
            scored.append(
                {
                    "person_id": r.person_id,
                    "relevance": len(hit) / len(q),
                    "snippet": r.text,
                    "matched": sorted(hit),
                }
            )
    scored.sort(key=lambda s: -s["relevance"])
    return scored[:limit]


# --- Search -------------------------------------------------------------------

def search(conn, query: str, requester_id: int, limit: int = 5) -> list[dict]:
    candidates = relevance_candidates(conn, query)
    candidates = [c for c in candidates if c["person_id"] != requester_id]
    if not candidates:
        return []

    G = load_graph(conn)
    ids = {c["person_id"] for c in candidates} | {requester_id}
    people = {
        r.id: dict(r._mapping)
        for r in conn.execute(
            text(
                "SELECT id, name, title, org_unit, opt_in, is_real "
                "FROM people WHERE id = ANY(:ids)"
            ),
            {"ids": list(ids)},
        )
    }
    # names for everyone (path hops may be outside the candidate set)
    all_names = dict(conn.execute(text("SELECT id, name FROM people")).all())

    results = []
    for c in candidates:
        pid = c["person_id"]
        person = people.get(pid)
        if person is None:
            continue

        found = strongest_path(G, requester_id, pid)
        if found:
            path_ids, strength = found
            hops = [
                {
                    "id": h,
                    "name": all_names.get(h, "?"),
                    "edge": _edge_info(conn, u, h),
                }
                for u, h in zip(path_ids, path_ids[1:])
            ]
        else:
            strength, hops = NO_PATH_STRENGTH, []

        willingness = 1.0 if person["opt_in"] else 0.25
        score = c["relevance"] * max(strength, NO_PATH_STRENGTH) * willingness

        via_names = [h["name"] for h in hops[:-1]]
        if hops and via_names:
            via = "via " + " → ".join(via_names)
        elif hops:
            via = "direct connection"
        else:
            via = "no warm path — cold outreach"
        matched = c.get("matched")
        reason = (
            f"matches on {', '.join(matched[:4])}" if matched
            else f"expertise match {round(c['relevance'] * 100)}%"
        )
        results.append(
            {
                "person": {k: person[k] for k in ("id", "name", "title", "org_unit", "is_real")},
                "score": round(score, 4),
                "relevance": round(c["relevance"], 3),
                "path_strength": round(strength, 3),
                "hops": len(hops),
                "path": hops,
                "why": f"{reason} · {via}",
                "snippet": c["snippet"][:160],
            }
        )

    results.sort(key=lambda r: -r["score"])
    return results[:limit]


def _edge_info(conn, a: int, b: int) -> dict:
    row = conn.execute(
        text(
            "SELECT type, weight, evidence FROM edges "
            "WHERE (src = :a AND dst = :b) OR (src = :b AND dst = :a) "
            "ORDER BY weight DESC LIMIT 1"
        ),
        {"a": a, "b": b},
    ).first()
    if row is None:
        return {"type": "?", "weight": 0, "evidence": ""}
    return {"type": row.type, "weight": row.weight, "evidence": row.evidence}


# --- Edge building for a new (CV-uploaded) person -------------------------------

def _overlap_weight(base, s1, e1, s2, e2):
    s = max(s1 or 0, s2 or 0)
    e = min(e1 or THIS_YEAR, e2 or THIS_YEAR)
    if s > e:
        return None, None, None
    overlap = min(1.0, (e - s + 1) / 3)
    recency = math.exp(-0.17 * max(0, THIS_YEAR - e))
    return max(0.05, min(0.95, round(base * overlap * recency, 3))), s, e


def build_edges_for_person(conn, pid: int) -> int:
    """Create employer/project/semantic edges for one person. Returns count."""
    created = 0

    def insert(other, etype, weight, s, e, evidence):
        nonlocal created
        a, b = min(pid, other), max(pid, other)
        res = conn.execute(
            text(
                "INSERT INTO edges (src, dst, type, weight, started_at, ended_at, evidence) "
                "VALUES (:a, :b, :t, :w, make_date(:s,1,1), make_date(:e,1,1), :ev) "
                "ON CONFLICT (src, dst, type) DO NOTHING"
            ),
            {"a": a, "b": b, "t": etype, "w": weight, "s": s or THIS_YEAR,
             "e": e or THIS_YEAR, "ev": evidence},
        )
        created += res.rowcount

    # employer overlaps
    for r in conn.execute(
        text(
            "SELECT p2.person_id AS other, p1.org, p1.started_year s1, p1.ended_year e1, "
            "p2.started_year s2, p2.ended_year e2 "
            "FROM positions p1 JOIN positions p2 "
            "ON LOWER(p1.org) = LOWER(p2.org) AND p2.person_id != p1.person_id "
            "WHERE p1.person_id = :pid"
        ),
        {"pid": pid},
    ):
        w, s, e = _overlap_weight(0.4, r.s1, r.e1, r.s2, r.e2)
        if w:
            insert(r.other, "employer", w, s, e, f"overlapped at {r.org}")

    # project overlaps
    for r in conn.execute(
        text(
            "SELECT m2.person_id AS other, m1.project, m1.started_year s1, m1.ended_year e1, "
            "m2.started_year s2, m2.ended_year e2 "
            "FROM project_memberships m1 JOIN project_memberships m2 "
            "ON LOWER(m1.project) = LOWER(m2.project) AND m2.person_id != m1.person_id "
            "WHERE m1.person_id = :pid"
        ),
        {"pid": pid},
    ):
        w, s, e = _overlap_weight(0.65, r.s1, r.e1, r.s2, r.e2)
        if w:
            insert(r.other, "project", w, s, e, f"both on project {r.project}")

    # semantic "you should know each other" edges (needs embeddings)
    for r in conn.execute(
        text(
            "SELECT f2.person_id AS other, 1 - (f2.embedding <=> f1.embedding) AS sim "
            "FROM facets f1, facets f2 "
            "WHERE f1.person_id = :pid AND f1.kind = 'expertise' AND f1.embedding IS NOT NULL "
            "AND f2.kind = 'expertise' AND f2.embedding IS NOT NULL AND f2.person_id != :pid "
            "ORDER BY f2.embedding <=> f1.embedding LIMIT 8"
        ),
        {"pid": pid},
    ):
        sim = float(r.sim)
        if sim > 0.5:
            insert(r.other, "semantic", round(0.2 + 0.3 * sim, 3), THIS_YEAR, THIS_YEAR,
                   "similar expertise — you should know each other")

    return created
