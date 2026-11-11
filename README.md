# Hackathon

A starter web project: **Flask** (Python) backend + **Bootstrap 5.3** frontend (loaded via CDN) + **SQLite** storage.

## Structure

```
app.py              — Flask app: pages, JSON API, SQLite helpers
templates/          — HTML pages (Jinja templates), Bootstrap wired in
static/css/         — custom styles on top of Bootstrap
static/js/          — custom JavaScript
requirements.txt    — Python dependencies
.env.example        — copy to .env for secrets/config
app.db              — SQLite database (created on first run, gitignored)
```

## Setup (once)

```sh
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Run

```sh
source venv/bin/activate
python app.py
```

Then open http://127.0.0.1:5001

## API

- `GET /api/health` — liveness check
- `GET /api/items` — list items
- `POST /api/items` — create an item, JSON body: `{"name": "..."}`

Example:

```sh
curl -X POST http://127.0.0.1:5001/api/items \
  -H 'Content-Type: application/json' \
  -d '{"name": "first item"}'
```
