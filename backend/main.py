import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

load_dotenv()

import auth  # noqa: E402  (reads SECRET_KEY, so must follow load_dotenv)

BASE_DIR = Path(__file__).resolve().parent

# Postgres connection; docker-compose supplies this for local dev,
# the hosting platform supplies it in production
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://hackathon:hackathon@localhost:5432/hackathon",
)

# Hosted Postgres providers often hand out URLs starting with postgres://
# or postgresql:// — normalize to the psycopg3 driver
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Frontend dev server origins allowed to call this API (dev only; in
# production the frontend is served from this same app, so CORS is moot)
ALLOWED_ORIGINS = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
]

# Demo fallback so every teammate's local DB gets the same admin account out of
# the box. Set ADMIN_EMAIL/ADMIN_PASSWORD to override — and always in any real
# deployment; these defaults are for local hackathon demos only.
DEMO_ADMIN_EMAIL = "admin@demo.local"
DEMO_ADMIN_PASSWORD = "letmein-admin"


def ensure_admin() -> None:
    """Create (or promote) the admin account named by ADMIN_EMAIL/ADMIN_PASSWORD."""
    email = (os.environ.get("ADMIN_EMAIL") or DEMO_ADMIN_EMAIL).strip().lower()
    password = os.environ.get("ADMIN_PASSWORD") or DEMO_ADMIN_PASSWORD
    if not email or not password:
        return
    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT id, is_admin FROM users WHERE email = :e"), {"e": email}
        ).first()
        if existing is None:
            conn.execute(
                text(
                    "INSERT INTO users (email, password_hash, is_admin) "
                    "VALUES (:e, :h, true)"
                ),
                {"e": email, "h": auth.hash_password(password)},
            )
            print(f"Admin account created: {email}", flush=True)
        elif not existing.is_admin:
            conn.execute(
                text("UPDATE users SET is_admin = true WHERE id = :id"),
                {"id": existing.id},
            )
            print(f"Admin flag granted to existing account: {email}", flush=True)
    if not os.environ.get("ADMIN_EMAIL"):
        print(f"Demo admin login: {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_PASSWORD}", flush=True)


from contextlib import asynccontextmanager  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_admin()
    yield


app = FastAPI(title="Hackathon API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/response models --------------------------------------------------

class QuizEntry(BaseModel):
    name: str
    age: int
    favourite_food: str


class SearchRequest(BaseModel):
    query: str
    # ignored since auth hardening: the requester is whoever the token names;
    # kept optional so older clients sending it don't break
    requester_id: int | None = None
    limit: int = 5


class TargetSearch(BaseModel):
    company: str
    role: str
    refresh: bool = False  # skip the 90-day cache and search the web again


class TargetConfirm(BaseModel):
    lookup_id: int
    candidate_index: int


class EventCreate(BaseModel):
    name: str
    description: str | None = None


class Credentials(BaseModel):
    email: str
    password: str


class ProfileUpdate(BaseModel):
    name: str
    title: str = ""
    org_unit: str = ""
    skills: list[str] = []
    ask: str = ""
    offer: str = ""
    linkedin_url: str = ""


class EmployerIn(BaseModel):
    org: str
    start_year: int | None = None
    end_year: int | None = None


class ConfirmProfile(BaseModel):
    name: str
    title: str
    org_unit: str | None = None
    email: str | None = None
    skills: list[str] = []
    employers: list[EmployerIn] = []
    projects: list[str] = []
    ask: str | None = None
    offer: str | None = None
    summary: str | None = None
    raw_text: str = ""


# --- API ------------------------------------------------------------------------

@app.get("/api/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.post("/api/quiz", status_code=201)
def submit_quiz(entry: QuizEntry):
    name = entry.name.strip()
    food = entry.favourite_food.strip()
    if not name or not food:
        raise HTTPException(status_code=400, detail="All fields are required")
    if not 1 <= entry.age <= 150:
        raise HTTPException(status_code=400, detail="Age must be between 1 and 150")

    # Rigorous, highly scientific sorting algorithm
    house = "Gryffindor"

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO quiz_entries (name, age, favourite_food, house) "
                "VALUES (:name, :age, :food, :house)"
            ),
            {"name": name, "age": entry.age, "food": food, "house": house},
        )
        total = conn.execute(text("SELECT COUNT(*) FROM quiz_entries")).scalar_one()

    return {"house": house, "entry_number": total}


# --- Accounts ---------------------------------------------------------------------

def _user_payload(conn, user_id: int) -> dict | None:
    row = conn.execute(
        text(
            "SELECT u.id, u.email, u.is_admin, u.plan, p.id AS pid, p.name, p.title, p.org_unit, p.avatar_key "
            "FROM users u LEFT JOIN people p ON p.id = u.person_id WHERE u.id = :id"
        ),
        {"id": user_id},
    ).first()
    if row is None:
        return None
    person = None
    if row.pid is not None:
        person = {
            "id": row.pid,
            "name": row.name,
            "title": row.title,
            "org_unit": row.org_unit,
            "avatar_url": _avatar_url(row.avatar_key),
        }
    return {
        "id": row.id,
        "email": row.email,
        "is_admin": row.is_admin,
        "plan": row.plan,
        "person": person,
    }


def _avatar_url(key: str | None) -> str | None:
    return f"/api/avatars/{key}" if key else None


def _user_id(authorization: str | None) -> int | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return auth.read_token(authorization[7:].strip())


def _require_user(authorization: str | None) -> int:
    user_id = _user_id(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return user_id


def _require_admin(authorization: str | None) -> int:
    user_id = _require_user(authorization)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT is_admin FROM users WHERE id = :id"), {"id": user_id}
        ).first()
    if row is None or not row.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id


