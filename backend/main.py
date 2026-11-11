import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import create_engine, text

load_dotenv()

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

app = FastAPI(title="Hackathon API")

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
