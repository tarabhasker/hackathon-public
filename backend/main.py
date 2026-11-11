import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
# Overridable so Docker can point it at a mounted volume
DATABASE = Path(os.environ.get("DATABASE_PATH", BASE_DIR / "app.db"))

# Frontend dev server origins allowed to call this API
ALLOWED_ORIGINS = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
]


# --- Database (SQLite, no server needed) -------------------------------------
# Schema is managed by Alembic migrations (backend/alembic/versions/),
# applied automatically before the server starts — see run-backend.sh.

def get_db():
    """One connection per request, closed afterwards."""
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()


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

@app.get("/")
def root():
    return {"service": "Hackathon API", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/items")
def list_items(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, name, created_at FROM items ORDER BY id DESC"
    ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/items", status_code=201)
def create_item(item: ItemCreate, db: sqlite3.Connection = Depends(get_db)):
    name = item.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="'name' must not be empty")
    cur = db.execute("INSERT INTO items (name) VALUES (?)", (name,))
    db.commit()
    return {"id": cur.lastrowid, "name": name}


@app.delete("/api/items/{item_id}", status_code=204)
def delete_item(item_id: int, db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute("DELETE FROM items WHERE id = ?", (item_id,))
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Item not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=5001, reload=True)
