import os
import sqlite3

from dotenv import load_dotenv
from flask import Flask, g, jsonify, render_template, request

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-change-me")

DATABASE = os.path.join(os.path.dirname(__file__), "app.db")


# --- Database helpers (SQLite, no server needed) ---------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
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


# --- Pages ------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# --- API --------------------------------------------------------------------

@app.route("/api/health")
def health():
    return jsonify(status="ok")


@app.route("/api/items", methods=["GET", "POST"])
def items():
    db = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        name = data.get("name", "").strip()
        if not name:
            return jsonify(error="'name' is required"), 400
        cur = db.execute("INSERT INTO items (name) VALUES (?)", (name,))
        db.commit()
        return jsonify(id=cur.lastrowid, name=name), 201

    rows = db.execute("SELECT id, name, created_at FROM items ORDER BY id DESC").fetchall()
    return jsonify([dict(row) for row in rows])


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5001)
