"""Seed a deterministic synthetic organisation for 6 Degrees demos.

Run inside the backend container (db must be up):

    ./seed.sh                      # people, facets, edges — no API needed
    ./seed.sh --with-embeddings    # also embed facets via Gemini (needs GOOGLE_API_KEY)

Idempotent: wipes and re-creates the synthetic data every run (rows with
is_real=true are preserved). Fixed random seed, so everyone on the team
gets the identical network.
"""
import argparse
import datetime as dt
import itertools
import math
import os
import random

from sqlalchemy import text

from main import engine

rng = random.Random(42)
THIS_YEAR = 2026

FIRST = (
    "Aisha Tara Wei Mei Arun Priya Daniel Hana Jun Farah Amir Chloe Ethan "
    "Nadia Ken Lily Omar Grace Ravi Sofia Marcus Yuki Ibrahim Elena Zhi "
    "Kavya Liam Noor Felix Anya Dev Maya Owen Sara Tomas Ira Jonah Leila "
    "Victor Zara"
).split()
LAST = (
    "Tan Lim Kumar Chen Rahman Lee Ng Patel Wong Singh Osman Zhang Nair "
    "Ho Ismail Garcia Khoo Yusof Rao Ong Hassan Chia Pillai Teo Abdullah "
    "Foo Menon Chan Baker Sharma Goh Ali Low Das Yap Hughes Koh Bakar Sim Woo"
).split()

ORG_UNITS = ["Platform", "Data", "Mobile", "Web", "Infra", "Design", "Product", "Delivery"]
TITLE_LADDER = ["Junior", "", "Senior", "Lead", "Principal"]
ROLE_BY_UNIT = {
    "Platform": "Engineer",
    "Data": "Data Scientist",
    "Mobile": "Mobile Engineer",
    "Web": "Frontend Engineer",
    "Infra": "DevOps Engineer",
    "Design": "Designer",
    "Product": "Product Manager",
    "Delivery": "Delivery Manager",
}
SKILLS_BY_UNIT = {
    "Platform": ["Python", "FastAPI", "Postgres", "APIs", "Kafka", "auth systems"],
    "Data": ["machine learning", "SQL", "BigQuery", "embeddings", "forecasting", "dbt"],
    "Mobile": ["Flutter", "iOS", "Android", "offline sync", "push notifications"],
    "Web": ["React", "TypeScript", "accessibility", "design systems", "Next.js"],
    "Infra": ["Terraform", "GCP", "Kubernetes", "CI/CD", "networking", "monitoring"],
    "Design": ["Figma", "user research", "prototyping", "design systems", "UX writing"],
    "Product": ["roadmapping", "user interviews", "pricing", "analytics", "A/B testing"],
    "Delivery": ["tendering", "procurement", "contracts", "scheduling", "stakeholders"],
}
PROJECTS = [
    "Atlas", "Beacon", "Causeway", "Drift", "Ember", "Foxtrot", "Gantry",
    "Harbour", "Ion", "Jigsaw", "Krait", "Lantern", "Meridian", "Nimbus",
    "Oriole", "Pylon",
]
EMPLOYERS = [
    "Northgate Bank", "Sunway Digital", "Acme Rail", "Quantla", "Veridian Group",
    "Kestrel Systems", "BlueHarbour", "Mersing Tech",
]
SCHOOLS = ["UM", "NTU", "Monash", "Taylor's", "UTM", "Imperial", "UNSW"]


def make_people(n=200):
    names = rng.sample(list(itertools.product(FIRST, LAST)), n)
    people = []
    for i, (fn, ln) in enumerate(names):
        unit = rng.choice(ORG_UNITS)
        level = rng.choices(TITLE_LADDER, weights=[2, 4, 3, 2, 1])[0]
        title = f"{level} {ROLE_BY_UNIT[unit]}".strip()
        skills = rng.sample(SKILLS_BY_UNIT[unit], k=rng.randint(3, 5))
        # a cross-unit skill makes search results more interesting
        other_unit = rng.choice([u for u in ORG_UNITS if u != unit])
        if rng.random() < 0.35:
            skills.append(rng.choice(SKILLS_BY_UNIT[other_unit]))
        joined = THIS_YEAR - rng.randint(0, 9)
        # past employers, newest first, each with a year range
        employers = []
        year = joined
        for _ in range(rng.randint(0, 3)):
            span = rng.randint(1, 5)
            employers.append((rng.choice(EMPLOYERS), year - span, year))
            year -= span
        projects = []
        for p in rng.sample(PROJECTS, k=rng.randint(1, 3)):
            end = THIS_YEAR - rng.randint(0, 4)
            projects.append((p, end - rng.randint(1, 2), end))
        people.append({
            "i": i,
            "name": f"{fn} {ln}",
            "unit": unit,
            "title": title,
            "skills": skills,
            "school": rng.choice(SCHOOLS),
            "joined": joined,
            "employers": employers,
            "projects": projects,
        })
    return people


