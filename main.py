import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "app.db"


# --- Database (SQLite, no server needed) -------------------------------------

def init_db() -> None:
    db = sqlite3.connect(DATABASE)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    db.commit()
    db.close()


def get_db():
    """One connection per request, closed afterwards."""
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Hackathon API", lifespan=lifespan)

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


# --- Request/response models --------------------------------------------------

class ItemCreate(BaseModel):
    name: str


# --- Pages --------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# --- API ------------------------------------------------------------------------

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
