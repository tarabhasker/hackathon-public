# Team Setup Checklist

Get from zero to a running app. Steps 1–5 are one-time; after that it's just the daily workflow.

## 1. Get access

- [ ] Accept the GitHub invite (check your email, or github.com notifications).
  The repo is private — until you accept, clone will fail.

## 2. Install the tools

- [ ] **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/). Install it, open it once, and leave it running (the whale icon in your menu bar). The backend and database run inside it — you do NOT need Python or Postgres installed.
- [ ] **Node.js** (LTS) — [nodejs.org](https://nodejs.org). Needed for the React frontend. Check with `node --version`.
- [ ] **GitHub CLI** — [cli.github.com](https://cli.github.com) (Mac: download the .pkg). Then log in:
  ```sh
  gh auth login
  ```
  Choose: GitHub.com → HTTPS → Login with a web browser → **Yes** to "Authenticate Git with your GitHub credentials".

## 3. Clone the repo

```sh
git clone https://github.com/tarabhasker/hackathon.git
cd hackathon
```

## 4. Run the app (two terminals)

```sh
./run-backend.sh      # terminal 1 — Postgres + FastAPI (first run builds the image, ~1 min)
./run-frontend.sh     # terminal 2 — React dev server (runs npm install for you)
```

## 5. Verify it works

- [ ] Open http://127.0.0.1:3001 — the home page should say **"Sorting Hat connected"** with a green dot.
- [ ] Take the quiz once. If you get a result, the whole stack (frontend → API → Postgres) works.

Setup done. 🎉

---

## Daily workflow

Never commit directly to `main` — it's what we demo and deploy.

```sh
git checkout main && git pull        # 1. start from the latest code
git checkout -b feat-my-thing        # 2. make a branch
# ...code...                         # 3. edit; both servers hot-reload, no restarts needed
git add -A && git commit -m "..."    # 4. commit (early, often)
git push -u origin feat-my-thing     # 5. push YOUR BRANCH
gh pr create                         # 6. open a pull request
```

Then someone else gives it a quick look and merges on GitHub. Afterwards everyone runs `git checkout main && git pull`.

## Database notes

- Your database is **local and yours alone** — entries you create exist only on your machine. Data survives restarts; wipe it with `docker compose down -v`.
- Schema lives in migration files (`backend/alembic/versions/`). After pulling a branch/main that added one, **just restart the backend** — migrations apply automatically on start.
- Changing the schema yourself? `./new-migration.sh "describe the change"`, fill in the generated file, then `./migrate.sh`. Commit the migration file with your code.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot connect to the Docker daemon` | Open Docker Desktop and wait for the whale to settle. |
| Frontend fails: port 3001 in use | `./run-frontend.sh 3002` (any free port). |
| API errors after pulling new code | Restart `./run-backend.sh` (applies new migrations); `--build` if requirements.txt changed. |
| "Sorting Hat offline" on the page | Backend isn't running — check terminal 1. |
| Clone asks for a password | You skipped `gh auth login`, or haven't accepted the repo invite. |