def facet_texts(p):
    top = p["skills"][:2]
    wants = rng.sample(
        [s for u in ORG_UNITS for s in SKILLS_BY_UNIT[u] if s not in p["skills"]], k=2
    )
    proj = ", ".join(name for name, _, _ in p["projects"])
    expertise = (
        f"{p['title']} in {p['unit']}. Skilled in {', '.join(p['skills'])}. "
        f"Worked on projects {proj}."
    )
    ask = f"Wants to learn {wants[0]} and {wants[1]}."
    offer = f"Happy to help with {top[0]} and {top[1]}; open to mentoring and quick questions."
    return expertise, ask, offer


def recency_factor(end_year):
    """1.0 for current work, decaying ~15%/year since it ended."""
    years_ago = max(0, THIS_YEAR - end_year)
    return math.exp(-0.17 * years_ago)


def clamp(w):
    return max(0.05, min(0.95, round(w, 3)))


def make_edges(people):
    edges = {}  # (a, b, type) -> row, a < b

    def add(a, b, etype, weight, start, end, evidence):
        if a == b:
            return
        key = (min(a, b), max(a, b), etype)
        row = edges.get(key)
        if row is None or weight > row["weight"]:
            edges[key] = {
                "src": key[0], "dst": key[1], "type": etype, "weight": clamp(weight),
                "started_at": dt.date(start, 1, 1), "ended_at": dt.date(end, 1, 1),
                "evidence": evidence,
            }

    # same project, overlapping years — the strongest signal
    by_project = {}
    for p in people:
        for name, s, e in p["projects"]:
            by_project.setdefault(name, []).append((p["i"], s, e))
    for name, members in by_project.items():
        for (a, s1, e1), (b, s2, e2) in itertools.combinations(members, 2):
            s, e = max(s1, s2), min(e1, e2)
            if s > e:
                continue
            overlap = min(1.0, (e - s + 1) / 3)
            add(a, b, "project", 0.65 * overlap * recency_factor(e), s, e,
                f"both on project {name}")

    # same employer, overlapping years
    by_employer = {}
    for p in people:
        for name, s, e in p["employers"]:
            by_employer.setdefault(name, []).append((p["i"], s, e))
    for name, members in by_employer.items():
        for (a, s1, e1), (b, s2, e2) in itertools.combinations(members, 2):
            s, e = max(s1, s2), min(e1, e2)
            if s > e:
                continue
            overlap = min(1.0, (e - s + 1) / 3)
            add(a, b, "employer", 0.4 * overlap * recency_factor(e), s, e,
                f"overlapped at {name}")

    # same school — weak, sampled so it stays sparse
    by_school = {}
    for p in people:
        by_school.setdefault(p["school"], []).append(p["i"])
    for name, members in by_school.items():
        pairs = list(itertools.combinations(members, 2))
        for a, b in rng.sample(pairs, k=min(len(pairs), len(members))):
            add(a, b, "school", 0.18, THIS_YEAR - 10, THIS_YEAR - 5, f"both studied at {name}")

    # declared connections — random, mid strength
    n = len(people)
    for _ in range(int(n * 1.5)):
        a, b = rng.sample(range(n), 2)
        add(a, b, "declared", rng.uniform(0.3, 0.55), THIS_YEAR - 2, THIS_YEAR,
            "declared connection")

    return list(edges.values())


