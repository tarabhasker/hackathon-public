"""Hackathon demo data for Find the Target.

Sets up the story: Fiona (a BD lead, Premium) searches "Intel Managing
Director" and the graph lights up her route to the Managing Director of Intel
Malaysia, hop by hop:

    Fiona  ->  Tan Ying Xin (Chris)  ->  Tara Zhang  ->  Daniel Rahman (Intel MD)
           worked together          former teammates      Quantla board (public record)

That 3-hop route (~17%, moderate) beats Fiona's own 1-hop link to him (an
Intel overlap ten years ago, public record, ~4%, weak), which is the point:
strength beats hop count.

The target is a FICTIONAL person (rename via DEMO_TARGET below). Everything is
idempotent: run it again after ./seed.sh, which replaces the synthetic people.

    docker compose run --rm backend python seed_demo.py
"""
import json
import random

from sqlalchemy import text

import auth
from engine import TARGET_MAX_HOPS, load_graph, strongest_path
from main import engine
from target import match_targets, org_key, reach, save_external

DEMO_EMAIL = "ft-test@example.test"
DEMO_PASSWORD = "ft-test-pass-1"
DEMO_NAME = "Fiona Test"
INTRODUCER_REAL = "Tan Ying Xin (Chris)"  # a real profile; created only if missing
INTRODUCER_SYNTHETIC = "Tara Zhang"        # from seed.py's fixed-seed synthetic org

DEMO_TARGET = {
    "name": "Daniel Rahman",
    "title": "Managing Director",
    "company": "Intel Malaysia",
    "employers": [
        {"org": "Intel Malaysia", "start_year": 2019, "end_year": None},
        {"org": "Intel Malaysia Sdn Bhd", "start_year": 2014, "end_year": 2019},
        {"org": "Hitachi Energy Malaysia Sdn. Bhd.", "start_year": 2005, "end_year": 2013},
    ],
    "schools": ["Monash"],
    "boards": ["Quantla"],
    "sources": [],
    "confidence": "high",
}

OLD_TEST_NAMES = ("Zz Test Target", "Zz Cold Target")


def upsert_edge(conn, a, b, etype, weight, evidence, start=2016, end=2026):
    conn.execute(
        text(
            "INSERT INTO edges (src, dst, type, weight, started_at, ended_at, evidence) "
            "VALUES (:a, :b, :t, :w, make_date(:s,1,1), make_date(:e,1,1), :ev) "
            "ON CONFLICT (src, dst, type) DO UPDATE SET weight = EXCLUDED.weight, "
            "evidence = EXCLUDED.evidence"
        ),
        {"a": min(a, b), "b": max(a, b), "t": etype, "w": weight, "s": start, "e": end, "ev": evidence},
    )


def person_id(conn, name, kind="staff"):
    return conn.execute(
        text("SELECT id FROM people WHERE name = :n AND kind = :k ORDER BY id LIMIT 1"),
        {"n": name, "k": kind},
    ).scalar()


def ensure_person(conn, name, title, unit, employers):
    pid = person_id(conn, name)
    if pid:
        return pid
    pid = conn.execute(
        text(
            "INSERT INTO people (name, title, org_unit, ask_me_about, is_real) "
            "VALUES (:n, :t, :u, :a, true) RETURNING id"
        ),
        {"n": name, "t": title, "u": unit, "a": "tenders, semiconductors"},
    ).scalar_one()
    for org, s, e in employers:
        conn.execute(
            text("INSERT INTO positions (person_id, org, started_year, ended_year) VALUES (:p, :o, :s, :e)"),
            {"p": pid, "o": org, "s": s, "e": e},
        )
    conn.execute(
        text("INSERT INTO facets (person_id, kind, text) VALUES (:p, 'expertise', :t)"),
        {"p": pid, "t": f"{title} in {unit}."},
    )
    return pid


