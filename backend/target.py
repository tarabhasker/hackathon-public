"""Find the Target (premium): reach a named decision-maker at a company.

Flow: a web lookup (llm.find_target) finds who holds a role at a company and
their public career. The user confirms a candidate; save_external() stores
them as an external person (kind = 'external') whose career builds weaker,
"public record" edges to staff. reach() then works down a ladder and never
returns "no match":

  1. Path to the target        any path within TARGET_MAX_HOPS, labelled by strength
  2. Path into the company     colleagues closest to anyone else currently there
  3. Path next to the company  ex-employees, people who share the target's past
                               employers or boards (no overlap in years needed)
  4. Cold, but prepared        a drafted cold note; the account is a coverage gap

The report also lists the sources searched and how many colleagues were checked.
"""
import datetime as dt
import math
import re

import networkx as nx
from sqlalchemy import text

from engine import (
    PUBLIC_EDGE_FACTOR,
    TARGET_MAX_HOPS,
    THIS_YEAR,
    _edge_info,
    avatar_url,
    build_edges_for_person,
    load_graph,
    strongest_path,
)

STRONG = 0.3
MODERATE = 0.1
STALE_DAYS = 90
MAX_LIST = 5

_SUFFIXES = re.compile(
    r"\b(sdn|bhd|berhad|inc|incorporated|ltd|limited|llc|plc|corp|corporation|co|pte|gmbh|ag|sa|nv)\b"
)


# --- Company names ---------------------------------------------------------------

def org_key(name: str | None) -> str:
    """Normalised company name: 'Intel Malaysia Sdn. Bhd.' -> 'intel malaysia'."""
    s = (name or "").lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = _SUFFIXES.sub(" ", s)
    return " ".join(s.split())


def group_key(name: str | None) -> str:
    """First word of the company name, a loose 'same group' match (intel)."""
    key = org_key(name)
    return key.split(" ", 1)[0] if key else ""


def strength_label(strength: float) -> str:
    if strength >= STRONG:
        return "strong"
    if strength >= MODERATE:
        return "moderate"
    return "weak"


def get_or_create_org(conn, name: str) -> int:
    return conn.execute(
        text(
            "INSERT INTO organisations (name, name_key) VALUES (:n, :k) "
            "ON CONFLICT (name_key) DO UPDATE SET name = organisations.name "
            "RETURNING id"
        ),
        {"n": name.strip(), "k": org_key(name) or name.strip().lower()},
    ).scalar_one()


def _canonical_orgs(conn) -> dict[str, str]:
    """org_key -> the spelling already used in positions, so the edge builder's
    exact LOWER(org) match lines a web-found career up with staff careers."""
    out: dict[str, str] = {}
    for org in conn.execute(text("SELECT DISTINCT org FROM positions")).scalars():
        out.setdefault(org_key(org), org)
    return out


# --- Saving a confirmed candidate ------------------------------------------------

def save_external(conn, candidate: dict, role_query: str) -> int:
    """Store (or refresh) a confirmed web candidate as an external person and
    build their public-record edges. Returns the person id."""
    company = candidate["company"]
    org_id = get_or_create_org(conn, company)
    canon = _canonical_orgs(conn)

    employers = list(candidate.get("employers") or [])
    if org_key(company) not in {org_key(e["org"]) for e in employers}:
        employers.insert(0, {"org": company, "start_year": None, "end_year": None})

    existing = conn.execute(
        text(
            "SELECT id FROM people WHERE kind = 'external' AND org_id = :o "
            "AND LOWER(name) = LOWER(:n) LIMIT 1"
        ),
        {"o": org_id, "n": candidate["name"]},
    ).scalar()

    if existing:
        pid = existing
        conn.execute(
            text("UPDATE people SET title = :t WHERE id = :id"),
            {"t": candidate.get("title"), "id": pid},
        )
        # a refresh replaces the old public record wholesale
        conn.execute(text("DELETE FROM positions WHERE person_id = :id"), {"id": pid})
        conn.execute(text("DELETE FROM edges WHERE src = :id OR dst = :id"), {"id": pid})
    else:
        pid = conn.execute(
            text(
                "INSERT INTO people (name, title, org_unit, is_real, opt_in, kind, org_id) "
                "VALUES (:n, :t, :u, false, false, 'external', :o) RETURNING id"
            ),
            {"n": candidate["name"], "t": candidate.get("title"), "u": company, "o": org_id},
        ).scalar_one()

    for e in employers:
        conn.execute(
            text(
                "INSERT INTO positions (person_id, org, started_year, ended_year) "
                "VALUES (:id, :org, :s, :e)"
            ),
            {
                "id": pid,
                "org": canon.get(org_key(e["org"]), e["org"].strip()),
                "s": e.get("start_year"),
                "e": e.get("end_year"),
            },
        )

    found_at = dt.datetime.now(dt.timezone.utc).isoformat()
    sources = [{**s, "found_at": s.get("found_at") or found_at} for s in candidate.get("sources") or []]
    conn.execute(
        text(
            "INSERT INTO external_profiles (person_id, role_query, schools, boards, sources) "
            "VALUES (:id, :r, CAST(:sc AS jsonb), CAST(:b AS jsonb), CAST(:src AS jsonb)) "
            "ON CONFLICT (person_id) DO UPDATE SET role_query = EXCLUDED.role_query, "
            "schools = EXCLUDED.schools, boards = EXCLUDED.boards, sources = EXCLUDED.sources, "
            "refreshed_at = now()"
        ),
        {
            "id": pid,
            "r": role_query,
            "sc": _json(candidate.get("schools") or []),
            "b": _json(candidate.get("boards") or []),
            "src": _json(sources),
        },
    )

    build_edges_for_person(conn, pid, weight_factor=PUBLIC_EDGE_FACTOR)
    return pid