def _require_premium(authorization: str | None) -> tuple[int, int]:
    """(user id, person id) for a Premium user (admins count as Premium).
    402 for free accounts, so the client can show the upgrade card."""
    person_id = _require_person(authorization)
    user_id = _user_id(authorization)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT plan, is_admin FROM users WHERE id = :id"), {"id": user_id}
        ).first()
    if row is None or not (row.plan == "premium" or row.is_admin):
        raise HTTPException(status_code=402, detail="premium_required")
    return user_id, person_id


def _require_person(authorization: str | None) -> int:
    """The signed-in user's person id. 401 without a valid token, 409 before setup."""
    user_id = _require_user(authorization)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT person_id FROM users WHERE id = :id"), {"id": user_id}
        ).first()
    if row is None:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    if row.person_id is None:
        raise HTTPException(status_code=409, detail="Finish setting up your profile first")
    return row.person_id


@app.post("/api/auth/register", status_code=201)
def register(creds: Credentials):
    email = creds.email.strip().lower()
    if "@" not in email or len(email) < 5:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if len(creds.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    try:
        with engine.begin() as conn:
            user_id = conn.execute(
                text("INSERT INTO users (email, password_hash) VALUES (:e, :h) RETURNING id"),
                {"e": email, "h": auth.hash_password(creds.password)},
            ).scalar_one()
            user = _user_payload(conn, user_id)
    except IntegrityError:
        raise HTTPException(status_code=409, detail="An account with that email already exists")
    return {"token": auth.make_token(user_id), "user": user}


@app.post("/api/auth/login")
def login(creds: Credentials):
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, password_hash FROM users WHERE email = :e"),
            {"e": creds.email.strip().lower()},
        ).first()
        if row is None or not auth.verify_password(creds.password, row.password_hash):
            raise HTTPException(status_code=401, detail="Wrong email or password")
        user = _user_payload(conn, row.id)
    return {"token": auth.make_token(row.id), "user": user}