def main():
    with engine.begin() as conn:
        # --- Fiona: a Premium BD lead who once worked at Intel Malaysia
        fiona = ensure_person(
            conn, DEMO_NAME, "BD Lead", "Business Development",
            [("VAT Manufacturing Malaysia Sdn. Bhd.", 2019, None), ("Intel Malaysia Sdn Bhd", 2012, 2016)],
        )
        user = conn.execute(text("SELECT id FROM users WHERE email = :e"), {"e": DEMO_EMAIL}).scalar()
        if user is None:
            user = conn.execute(
                text("INSERT INTO users (email, password_hash, person_id) VALUES (:e, :h, :p) RETURNING id"),
                {"e": DEMO_EMAIL, "h": auth.hash_password(DEMO_PASSWORD), "p": fiona},
            ).scalar_one()
        conn.execute(
            text("UPDATE users SET plan = 'premium', person_id = :p WHERE id = :u"),
            {"p": fiona, "u": user},
        )

        chris = ensure_person(
            conn, INTRODUCER_REAL, "Product Design Engineer", "Engineering",
            [("VAT Manufacturing Malaysia Sdn. Bhd.", 2024, 2025),
             ("Hitachi Energy Malaysia Sdn. Bhd.", 2021, 2022)],
        )
        tara = person_id(conn, INTRODUCER_SYNTHETIC)
        if tara is None:
            raise SystemExit(f"{INTRODUCER_SYNTHETIC} not found: run ./seed.sh first")

        # --- Clear the earlier hand-made test targets
        conn.execute(
            text("DELETE FROM target_lookups WHERE query_key LIKE 'ft-test|%' OR chosen_person_id IN "
                 "(SELECT id FROM people WHERE kind = 'external' AND name = ANY(:n))"),
            {"n": list(OLD_TEST_NAMES)},
        )
        conn.execute(
            text("DELETE FROM people WHERE kind = 'external' AND name = ANY(:n)"),
            {"n": list(OLD_TEST_NAMES)},
        )

        # --- The target, saved exactly as a confirmed web lookup would be
        target = save_external(conn, DEMO_TARGET, DEMO_TARGET["title"])

        # --- The route: You -> Chris -> Tara -> Daniel
        upsert_edge(conn, fiona, chris, "declared", 0.6, "worked together at VAT Manufacturing", 2024, 2025)
        upsert_edge(conn, chris, tara, "declared", 0.7, "former teammates on a supplier audit", 2022, 2024)
        upsert_edge(conn, tara, target, "board", 0.3,
                    "Quantla board, 2016–2018 (public record)", 2016, 2018)

        # --- A fuller neighbourhood for Fiona, kept away from the route so
        # the demo path stays the strongest one
        near_route = set(
            conn.execute(
                text("SELECT CASE WHEN src = :t THEN dst ELSE src END FROM edges "
                     "WHERE src = :t OR dst = :t"),
                {"t": tara},
            ).scalars()
        ) | {tara, chris, fiona, target}
        pool = [
            pid for pid in conn.execute(
                text("SELECT id FROM people WHERE kind = 'staff' AND is_real = false ORDER BY id")
            ).scalars()
            if pid not in near_route
        ]
        rng = random.Random(7)
        for other in rng.sample(pool, k=min(6, len(pool))):
            upsert_edge(conn, fiona, other, "declared", round(rng.uniform(0.35, 0.55), 3),
                        "declared connection", 2023, 2026)

        # --- A cached lookup, so the Find the Target page works offline too
        report = reach(conn, fiona, target)
        conn.execute(
            text("DELETE FROM target_lookups WHERE user_id = :u AND chosen_person_id = :p"),
            {"u": user, "p": target},
        )
        conn.execute(
            text(
                "INSERT INTO target_lookups (user_id, company, role, query_key, candidates, sources, "
                "  chosen_person_id, report, best_rung) "
                "VALUES (:u, :c, :r, :k, CAST(:cand AS jsonb), '[]', :p, CAST(:rep AS jsonb), :b)"
            ),
            {
                "u": user, "c": DEMO_TARGET["company"], "r": DEMO_TARGET["title"],
                "k": f"{org_key(DEMO_TARGET['company'])}|{DEMO_TARGET['title'].lower()}",
                "cand": json.dumps([DEMO_TARGET]), "p": target,
                "rep": json.dumps(report), "b": report["best_rung"],
            },
        )

        # --- Check the story holds
        G = load_graph(conn)
        found = strongest_path(G, fiona, target, max_hops=TARGET_MAX_HOPS)
        names = dict(conn.execute(text("SELECT id, name FROM people")).all())
        matches = [t["name"] for t in match_targets(conn, "Intel Managing Director")]

    print(f"Demo account: {DEMO_EMAIL} / {DEMO_PASSWORD} (Premium)")
    print(f"Target: {DEMO_TARGET['name']}, {DEMO_TARGET['title']}, {DEMO_TARGET['company']} (id {target})")
    print(f"Search 'Intel Managing Director' matches: {matches}")
    if found:
        path, strength = found
        print(f"Strongest path ({len(path) - 1} hops, {strength:.1%}): "
              + " -> ".join(names[n] for n in path))
    else:
        print("WARNING: no path from Fiona to the target")


if __name__ == "__main__":
    main()