def embed_all(conn):
    import llm  # deferred so the base seed needs no key

    if not os.environ.get("GOOGLE_API_KEY"):
        raise SystemExit("GOOGLE_API_KEY is not set (backend/.env) — cannot embed.")

    rows = conn.execute(
        text("SELECT id, text FROM facets WHERE embedding IS NULL ORDER BY id")
    ).all()
    print(f"Embedding {len(rows)} facets with {llm.EMBED_MODEL}…", flush=True)
    # Free tier allows 100 embed requests/min and each text counts as one,
    # so stay under it and wait out any 429 we hit anyway. Resumable: only
    # NULL-embedding rows are selected, so a rerun picks up where this left off.
    import time

    BATCH = 95
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        while True:
            try:
                vectors = llm.embed_texts([r.text for r in batch])
                break
            except Exception as e:
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    print("  rate limited — waiting 25s…", flush=True)
                    time.sleep(25)
                else:
                    raise
        for row, emb in zip(batch, vectors):
            vec = "[" + ",".join(f"{v:.6f}" for v in emb) + "]"
            conn.execute(
                text("UPDATE facets SET embedding = :v ::vector WHERE id = :id"),
                {"v": vec, "id": row.id},
            )
        conn.commit()
        done = min(i + BATCH, len(rows))
        print(f"  {done}/{len(rows)}", flush=True)
        if done < len(rows):
            time.sleep(61)  # stay under the per-minute request quota


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-embeddings", action="store_true")
    parser.add_argument("--people", type=int, default=200)
    args = parser.parse_args()

    people = make_people(args.people)
    edges = make_edges(people)

    with engine.connect() as conn:
        # wipe previous synthetic data; CV-uploaded real people (is_real) survive
        conn.execute(text(
            "DELETE FROM people WHERE is_real = false"
        ))
        conn.commit()

        id_map = {}
        for p in people:
            email = p["name"].lower().replace(" ", ".") + "@example.test"
            pid = conn.execute(
                text(
                    "INSERT INTO people (name, title, org_unit, email, ask_me_about, is_real) "
                    "VALUES (:n, :t, :u, :e, :a, false) RETURNING id"
                ),
                {
                    "n": p["name"], "t": p["title"], "u": p["unit"], "e": email,
                    "a": ", ".join(p["skills"][:3]),
                },
            ).scalar_one()
            id_map[p["i"]] = pid

            for org, s, e in p["employers"]:
                conn.execute(
                    text(
                        "INSERT INTO positions (person_id, org, started_year, ended_year) "
                        "VALUES (:id, :org, :s, :e)"
                    ),
                    {"id": pid, "org": org, "s": s, "e": e},
                )
            for proj, s, e in p["projects"]:
                conn.execute(
                    text(
                        "INSERT INTO project_memberships (person_id, project, started_year, ended_year) "
                        "VALUES (:id, :proj, :s, :e)"
                    ),
                    {"id": pid, "proj": proj, "s": s, "e": e},
                )

            expertise, ask, offer = facet_texts(p)
            conn.execute(
                text(
                    "INSERT INTO facets (person_id, kind, text) VALUES "
                    "(:id, 'expertise', :e), (:id, 'ask', :a), (:id, 'offer', :o)"
                ),
                {"id": pid, "e": expertise, "a": ask, "o": offer},
            )
            conn.execute(
                text(
                    "INSERT INTO profiles_raw (person_id, source, raw_text) "
                    "VALUES (:id, 'synthetic', :raw)"
                ),
                {"id": pid, "raw": expertise},
            )

        conn.execute(
            text(
                "INSERT INTO edges (src, dst, type, weight, started_at, ended_at, evidence) "
                "VALUES (:src, :dst, :type, :weight, :started_at, :ended_at, :evidence)"
            ),
            [
                {**e, "src": id_map[e["src"]], "dst": id_map[e["dst"]]}
                for e in edges
            ],
        )
        conn.commit()

        # Wiping synthetic people cascades away real users' edges to them, so
        # re-attach each real user to a few synthetic people. Otherwise the
        # logged-in user sits alone in the network view.
        real_ids = conn.execute(
            text("SELECT id FROM people WHERE is_real = true ORDER BY id")
        ).scalars().all()
        synthetic_ids = list(id_map.values())
        for rid in real_ids:
            for other in rng.sample(synthetic_ids, k=min(6, len(synthetic_ids))):
                conn.execute(
                    text(
                        "INSERT INTO edges (src, dst, type, weight, started_at, ended_at, evidence) "
                        "VALUES (:a, :b, 'declared', :w, :s, :e, 'declared connection (seeded)') "
                        "ON CONFLICT (src, dst, type) DO NOTHING"
                    ),
                    {
                        "a": min(rid, other), "b": max(rid, other),
                        "w": round(rng.uniform(0.4, 0.7), 3),
                        "s": dt.date(THIS_YEAR - 2, 1, 1), "e": dt.date(THIS_YEAR, 1, 1),
                    },
                )
        conn.commit()
        if real_ids:
            print(f"Linked {len(real_ids)} real user(s) to synthetic people")

        counts = conn.execute(text(
            "SELECT (SELECT COUNT(*) FROM people) AS people, "
            "(SELECT COUNT(*) FROM facets) AS facets, "
            "(SELECT COUNT(*) FROM edges) AS edges"
        )).one()
        print(f"Seeded: {counts.people} people, {counts.facets} facets, {counts.edges} edges")

        if args.with_embeddings:
            embed_all(conn)
            print("Embeddings done.")


if __name__ == "__main__":
    main()