@app.get("/api/auth/me")
def whoami(authorization: str | None = Header(default=None)):
    user_id = _require_user(authorization)
    with engine.connect() as conn:
        user = _user_payload(conn, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return user


# --- Admin ------------------------------------------------------------------------

@app.get("/api/admin/overview")
def admin_overview(authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    with engine.connect() as conn:
        stats = conn.execute(text(
            "SELECT "
            "(SELECT COUNT(*) FROM users) AS users, "
            "(SELECT COUNT(*) FROM people) AS people, "
            "(SELECT COUNT(*) FROM people WHERE is_real) AS real_people, "
            "(SELECT COUNT(*) FROM edges) AS edges, "
            "(SELECT COUNT(*) FROM facets WHERE embedding IS NOT NULL) AS embedded_facets, "
            "(SELECT COUNT(*) FROM facets) AS facets, "
            "(SELECT COUNT(*) FROM quiz_entries) AS quiz_entries, "
            "(SELECT COUNT(*) FROM event_members) AS event_joins, "
            "(SELECT COUNT(*) FROM users WHERE plan = 'premium') AS premium_users, "
            "(SELECT COUNT(*) FROM target_lookups) AS target_lookups, "
            "(SELECT COUNT(*) FROM target_lookups WHERE best_rung = 4) AS coverage_gaps"
        )).mappings().one()

        joins_by_day = conn.execute(text(
            "SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COUNT(m.id) AS count "
            "FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') AS d(day) "
            "LEFT JOIN event_members m ON m.joined_at::date = d.day::date "
            "GROUP BY d.day ORDER BY d.day"
        )).mappings().all()

        people_by_unit = conn.execute(text(
            "SELECT COALESCE(org_unit, 'Unassigned') AS unit, COUNT(*) AS count "
            "FROM people GROUP BY 1 ORDER BY 2 DESC LIMIT 8"
        )).mappings().all()

        edges_by_type = conn.execute(text(
            "SELECT type, COUNT(*) AS count FROM edges GROUP BY 1 ORDER BY 2 DESC"
        )).mappings().all()

    return {
        **stats,
        "joins_by_day": [dict(r) for r in joins_by_day],
        "people_by_unit": [dict(r) for r in people_by_unit],
        "edges_by_type": [dict(r) for r in edges_by_type],
    }


@app.get("/api/admin/users")
def admin_users(authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT u.id, u.email, u.is_admin, u.plan, u.created_at, "
            "p.id AS person_id, p.name AS person_name "
            "FROM users u LEFT JOIN people p ON p.id = u.person_id "
            "ORDER BY u.created_at DESC"
        )).mappings().all()
    return [dict(r) for r in rows]


@app.post("/api/admin/users/{user_id}/toggle-admin")
def admin_toggle(user_id: int, authorization: str | None = Header(default=None)):
    me = _require_admin(authorization)
    if user_id == me:
        raise HTTPException(status_code=400, detail="You can't change your own admin flag")
    with engine.begin() as conn:
        row = conn.execute(
            text("UPDATE users SET is_admin = NOT is_admin WHERE id = :id RETURNING is_admin"),
            {"id": user_id},
        ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user_id, "is_admin": row.is_admin}


@app.post("/api/admin/users/{user_id}/toggle-premium")
def admin_toggle_premium(user_id: int, authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    with engine.begin() as conn:
        row = conn.execute(
            text(
                "UPDATE users SET plan = CASE plan WHEN 'premium' THEN 'free' ELSE 'premium' END "
                "WHERE id = :id RETURNING plan"
            ),
            {"id": user_id},
        ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user_id, "plan": row.plan}


@app.delete("/api/admin/people/{person_id}", status_code=204)
def admin_delete_person(person_id: int, authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    with engine.begin() as conn:
        # detach any account pointing at this person, then cascade-delete the person
        conn.execute(
            text("UPDATE users SET person_id = NULL WHERE person_id = :id"), {"id": person_id}
        )
        result = conn.execute(text("DELETE FROM people WHERE id = :id"), {"id": person_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Person not found")


# --- Events -------------------------------------------------------------------------
# Admins host events. Each has a short code embedded in a QR; scanning it opens
# /join/<code>, which sends people through sign-in/registration and then joins them.

_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no look-alikes (i, l, o, 0, 1)


def _event_payload(row) -> dict:
    return {
        "id": row.id,
        "code": row.code,
        "name": row.name,
        "description": row.description,
        "is_open": row.is_open,
        "allowed_domains": row.allowed_domains,
        "created_at": row.created_at,
    }


@app.post("/api/admin/events", status_code=201)
def create_event(body: EventCreate, authorization: str | None = Header(default=None)):
    admin_id = _require_admin(authorization)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Give the event a name")
    if len(name) > 120:
        raise HTTPException(status_code=400, detail="Event name is too long (max 120 characters)")
    description = (body.description or "").strip() or None

    for _ in range(5):  # a collision on a 7-char code is astronomically unlikely; retry anyway
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(7))
        try:
            with engine.begin() as conn:
                row = conn.execute(
                    text(
                        "INSERT INTO events (code, name, description, host_user_id) "
                        "VALUES (:c, :n, :d, :h) "
                        "RETURNING id, code, name, description, is_open, allowed_domains, created_at"
                    ),
                    {"c": code, "n": name, "d": description, "h": admin_id},
                ).one()
            return {**_event_payload(row), "member_count": 0}
        except IntegrityError:
            continue
    raise HTTPException(status_code=500, detail="Could not generate an event code — try again")


@app.get("/api/admin/events")
def list_events(authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT e.id, e.code, e.name, e.description, e.is_open, e.allowed_domains, e.created_at, "
                "COUNT(m.id) AS member_count, MAX(m.joined_at) AS last_joined_at "
                "FROM events e LEFT JOIN event_members m ON m.event_id = e.id "
                "GROUP BY e.id ORDER BY e.created_at DESC"
            )
        ).mappings().all()

        # three most recent attendees per event, for the card's avatar stack
        previews: dict[int, list[str]] = {}
        for r in conn.execute(text(
            "SELECT event_id, name FROM ("
            "  SELECT m.event_id, "
            "  COALESCE(p.name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name, "
            "  ROW_NUMBER() OVER (PARTITION BY m.event_id ORDER BY m.joined_at DESC) AS rn "
            "  FROM event_members m JOIN users u ON u.id = m.user_id "
            "  LEFT JOIN people p ON p.id = u.person_id"
            ") t WHERE rn <= 3"
        )):
            previews.setdefault(r.event_id, []).append(r.name)

        # joins per day for the last 7 days, for the card's sparkline
        sparks: dict[int, list[int]] = {}
        for r in conn.execute(text(
            "SELECT event_id, (CURRENT_DATE - joined_at::date) AS days_ago, COUNT(*) AS n "
            "FROM event_members WHERE joined_at >= CURRENT_DATE - 6 GROUP BY 1, 2"
        )):
            spark = sparks.setdefault(r.event_id, [0] * 7)
            spark[6 - int(r.days_ago)] = int(r.n)

    return [
        {
            **dict(r),
            "members_preview": previews.get(r.id, []),
            "spark": sparks.get(r.id, [0] * 7),
        }
        for r in rows
    ]


@app.get("/api/admin/events/{event_id}")
def get_event(event_id: int, authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    with engine.connect() as conn:
        event = conn.execute(
            text(
                "SELECT id, code, name, description, is_open, allowed_domains, created_at "
                "FROM events WHERE id = :id"
            ),
            {"id": event_id},
        ).first()
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")
        members = conn.execute(
            text(
                "SELECT u.id AS user_id, u.email, m.joined_at, "
                "p.id AS person_id, p.name, p.title, p.org_unit "
                "FROM event_members m "
                "JOIN users u ON u.id = m.user_id "
                "LEFT JOIN people p ON p.id = u.person_id "
                "WHERE m.event_id = :id ORDER BY m.joined_at DESC"
            ),
            {"id": event_id},
        ).mappings().all()
    return {**_event_payload(event), "members": [dict(m) for m in members]}


def _room_graph(conn, event_id: int) -> dict:
    """Everyone in the room and the connections between them."""
    rows = conn.execute(text(
        "SELECT u.id AS user_id, u.email, p.id AS person_id, p.name, p.title, p.org_unit "
        "FROM event_members m JOIN users u ON u.id = m.user_id "
        "LEFT JOIN people p ON p.id = u.person_id "
        "WHERE m.event_id = :id ORDER BY m.joined_at"
    ), {"id": event_id}).all()

    nodes = []
    person_ids = []
    for r in rows:
        if r.person_id is not None:
            person_ids.append(r.person_id)
            nodes.append({
                "id": r.person_id, "name": r.name, "title": r.title,
                "org_unit": r.org_unit, "has_profile": True,
            })
        else:
            pretty = r.email.split("@")[0].replace(".", " ").title()
            nodes.append({
                "id": -r.user_id, "name": pretty, "title": None,
                "org_unit": None, "has_profile": False,
            })

    # strongest stored tie per pair among the attendees
    pairs: dict[tuple[int, int], dict] = {}
    if person_ids:
        for e in conn.execute(text(
            "SELECT src, dst, type, weight, evidence FROM edges "
            "WHERE src = ANY(:ids) AND dst = ANY(:ids)"
        ), {"ids": person_ids}):
            key = (min(e.src, e.dst), max(e.src, e.dst))
            best = pairs.get(key)
            if best is None or e.weight > best["weight"]:
                pairs[key] = {
                    "a": key[0], "b": key[1], "weight": round(e.weight, 3),
                    "type": e.type, "evidence": e.evidence, "semantic": False,
                }

    # plus "you should know each other" ties from embedding similarity:
    # expertise vectors compared pairwise, keeping each person's best few
    if len(person_ids) > 1:
        sims = conn.execute(text(
            "SELECT f1.person_id AS a, f2.person_id AS b, "
            "1 - (f1.embedding <=> f2.embedding) AS sim "
            "FROM facets f1 JOIN facets f2 "
            "ON f1.person_id < f2.person_id "
            "AND f1.kind = 'expertise' AND f2.kind = 'expertise' "
            "WHERE f1.embedding IS NOT NULL AND f2.embedding IS NOT NULL "
            "AND f1.person_id = ANY(:ids) AND f2.person_id = ANY(:ids) "
            "ORDER BY sim DESC"
        ), {"ids": person_ids}).all()
        sem_degree: dict[int, int] = {}
        for s in sims:
            sim = float(s.sim)
            if sim < 0.45:
                break  # sorted, nothing stronger follows
            key = (s.a, s.b)
            if key in pairs:
                continue  # a real shared history beats a similarity guess
            if sem_degree.get(s.a, 0) >= 4 or sem_degree.get(s.b, 0) >= 4:
                continue  # cap so the room doesn't become a hairball
            sem_degree[s.a] = sem_degree.get(s.a, 0) + 1
            sem_degree[s.b] = sem_degree.get(s.b, 0) + 1
            pairs[key] = {
                "a": s.a, "b": s.b, "weight": round(sim, 3),
                "type": "semantic", "evidence": "similar expertise — should meet",
                "semantic": True,
            }

    return {"nodes": nodes, "edges": list(pairs.values())}


@app.get("/api/admin/events/{event_id}/graph")
def event_graph(event_id: int, authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    with engine.connect() as conn:
        exists = conn.execute(text("SELECT 1 FROM events WHERE id = :id"), {"id": event_id}).first()
        if exists is None:
            raise HTTPException(status_code=404, detail="Event not found")
        return _room_graph(conn, event_id)


class EventSettings(BaseModel):
    allowed_domains: str | None = None


@app.post("/api/admin/events/{event_id}/settings")
def event_settings(event_id: int, body: EventSettings, authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    domains = None
    if body.allowed_domains:
        parts = [
            d.strip().lstrip("@").lower()
            for d in body.allowed_domains.replace(";", ",").split(",")
        ]
        parts = [d for d in parts if d and "." in d]
        domains = ",".join(dict.fromkeys(parts)) or None  # dedupe, keep order
    with engine.begin() as conn:
        row = conn.execute(
            text(
                "UPDATE events SET allowed_domains = :d WHERE id = :id "
                "RETURNING id, code, name, description, is_open, allowed_domains, created_at"
            ),
            {"d": domains, "id": event_id},
        ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return _event_payload(row)


@app.post("/api/admin/events/{event_id}/toggle-open")
def toggle_event_open(event_id: int, authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    with engine.begin() as conn:
        row = conn.execute(
            text("UPDATE events SET is_open = NOT is_open WHERE id = :id RETURNING is_open"),
            {"id": event_id},
        ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"id": event_id, "is_open": row.is_open}


@app.delete("/api/admin/events/{event_id}", status_code=204)
def delete_event(event_id: int, authorization: str | None = Header(default=None)):
    _require_admin(authorization)
    with engine.begin() as conn:
        result = conn.execute(text("DELETE FROM events WHERE id = :id"), {"id": event_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Event not found")


@app.get("/api/events/{code}")
def public_event(code: str):
    """What the QR landing page shows before anyone signs in. No auth, no member data."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, code, name, description, is_open, allowed_domains, created_at FROM events WHERE code = :c"),
            {"c": code.strip().lower()},
        ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="This event link isn't valid")
    payload = _event_payload(row)
    return {k: payload[k] for k in ("code", "name", "description", "is_open", "allowed_domains")}


@app.post("/api/events/{code}/join")
def join_event(code: str, authorization: str | None = Header(default=None)):
    user_id = _require_user(authorization)
    with engine.begin() as conn:
        event = conn.execute(
            text("SELECT id, name, is_open, allowed_domains FROM events WHERE code = :c"),
            {"c": code.strip().lower()},
        ).first()
        if event is None:
            raise HTTPException(status_code=404, detail="This event link isn't valid")
        already = conn.execute(
            text("SELECT 1 FROM event_members WHERE event_id = :e AND user_id = :u"),
            {"e": event.id, "u": user_id},
        ).first()
        if already:
            return {"event": event.name, "already_joined": True}
        if not event.is_open:
            raise HTTPException(status_code=403, detail=f"{event.name} is no longer accepting people")
        if event.allowed_domains:
            email = conn.execute(
                text("SELECT email FROM users WHERE id = :id"), {"id": user_id}
            ).scalar_one()
            allowed = event.allowed_domains.split(",")
            if email.rsplit("@", 1)[-1].lower() not in allowed:
                pretty = " or ".join(f"@{d}" for d in allowed)
                raise HTTPException(
                    status_code=403,
                    detail=f"{event.name} is limited to {pretty} email addresses",
                )
        conn.execute(
            text("INSERT INTO event_members (event_id, user_id) VALUES (:e, :u)"),
            {"e": event.id, "u": user_id},
        )
    return {"event": event.name, "already_joined": False}


# --- My events (member view) --------------------------------------------------------
# Attendees get their own view of an event: who's in the room and how they're
# tied to each other. Open events read as "live"; closed ones are history.

@app.get("/api/my/events")
def my_events(authorization: str | None = Header(default=None)):
    """Events the signed-in person has joined, live ones first."""
    user_id = _require_user(authorization)
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT e.id, e.name, e.description, e.is_open, e.created_at, m.joined_at, "
            "(SELECT COUNT(*) FROM event_members WHERE event_id = e.id) AS member_count "
            "FROM event_members m JOIN events e ON e.id = m.event_id "
            "WHERE m.user_id = :u "
            "ORDER BY e.is_open DESC, m.joined_at DESC"
        ), {"u": user_id}).mappings().all()
    return [dict(r) for r in rows]


@app.get("/api/my/events/{event_id}")
def my_event(event_id: int, authorization: str | None = Header(default=None)):
    """One event the signed-in person attended: details plus the room graph.
    `me` is their person id so the client can light up their own ties."""
    user_id = _require_user(authorization)
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT e.id, e.name, e.description, e.is_open, e.created_at, m.joined_at, "
            "u.person_id AS me "
            "FROM event_members m "
            "JOIN events e ON e.id = m.event_id "
            "JOIN users u ON u.id = m.user_id "
            "WHERE e.id = :e AND m.user_id = :u"
        ), {"e": event_id, "u": user_id}).first()
        if row is None:
            # not found and not-a-member look the same: no leaking other events
            raise HTTPException(status_code=404, detail="You weren't part of this event")
        graph = _room_graph(conn, event_id)
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "is_open": row.is_open,
        "created_at": row.created_at,
        "joined_at": row.joined_at,
        "me": row.me,
        "nodes": graph["nodes"],
        "edges": graph["edges"],
    }


class ConnectBody(BaseModel):
    event_id: int | None = None  # where you met, for the edge's evidence text


@app.post("/api/people/{person_id}/connect", status_code=201)
def connect_person(
    person_id: int,
    body: ConnectBody | None = None,
    authorization: str | None = Header(default=None),
):
    """Declare that you and this person know each other: a real edge both of
    your networks can route introductions through."""
    me = _require_person(authorization)
    if person_id == me:
        raise HTTPException(status_code=400, detail="That's you — no need to connect")
    evidence = "connected directly"
    with engine.begin() as conn:
        other = conn.execute(
            text("SELECT name FROM people WHERE id = :id"), {"id": person_id}
        ).first()
        if other is None:
            raise HTTPException(status_code=404, detail="That person isn't in the network")
        if body and body.event_id:
            event = conn.execute(text(
                "SELECT e.name FROM events e JOIN event_members m ON m.event_id = e.id "
                "JOIN users u ON u.id = m.user_id "
                "WHERE e.id = :e AND u.person_id = :p"
            ), {"e": body.event_id, "p": me}).first()
            if event:
                evidence = f"met at {event.name}"
        a, b = min(me, person_id), max(me, person_id)
        res = conn.execute(text(
            "INSERT INTO edges (src, dst, type, weight, started_at, ended_at, evidence) "
            "VALUES (:a, :b, 'declared', 0.6, CURRENT_DATE, CURRENT_DATE, :ev) "
            "ON CONFLICT (src, dst, type) DO NOTHING"
        ), {"a": a, "b": b, "ev": evidence})
    return {"connected": True, "already": res.rowcount == 0, "person": other.name}


# --- 6 Degrees API ----------------------------------------------------------------

@app.get("/api/projects")
def list_projects(authorization: str | None = Header(default=None)):
    """Projects real people have worked on, so first-time setup can link people to
    real teams. Seeded demo people's placeholder projects are left out."""
    _require_user(authorization)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT DISTINCT m.project FROM project_memberships m "
                "JOIN people p ON p.id = m.person_id "
                "WHERE p.is_real ORDER BY m.project"
            )
        ).scalars().all()
    return rows


@app.get("/api/people")
def list_people(authorization: str | None = Header(default=None)):
    _require_user(authorization)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT id, name, title, org_unit, is_real, avatar_key FROM people "
                "WHERE kind = 'staff' ORDER BY is_real DESC, name"
            )
        ).mappings().all()
    return [
        {k: r[k] for k in ("id", "name", "title", "org_unit", "is_real")}
        | {"avatar_url": _avatar_url(r["avatar_key"])}
        for r in rows
    ]


@app.post("/api/search")
def search_people(req: SearchRequest, authorization: str | None = Header(default=None)):
    import engine as matching

    # Who you search AS comes from your token, never from the request body
    person_id = _require_person(authorization)
    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="'query' must not be empty")
    import target as tgt

    user_id = _user_id(authorization)
    with engine.connect() as conn:
        results = matching.search(conn, query, person_id, limit=min(req.limit, 20))
        # Find the Target (premium): saved targets that match the query come
        # back alongside people; free accounts only learn that some exist
        targets = tgt.match_targets(conn, query)
        account = conn.execute(
            text("SELECT plan, is_admin FROM users WHERE id = :id"), {"id": user_id}
        ).first()
    premium = account is not None and (account.plan == "premium" or account.is_admin)
    return {
        "query": query,
        "results": results,
        "targets": targets if premium else [],
        "targets_locked": 0 if premium else len(targets),
    }


@app.get("/api/network")
def get_network(
    focus_id: int | None = None,
    degrees: int = 3,
    authorization: str | None = Header(default=None),
):
    import engine as matching

    person_id = _require_person(authorization)
    with engine.connect() as conn:
        return matching.network(conn, person_id, focus_id, degrees=degrees)


# --- Find the Target (premium) ------------------------------------------------------

def _lookup_web(company: str, role: str) -> dict:
    """llm.find_target with its failures turned into clear HTTP errors."""
    import llm
    from google.genai import errors

    try:
        return llm.find_target(company, role)
    except llm.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except errors.APIError as e:
        if getattr(e, "code", None) == 429:
            raise HTTPException(
                status_code=503,
                detail="Web search quota is used up for this Gemini API key. "
                "Enable billing or wait for the quota to reset, then try again.",
            )
        raise HTTPException(status_code=502, detail="The web search failed. Try again shortly.")
    except Exception:
        raise HTTPException(status_code=502, detail="The web search failed. Try again shortly.")


def _lookup_payload(row) -> dict:
    return {
        "lookup_id": row.id,
        "company": row.company,
        "role": row.role,
        "candidates": row.candidates,
        "sources": row.sources,
        "cached": True,
        "created_at": row.created_at.isoformat(),
    }


@app.post("/api/target/search")
def target_search(req: TargetSearch, authorization: str | None = Header(default=None)):
    import target as tgt

    user_id, _ = _require_premium(authorization)
    company, role = req.company.strip(), req.role.strip()
    if not company or not role:
        raise HTTPException(status_code=400, detail="Enter both a company and a role")
    query_key = f"{tgt.org_key(company)}|{' '.join(role.lower().split())}"

    if not req.refresh:
        with engine.connect() as conn:
            cached = conn.execute(
                text(
                    "SELECT id, company, role, candidates, sources, created_at FROM target_lookups "
                    "WHERE query_key = :k AND jsonb_array_length(candidates) > 0 "
                    "AND created_at > now() - make_interval(days => :d) "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"k": query_key, "d": tgt.STALE_DAYS},
            ).first()
        if cached:
            return _lookup_payload(cached)

    found = _lookup_web(company, role)
    with engine.begin() as conn:
        row = conn.execute(
            text(
                "INSERT INTO target_lookups (user_id, company, role, query_key, candidates, sources) "
                "VALUES (:u, :c, :r, :k, CAST(:cand AS jsonb), CAST(:src AS jsonb)) "
                "RETURNING id, company, role, candidates, sources, created_at"
            ),
            {
                "u": user_id, "c": company, "r": role, "k": query_key,
                "cand": tgt._json(found["candidates"]), "src": tgt._json(found["sources"]),
            },
        ).first()
    return {**_lookup_payload(row), "cached": False}


@app.post("/api/target/confirm")
def target_confirm(req: TargetConfirm, authorization: str | None = Header(default=None)):
    import llm
    import target as tgt

    user_id, person_id = _require_premium(authorization)
    with engine.connect() as conn:
        lookup = conn.execute(
            text("SELECT id, role, candidates FROM target_lookups WHERE id = :id"),
            {"id": req.lookup_id},
        ).first()
    if lookup is None:
        raise HTTPException(status_code=404, detail="Lookup not found")
    if not 0 <= req.candidate_index < len(lookup.candidates):
        raise HTTPException(status_code=400, detail="Pick one of the candidates shown")
    candidate = lookup.candidates[req.candidate_index]

    with engine.begin() as conn:
        target_id = tgt.save_external(conn, candidate, lookup.role)
    with engine.begin() as conn:
        report = tgt.reach(conn, person_id, target_id, cold_draft=llm.draft_cold_intro)
        # the cached lookup may belong to someone else, so log this user's run
        conn.execute(
            text(
                "INSERT INTO target_lookups (user_id, company, role, query_key, candidates, "
                "  sources, chosen_person_id, report, best_rung) "
                "SELECT :u, company, role, query_key, candidates, sources, :p, "
                "  CAST(:rep AS jsonb), :b FROM target_lookups WHERE id = :id"
            ),
            {
                "u": user_id, "p": target_id, "rep": tgt._json(report),
                "b": report["best_rung"], "id": lookup.id,
            },
        )
    return report


@app.get("/api/target/{target_id}/reach")
def target_reach(target_id: int, authorization: str | None = Header(default=None)):
    import llm
    import target as tgt

    _, person_id = _require_premium(authorization)
    with engine.connect() as conn:
        report = tgt.reach(conn, person_id, target_id, cold_draft=llm.draft_cold_intro)
    if report is None:
        raise HTTPException(status_code=404, detail="Target not found")
    return report


@app.get("/api/targets")
def my_targets(authorization: str | None = Header(default=None)):
    """This user's confirmed targets, most recent first (one row per person)."""
    user_id, _ = _require_premium(authorization)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT DISTINCT ON (l.chosen_person_id) l.chosen_person_id AS id, p.name, "
                "  p.title, l.company, l.best_rung, l.created_at "
                "FROM target_lookups l JOIN people p ON p.id = l.chosen_person_id "
                "WHERE l.user_id = :u AND l.chosen_person_id IS NOT NULL "
                "ORDER BY l.chosen_person_id, l.created_at DESC"
            ),
            {"u": user_id},
        ).mappings().all()
    rows = sorted((dict(r) for r in rows), key=lambda r: r["created_at"], reverse=True)
    for r in rows:
        r["created_at"] = r["created_at"].isoformat()
    return rows[:20]


# --- Profiles ---------------------------------------------------------------------

MAX_AVATAR_BYTES = 1024 * 1024  # the client resizes to 256px first, so this is generous
AVATAR_SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


# Filler that setup stores when a field was left blank; not real profile content
PLACEHOLDER_TEXT = {
    "general problem solving",
    "Open to learning from others.",
    "Happy to help with their area.",
}


def _split_skills(raw: str | None) -> list[str]:
    return [
        s.strip() for s in (raw or "").split(",")
        if s.strip() and s.strip() not in PLACEHOLDER_TEXT
    ]


def _real_text(value: str | None) -> str:
    return "" if not value or value in PLACEHOLDER_TEXT else value


def _expertise_text(title: str, org_unit: str | None, skills: list[str], projects: list[str]) -> str:
    body = f"{title} in {org_unit or 'their field'}. Skilled in {', '.join(skills) or 'general problem solving'}."
    if projects:
        body += f" Worked on projects {', '.join(projects)}."
    return body


@app.get("/api/people/{person_id}")
def get_profile(person_id: int, authorization: str | None = Header(default=None)):
    """A person's profile, plus how the signed-in person is connected to them."""
    import engine as matching

    me = _require_person(authorization)
    with engine.connect() as conn:
        person = conn.execute(
            text(
                "SELECT id, name, title, org_unit, ask_me_about, avatar_key, linkedin_url "
                "FROM people WHERE id = :id"
            ),
            {"id": person_id},
        ).first()
        if person is None:
            raise HTTPException(status_code=404, detail="That person isn't in the network")

        facets = dict(
            conn.execute(
                text(
                    "SELECT kind, text FROM facets WHERE person_id = :id "
                    "AND kind IN ('ask', 'offer') ORDER BY id"
                ),
                {"id": person_id},
            ).all()
        )
        projects = conn.execute(
            text(
                "SELECT DISTINCT project FROM project_memberships "
                "WHERE person_id = :id ORDER BY project"
            ),
            {"id": person_id},
        ).scalars().all()

        # Strongest path from me to them, with the reason for each link
        path = []
        if person_id != me:
            found = matching.strongest_path(matching.load_graph(conn), me, person_id)
            if found:
                ids = found[0]
                rows = {
                    r.id: r
                    for r in conn.execute(
                        text("SELECT id, name, title, avatar_key, linkedin_url FROM people WHERE id = ANY(:ids)"),
                        {"ids": ids},
                    )
                }
                for prev, cur in zip([None] + ids, ids):
                    r = rows[cur]
                    path.append(
                        {
                            "id": cur,
                            "name": r.name,
                            "title": r.title,
                            "avatar_url": _avatar_url(r.avatar_key),
                            "linkedin_url": r.linkedin_url,
                            "evidence": matching._edge_info(conn, prev, cur)["evidence"]
                            if prev is not None
                            else None,
                        }
                    )

    return {
        "id": person.id,
        "name": person.name,
        "title": person.title,
        "org_unit": person.org_unit,
        "skills": _split_skills(person.ask_me_about),
        "projects": projects,
        "ask": _real_text(facets.get("ask")),
        "offer": _real_text(facets.get("offer")),
        "avatar_url": _avatar_url(person.avatar_key),
        "linkedin_url": person.linkedin_url,
        "is_me": person_id == me,
        "hops": max(len(path) - 1, 0),
        "path": path,
    }


def _clean_linkedin(raw: str | None) -> str | None:
    """Canonical https://www.linkedin.com/in/<handle> from a pasted link or
    handle, None when blank. Only personal profile links are accepted, so the
    stored value can never point anywhere but LinkedIn."""
    import re

    value = (raw or "").strip()
    if not value:
        return None
    match = re.fullmatch(
        r"(?:(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/)?@?([A-Za-z0-9\-_%]{3,100})/?(?:\?.*)?",
        value,
        flags=re.IGNORECASE,
    )
    if not match:
        raise HTTPException(
            status_code=400,
            detail="That doesn't look like a LinkedIn profile link (linkedin.com/in/your-name)",
        )
    return f"https://www.linkedin.com/in/{match.group(1)}"


@app.put("/api/profile")
def update_profile(body: ProfileUpdate, authorization: str | None = Header(default=None)):
    """Edit your own profile. Whose profile comes from the token, never the request."""
    import llm

    me = _require_person(authorization)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Your name can't be empty")
    title = body.title.strip()
    org_unit = body.org_unit.strip() or None
    skills = [s.strip() for s in body.skills if s.strip()][:30]
    linkedin_url = _clean_linkedin(body.linkedin_url)

    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE people SET name = :n, title = :t, org_unit = :u, ask_me_about = :a, "
                "linkedin_url = :li WHERE id = :id"
            ),
            {"n": name, "t": title, "u": org_unit, "a": ", ".join(skills)[:500],
             "li": linkedin_url, "id": me},
        )
        projects = conn.execute(
            text("SELECT DISTINCT project FROM project_memberships WHERE person_id = :id"),
            {"id": me},
        ).scalars().all()

        # Keep the searchable text in step with the profile; re-embed when possible
        facet_rows = [
            ("expertise", _expertise_text(title, org_unit, skills, projects)),
            ("ask", body.ask.strip()),
            ("offer", body.offer.strip()),
        ]
        vectors = None
        try:
            vectors = llm.embed_texts([t or "-" for _, t in facet_rows])
        except Exception:
            vectors = None  # no key / API hiccup: keyword search still works
        conn.execute(
            text("DELETE FROM facets WHERE person_id = :id AND kind IN ('expertise', 'ask', 'offer')"),
            {"id": me},
        )
        for i, (kind, value) in enumerate(facet_rows):
            if not value:
                continue
            if vectors:
                vec = "[" + ",".join(f"{v:.6f}" for v in vectors[i]) + "]"
                conn.execute(
                    text(
                        "INSERT INTO facets (person_id, kind, text, embedding) "
                        "VALUES (:id, :k, :t, :v ::vector)"
                    ),
                    {"id": me, "k": kind, "t": value, "v": vec},
                )
            else:
                conn.execute(
                    text("INSERT INTO facets (person_id, kind, text) VALUES (:id, :k, :t)"),
                    {"id": me, "k": kind, "t": value},
                )
    return get_profile(me, authorization)


@app.put("/api/profile/avatar")
async def upload_avatar(file: UploadFile, authorization: str | None = Header(default=None)):
    import secrets

    me = _require_person(authorization)
    signatures = AVATAR_SIGNATURES.get(file.content_type or "")
    if signatures is None:
        raise HTTPException(status_code=400, detail="Upload a JPEG, PNG or WebP image")
    data = await file.read(MAX_AVATAR_BYTES + 1)
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="That image is too large (max 1 MB)")
    if not data.startswith(signatures):
        raise HTTPException(status_code=400, detail="That file doesn't look like an image")

    key = secrets.token_urlsafe(16)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE people SET avatar = :d, avatar_type = :t, avatar_key = :k WHERE id = :id"),
            {"d": data, "t": file.content_type, "k": key, "id": me},
        )
    return {"avatar_url": _avatar_url(key)}