def _json(value) -> str:
    import json

    return json.dumps(value)


# --- The reach report -------------------------------------------------------------

def _people(conn, ids) -> dict[int, dict]:
    if not ids:
        return {}
    return {
        r.id: dict(r._mapping)
        for r in conn.execute(
            text(
                "SELECT id, name, title, org_unit, kind, is_real, avatar_key, linkedin_url "
                "FROM people WHERE id = ANY(:ids)"
            ),
            {"ids": list(ids)},
        )
    }


def _person_out(p: dict) -> dict:
    return {
        "id": p["id"],
        "name": p["name"],
        "title": p["title"],
        "org_unit": p["org_unit"],
        "external": p["kind"] == "external",
        "avatar_url": avatar_url(p["avatar_key"]),
        "linkedin_url": p["linkedin_url"],
    }


def _path_out(conn, G, names, path_ids: list[int]) -> dict:
    strength = math.prod(G.edges[u, v]["w"] for u, v in zip(path_ids, path_ids[1:]))
    hops = [
        {"id": h, "name": names.get(h, "?"), "edge": _edge_info(conn, u, h)}
        for u, h in zip(path_ids, path_ids[1:])
    ]
    return {
        "strength": round(strength, 4),
        "label": strength_label(strength),
        "hops": len(hops),
        "path": hops,
    }


def _path_to(conn, G, names, me: int, other: int) -> dict | None:
    if other == me:
        return {"strength": 1.0, "label": "you", "hops": 0, "path": []}
    found = strongest_path(G, me, other, max_hops=TARGET_MAX_HOPS)
    return _path_out(conn, G, names, found[0]) if found else None


def _target_row(conn, target_id: int) -> dict | None:
    row = conn.execute(
        text(
            "SELECT p.id, p.name, p.title, p.org_id, o.name AS company, "
            "  x.schools, x.boards, x.sources, x.role_query, x.found_at, x.refreshed_at "
            "FROM people p "
            "LEFT JOIN organisations o ON o.id = p.org_id "
            "LEFT JOIN external_profiles x ON x.person_id = p.id "
            "WHERE p.id = :id AND p.kind = 'external'"
        ),
        {"id": target_id},
    ).mappings().first()
    if row is None:
        return None
    t = dict(row)
    t["employers"] = [
        {"org": r.org, "start_year": r.started_year, "end_year": r.ended_year}
        for r in conn.execute(
            text(
                "SELECT org, started_year, ended_year FROM positions WHERE person_id = :id "
                "ORDER BY (ended_year IS NULL) DESC, COALESCE(ended_year, 9999) DESC"
            ),
            {"id": target_id},
        )
    ]
    return t


def _years(s, e) -> str:
    if s and e:
        return f"{s}–{e}"
    if s:
        return f"{s}–now"
    if e:
        return f"until {e}"
    return ""


