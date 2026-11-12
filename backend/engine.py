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


def avatar_url(key: str | None) -> str | None:
    """Public path of a person's photo, or None if they haven't uploaded one."""
    return f"/api/avatars/{key}" if key else None


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

    # Direct name matches rank first: typing someone's name should always find
    # them, even though the semantic index only covers expertise text.
    by_id = {c["person_id"]: c for c in candidates}
    for r in conn.execute(
        text("SELECT id, name FROM people WHERE name ILIKE :q AND id != :me LIMIT 10"),
        {"q": f"%{query.strip()}%", "me": requester_id},
    ):
        hit = by_id.get(r.id)
        if hit is None:
            candidates.append(
                {"person_id": r.id, "relevance": 0.99, "snippet": r.name, "matched": ["name"]}
            )
        else:
            hit["relevance"] = max(hit["relevance"], 0.99)
            hit["matched"] = ["name"] + [m for m in hit.get("matched", []) if m != "name"]

    # Looks like a name search? Then don't pad the results with loose expertise
    # matches — embedding similarity to a person's name is noise, and "ethan"
    # should return Ethan, not four strangers at ~50% relevance.
    if any("name" in (c.get("matched") or []) for c in candidates):
        candidates = [
            c for c in candidates
            if "name" in (c.get("matched") or []) or c["relevance"] >= 0.55
        ]

    if not candidates:
        return []

    G = load_graph(conn)
    ids = {c["person_id"] for c in candidates} | {requester_id}
    people = {
        r.id: dict(r._mapping)
        for r in conn.execute(
            text(
                "SELECT id, name, title, org_unit, opt_in, is_real, avatar_key, linkedin_url "
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
                "person": {
                    **{k: person[k] for k in ("id", "name", "title", "org_unit", "is_real")},
                    "avatar_url": avatar_url(person["avatar_key"]),
                    "linkedin_url": person["linkedin_url"],
                },
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


# --- Network view ---------------------------------------------------------------

MAX_FIRST = 6        # closest direct ties shown around the requester
MAX_PER_DEPTH = 8    # strongest people shown on each ring beyond the first
MAX_PER_VIA = 3      # keep each ring spread across introducers
WEAK_TIE = 0.3       # edges below this weight render as weak ties
MAX_CROSS_LINKS = 20 # extra ties drawn between shown people, beyond the path tree
DEFAULT_DEGREES = 3  # how far out the view reaches unless the client asks otherwise
MAX_DEGREES = 6


def network(
    conn, requester_id: int, focus_id: int | None = None, degrees: int = DEFAULT_DEGREES
) -> dict:
    """The requester's neighbourhood out to `degrees` hops, for the graph view.

    Nodes are the strongest people on each ring (by strongest-path strength),
    plus everyone on the strongest path to `focus_id` when given. Each node
    carries `via` (the previous person on its strongest path from the
    requester) so the client can light up the path.
    """
    degrees = max(1, min(MAX_DEGREES, int(degrees)))
    G = load_graph(conn)
    # all reachable paths (up to the hard cap), so a focus target further out
    # than the chosen degree still gets its path drawn
    all_paths: dict[int, list[int]] = {requester_id: [requester_id]}
    if requester_id in G:
        _, found = nx.single_source_dijkstra(G, requester_id, weight="cost")
        all_paths = {n: p for n, p in found.items() if len(p) <= MAX_DEGREES + 1}
    paths = {n: p for n, p in all_paths.items() if len(p) <= degrees + 1}

    def strength(n):
        p = all_paths[n]
        return math.prod(G.edges[u, v]["w"] for u, v in zip(p, p[1:]))

    ranked = sorted((n for n in paths if n != requester_id), key=lambda n: -strength(n))
    chosen = {requester_id}
    per_via: dict[int, int] = {}
    # ring by ring: each depth keeps its strongest few, spread across introducers
    for depth in range(1, degrees + 1):
        cap = MAX_FIRST if depth == 1 else MAX_PER_DEPTH
        picked = 0
        for n in ranked:
            if picked >= cap:
                break
            p = paths[n]
            if len(p) - 1 != depth or n in chosen or p[-2] not in chosen:
                continue
            if depth > 1 and per_via.get(p[-2], 0) >= MAX_PER_VIA:
                continue
            per_via[p[-2]] = per_via.get(p[-2], 0) + 1
            chosen.add(n)
            picked += 1

    focus_reachable = None
    if focus_id is not None and focus_id != requester_id:
        focus_reachable = focus_id in all_paths
        if focus_reachable:
            chosen.update(all_paths[focus_id])
            for n in all_paths[focus_id]:
                paths.setdefault(n, all_paths[n])

    people = {
        r.id: r
        for r in conn.execute(
            text(
                "SELECT p.id, p.name, p.title, p.org_unit, p.is_real, p.avatar_key, p.linkedin_url, cur.org AS company, "
                "  COALESCE(acct.email, p.email) AS email "
                "FROM people p "
                "LEFT JOIN LATERAL ("
                "  SELECT email FROM users WHERE person_id = p.id ORDER BY id LIMIT 1"
                ") acct ON true "
                "LEFT JOIN LATERAL ("
                "  SELECT org FROM positions WHERE person_id = p.id "
                "  ORDER BY (ended_year IS NULL) DESC, COALESCE(ended_year, 9999) DESC, "
                "           started_year DESC NULLS LAST LIMIT 1"
                ") cur ON true "
                "WHERE p.id = ANY(:ids)"
            ),
            {"ids": list(chosen)},
        )
    }
    nodes = []
    for n in sorted(chosen, key=lambda n: (len(paths[n]), -strength(n) if n != requester_id else 0)):
        person = people.get(n)
        if person is None:
            continue
        p = paths[n]
        nodes.append(
            {
                "id": n,
                "name": person.name,
                "title": person.title,
                "org_unit": person.org_unit,
                "company": person.company,
                "is_real": person.is_real,
                "avatar_url": avatar_url(person.avatar_key),
                "linkedin_url": person.linkedin_url,
                "depth": len(p) - 1,
                # only for people you're directly connected to (e.g. for a coffee invite)
                "email": person.email if len(p) == 2 else None,
                "via": p[-2] if len(p) > 1 else None,
                "strength": round(strength(n), 3) if n != requester_id else 1.0,
            }
        )

    # Strongest evidence per pair, for edges between shown people
    evidence: dict[tuple[int, int], str] = {}
    for r in conn.execute(
        text(
            "SELECT src, dst, type, evidence FROM edges "
            "WHERE src = ANY(:ids) AND dst = ANY(:ids) ORDER BY weight"
        ),
        {"ids": list(chosen)},
    ):
        evidence[(min(r.src, r.dst), max(r.src, r.dst))] = r.evidence or r.type

    def edge_row(a, b, w):
        return {
            "a": a,
            "b": b,
            "weight": round(w, 3),
            "weak": w < WEAK_TIE,
            "evidence": evidence.get((min(a, b), max(a, b)), ""),        }

    # Every strongest-path link, plus only the few strongest cross-links:
    # drawing them all turns the graph into a hairball.
    edges, cross = [], []
    for a, b in G.subgraph(chosen).edges():
        w = G.edges[a, b]["w"]
        on_tree = paths[a][-2:] == [b, a] or paths[b][-2:] == [a, b]
        (edges if on_tree else cross).append(edge_row(a, b, w))
    cross.sort(key=lambda e: -e["weight"])
    edges += cross[:MAX_CROSS_LINKS]

    return {"nodes": nodes, "edges": edges, "focus_reachable": focus_reachable}


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
