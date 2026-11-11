import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

class ItemCreate(BaseModel):
    name: str


# --- API ------------------------------------------------------------------------

@app.get("/api/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}


@app.get("/api/items")
def list_items():
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, name, created_at FROM items ORDER BY id DESC")
        ).mappings().all()
    return [dict(row) for row in rows]


@app.post("/api/items", status_code=201)
def create_item(item: ItemCreate):
    name = item.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="'name' must not be empty")
    with engine.begin() as conn:
        new_id = conn.execute(
            text("INSERT INTO items (name) VALUES (:name) RETURNING id"),
            {"name": name},
        ).scalar_one()
    return {"id": new_id, "name": name}


@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    with engine.begin() as conn:
        result = conn.execute(
            text("DELETE FROM items WHERE id = :id"), {"id": item_id}
        )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Item not found")


# --- Frontend (production only) -------------------------------------------------
# The deploy image builds the React app into frontend-dist/; when present,
# this app serves it, so frontend and API share one origin. In local dev the
# directory doesn't exist and Vite serves the frontend instead.

FRONTEND_DIST = BASE_DIR / "frontend-dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {"service": "Hackathon API", "docs": "/docs", "health": "/api/health"}