@app.delete("/api/profile/avatar")
def delete_avatar(authorization: str | None = Header(default=None)):
    me = _require_person(authorization)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE people SET avatar = NULL, avatar_type = NULL, avatar_key = NULL WHERE id = :id"),
            {"id": me},
        )
    return {"avatar_url": None}


@app.get("/api/avatars/{key}")
def get_avatar(key: str):
    """Serve a profile photo. No token needed (an <img> can't send one); the
    random key in the URL is the access control and changes on every upload."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT avatar, avatar_type FROM people WHERE avatar_key = :k"), {"k": key}
        ).first()
    if row is None or row.avatar is None:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(
        content=bytes(row.avatar),
        media_type=row.avatar_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.post("/api/intake/cv")
async def intake_cv(file: UploadFile, authorization: str | None = Header(default=None)):
    _require_user(authorization)
    from io import BytesIO

    from pypdf import PdfReader

    import llm

    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Upload a PDF file")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")
    try:
        reader = PdfReader(BytesIO(data))
        raw_text = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    except Exception:
        raw_text = ""  # unreadable text layer — Gemini can still read the PDF itself

    try:
        if len(raw_text) >= 50:
            parsed = llm.parse_cv(raw_text=raw_text)
        else:
            # Scanned or image-based CV: no text layer, so let Gemini read the document
            parsed = llm.parse_cv(pdf_bytes=data)
    except llm.LLMUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        raise HTTPException(status_code=502, detail="CV parsing failed — try again")

    parsed["raw_text"] = raw_text if len(raw_text) >= 50 else (
        "(scanned PDF, parsed visually) " + str(parsed.get("summary") or "")
    )
    return parsed


@app.post("/api/intake/confirm", status_code=201)
def intake_confirm(profile: ConfirmProfile, authorization: str | None = Header(default=None)):
    import engine as matching
    import llm

    name = profile.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="'name' is required")

    # First-time setup: the new person is linked to the signed-in account
    user_id = _require_user(authorization)
    with engine.connect() as conn:
        account = _user_payload(conn, user_id)
    if account is None:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    if account["person"] is not None:
        raise HTTPException(status_code=409, detail="Your profile is already set up")
    profile.email = profile.email or account["email"]

    skills = ", ".join(profile.skills) or "general problem solving"
    projects = ", ".join(profile.projects)
    expertise = f"{profile.title} in {profile.org_unit or 'their field'}. Skilled in {skills}."
    if projects:
        expertise += f" Worked on projects {projects}."
    if profile.summary:
        expertise += f" {profile.summary}"
    ask = profile.ask or "Open to learning from others."
    offer = profile.offer or f"Happy to help with {profile.skills[0] if profile.skills else 'their area'}."

    with engine.begin() as conn:
        pid = conn.execute(
            text(
                "INSERT INTO people (name, title, org_unit, email, ask_me_about, is_real) "
                "VALUES (:n, :t, :u, :e, :a, true) RETURNING id"
            ),
            {"n": name, "t": profile.title, "u": profile.org_unit, "e": profile.email,
             "a": skills[:200]},
        ).scalar_one()

        if profile.raw_text:
            conn.execute(
                text(
                    "INSERT INTO profiles_raw (person_id, source, raw_text) "
                    "VALUES (:id, 'cv', :raw)"
                ),
                {"id": pid, "raw": profile.raw_text},
            )
        for emp in profile.employers:
            conn.execute(
                text(
                    "INSERT INTO positions (person_id, org, started_year, ended_year) "
                    "VALUES (:id, :org, :s, :e)"
                ),
                {"id": pid, "org": emp.org, "s": emp.start_year, "e": emp.end_year},
            )
        for proj in profile.projects:
            conn.execute(
                text(
                    "INSERT INTO project_memberships (person_id, project) VALUES (:id, :p)"
                ),
                {"id": pid, "p": proj},
            )

        facet_rows = [("expertise", expertise), ("ask", ask), ("offer", offer)]
        vectors = None
        try:
            vectors = llm.embed_texts([t for _, t in facet_rows])
        except Exception:
            vectors = None
        for i, (kind, body) in enumerate(facet_rows):
            if vectors:
                vec = "[" + ",".join(f"{v:.6f}" for v in vectors[i]) + "]"
                conn.execute(
                    text(
                        "INSERT INTO facets (person_id, kind, text, embedding) "
                        "VALUES (:id, :k, :t, :v ::vector)"
                    ),
                    {"id": pid, "k": kind, "t": body, "v": vec},
                )
            else:
                conn.execute(
                    text("INSERT INTO facets (person_id, kind, text) VALUES (:id, :k, :t)"),
                    {"id": pid, "k": kind, "t": body},
                )

        edges_created = matching.build_edges_for_person(conn, pid)

        if user_id is not None:
            conn.execute(
                text("UPDATE users SET person_id = :pid WHERE id = :uid"),
                {"pid": pid, "uid": user_id},
            )

    return {
        "id": pid,
        "name": name,
        "edges_created": edges_created,
        "embedded": vectors is not None,
    }


# --- Frontend (production only) -------------------------------------------------
# The deploy image builds the React app into frontend-dist/; when present,
# this app serves it, so frontend and API share one origin. In local dev the
# directory doesn't exist and Vite serves the frontend instead.
#
# The catch-all is an SPA fallback: client-side routes like /quiz have no file
# on disk, so any unknown path serves index.html and React Router takes over.

FRONTEND_DIST = BASE_DIR / "frontend-dist"
if FRONTEND_DIST.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="assets",
    )

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        candidate = (FRONTEND_DIST / path).resolve()
        if (
            path
            and candidate.is_relative_to(FRONTEND_DIST)
            and candidate.is_file()
        ):
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    def root():
        return {"service": "Hackathon API", "docs": "/docs", "health": "/api/health"}