def reach(conn, requester_id: int, target_id: int, cold_draft=None) -> dict | None:
    """The best-effort reach report from the requester to an external target.

    cold_draft(target, requester) -> str | None is called only when the ladder
    reaches rung 4, so the LLM is not spent on reports that found a path.
    """
    target = _target_row(conn, target_id)
    if target is None:
        return None
    company = target["company"] or ""
    company_key = org_key(company)
    company_group = group_key(company)

    G = load_graph(conn)
    names = dict(conn.execute(text("SELECT id, name FROM people")).all())
    staff_ids = set(
        conn.execute(
            text("SELECT id FROM people WHERE kind = 'staff' AND id != :me"),
            {"me": requester_id},
        ).scalars()
    )

    # --- Rung 1: a path to the target, and the colleagues closest to them
    rung1_path = _path_to(conn, G, names, requester_id, target_id)
    closest = []
    if target_id in G:
        dist, paths = nx.single_source_dijkstra(G, target_id, weight="cost")
        ranked = sorted(
            (n for n in dist if n in staff_ids and len(paths[n]) - 1 <= TARGET_MAX_HOPS),
            key=lambda n: dist[n],
        )[:MAX_LIST]
        meta = _people(conn, ranked)
        for n in ranked:
            to_target = _path_out(conn, G, names, list(reversed(paths[n])))
            closest.append(
                {
                    "person": _person_out(meta[n]),
                    "to_target": to_target,
                    "from_you": _path_to(conn, G, names, requester_id, n),
                }
            )

    # --- Rung 2: anyone currently at the company, and our best path to them
    insiders = []
    rows = conn.execute(
        text(
            "SELECT DISTINCT p.id, pos.org FROM people p JOIN positions pos ON pos.person_id = p.id "
            "WHERE p.id NOT IN (:t, :me) AND (pos.ended_year IS NULL OR pos.ended_year >= :y)"
        ),
        {"t": target_id, "me": requester_id, "y": THIS_YEAR},
    ).all()
    insider_ids = {r.id for r in rows if company_key and org_key(r.org) == company_key}
    insider_ids |= set(
        conn.execute(
            text("SELECT id FROM people WHERE org_id = :o AND id NOT IN (:t, :me)"),
            {"o": target["org_id"], "t": target_id, "me": requester_id},
        ).scalars()
    ) if target["org_id"] else set()
    meta = _people(conn, insider_ids)
    for n in insider_ids:
        path = _path_to(conn, G, names, requester_id, n)
        if path:
            insiders.append({"person": _person_out(meta[n]), "from_you": path})
    insiders.sort(key=lambda x: -x["from_you"]["strength"])
    insiders = insiders[:MAX_LIST]

    # --- Rung 3: people one step away from the company
    target_orgs = {org_key(e["org"]): e for e in target["employers"]}
    board_keys = {org_key(b): b for b in (target["boards"] or [])}
    neighbours: dict[int, dict] = {}
    for r in conn.execute(
        text(
            "SELECT pos.person_id AS id, pos.org, pos.started_year s, pos.ended_year e "
            "FROM positions pos JOIN people p ON p.id = pos.person_id "
            "WHERE p.kind = 'staff'"
        )
    ):
        key = org_key(r.org)
        reason = None
        if company_key and key == company_key and r.e is not None and r.e < THIS_YEAR:
            reason = f"ex-{company} ({_years(r.s, r.e)})"
        elif company_group and key != company_key and group_key(r.org) == company_group:
            reason = f"worked at {r.org} ({_years(r.s, r.e)}), same group as {company}"
        elif key in target_orgs and key != company_key:
            te = target_orgs[key]
            reason = (
                f"also worked at {r.org} ({_years(r.s, r.e)}; "
                f"{target['name'].split()[0]}: {_years(te['start_year'], te['end_year']) or 'years unknown'})"
            )
        elif key in board_keys:
            reason = f"worked at {r.org}, where {target['name'].split()[0]} sits on the board"
        if reason and r.id not in neighbours:
            neighbours[r.id] = {"reason": reason}
    meta = _people(conn, neighbours)
    next_to = []
    for n, info in neighbours.items():
        path = _path_to(conn, G, names, requester_id, n)
        next_to.append(
            {
                "person": _person_out(meta[n]),
                "reason": info["reason"],
                "is_you": n == requester_id,
                "from_you": path,
            }
        )
    next_to.sort(key=lambda x: -(x["from_you"]["strength"] if x["from_you"] else 0))
    next_to = next_to[:MAX_LIST]

    # --- Which rung did we reach?
    if rung1_path:
        best_rung = 1
    elif insiders:
        best_rung = 2
    elif any(x["from_you"] for x in next_to):
        best_rung = 3
    else:
        best_rung = 4

    # --- Rung 4: cold, but prepared
    me = _people(conn, [requester_id]).get(requester_id, {"name": "", "title": ""})
    my_orgs = conn.execute(
        text("SELECT org FROM positions WHERE person_id = :id"), {"id": requester_id}
    ).scalars().all()
    draft = None
    if best_rung == 4 and cold_draft is not None:
        draft = cold_draft(
            {
                "name": target["name"],
                "title": target["title"],
                "company": company,
                "employers": target["employers"],
            },
            {"name": me.get("name"), "title": me.get("title"), "employers": my_orgs},
        )
    if best_rung == 4 and not draft:
        first = target["name"].split()[0]
        draft = (
            f"Hi {first}, I'm {me.get('name') or 'reaching out'}"
            f"{', ' + me['title'] if me.get('title') else ''}. I've been following "
            f"{company}'s work and would value 15 minutes to introduce myself and hear "
            f"about your priorities as {target['title']}. Would you be open to a short "
            f"call in the coming weeks?"
        )

    refreshed = target["refreshed_at"]
    stale = bool(refreshed and (dt.datetime.now(dt.timezone.utc) - refreshed).days > STALE_DAYS)

    return {
        "target": {
            "id": target["id"],
            "name": target["name"],
            "title": target["title"],
            "company": company,
            # `current` marks the target's own company (spellings differ:
            # "Intel Malaysia" vs "Intel Malaysia Sdn Bhd")
            "employers": [
                {**e, "current": org_key(e["org"]) == company_key} for e in target["employers"]
            ],
            "schools": target["schools"] or [],
            "boards": target["boards"] or [],
            "found_at": target["found_at"].isoformat() if target["found_at"] else None,
            "refreshed_at": refreshed.isoformat() if refreshed else None,
            "stale": stale,
        },
        "sources": target["sources"] or [],
        "colleagues_checked": len(staff_ids),
        "best_rung": best_rung,
        "rungs": [
            {
                "rung": 1,
                "title": "Path to the target",
                "found": rung1_path is not None,
                "path": rung1_path,
                "closest": closest,
            },
            {
                "rung": 2,
                "title": f"Path into {company}",
                "found": bool(insiders),
                "people": insiders,
            },
            {
                "rung": 3,
                "title": f"Path next to {company}",
                "found": any(x["from_you"] for x in next_to),
                "people": next_to,
            },
            {
                "rung": 4,
                "title": "Cold, but prepared",
                "found": best_rung == 4,
                "draft": draft,
                "coverage_gap": best_rung == 4,
            },
        ],
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


# --- Matching saved targets from the network search box ---------------------------

# Short role words people type, expanded to the words a title actually uses
_ROLE_ALIASES = {
    "md": ["managing", "director"],
    "ceo": ["chief", "executive"],
    "cfo": ["chief", "financial"],
    "cto": ["chief", "technology"],
    "coo": ["chief", "operating"],
    "gm": ["general", "manager"],
    "vp": ["vice", "president"],
}


def _query_tokens(query: str) -> set[str]:
    out = set()
    for t in re.findall(r"[a-z0-9]+", query.lower()):
        if t in _ROLE_ALIASES:
            out.update(_ROLE_ALIASES[t])
        elif len(t) > 2 and t not in {"the", "and", "for", "who", "head"}:
            out.add(t)
    return out


def match_targets(conn, query: str, limit: int = 3) -> list[dict]:
    """Saved external targets whose name, title or company match the query
    ("Intel Managing Director", "MD Intel Malaysia"). Most of the query's
    words must match, so a bare skill search never surfaces a target."""
    q = _query_tokens(query)
    if not q:
        return []
    hits = []
    for r in conn.execute(
        text(
            "SELECT p.id, p.name, p.title, p.avatar_key, o.name AS company "
            "FROM people p LEFT JOIN organisations o ON o.id = p.org_id "
            "WHERE p.kind = 'external'"
        )
    ):
        words = set(re.findall(r"[a-z0-9]+", f"{r.name} {r.title or ''} {r.company or ''}".lower()))
        score = len(q & words) / len(q)
        if score >= 0.6:
            hits.append((score, r))
    hits.sort(key=lambda h: -h[0])
    return [
        {
            "id": r.id,
            "name": r.name,
            "title": r.title,
            "org_unit": r.company,
            "company": r.company,
            "external": True,
            "avatar_url": avatar_url(r.avatar_key),
        }
        for _, r in hits[:limit]
    ]
