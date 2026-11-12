# 6 Degrees — Execution Plan

Build "6 Degrees" on this repo (React + Vite, FastAPI, Postgres in Docker): add pgvector, NetworkX and one LLM API, and ship the **Must tier end to end** — CV upload → profile → graph → ranked search with a lit path and a "why" line — before touching Should or Stretch.

The product in one sentence: *"Who can help me with X, and who can introduce me?"* — ranked by **tie strength**, not hop count.

## Architecture

```
React UI (Vite, :3001)
   │  fetch
   ▼
FastAPI (:5001)  ──────────────►  LLM API
   │   /api/intake  /api/search    · parse CV → JSON
   ▼                               · draft intros
Matching engine (Python)           · explain matches
   · facet embeddings (pgvector)
   · edge weights + path ranking (NetworkX, -log weight)
   · score = relevance × path strength × willingness
   ▼
Postgres 16 + pgvector  (Docker volume, Alembic migrations)
```

Everything runs in the existing containers; the only infra change is swapping the Postgres image for one with pgvector.

## Data model (Alembic migration 0003)

| Table | Key columns | Notes |
| --- | --- | --- |
| `people` | id, name, title, org_unit, email, ask_me_about | 200 synthetic + the team's real profiles |
| `profiles_raw` | person_id, source (cv / linkedin_pdf / connections_csv), raw_text | keep originals so parsing can be re-run |
| `facets` | person_id, kind (**expertise / ask / offer**), text, embedding `vector(N)` | ≥3 rows per person; N = embedding model dim |
| `edges` | src, dst, type (declared / project / employer / school / semantic), weight (0–1), started_at, ended_at, evidence | store once per pair; weight from type + recency + overlap length |
| `intro_requests` | id, requester_id, target_id, path (jsonb), status, drafts (jsonb) | the coffee flow |

Migration note: `0003` begins with `CREATE EXTENSION IF NOT EXISTS vector;` then the tables. Drop the quiz tables in the same migration (or leave them — zero cost).

## Pre-hackathon checklist (do before the clock starts)

- [x] LLM/embedding provider settled: **Gemini via personal GCP** — `google-genai` SDK, `text-embedding-004` (768-dim), free AI Studio key from https://aistudio.google.com/apikey → `GOOGLE_API_KEY` in `backend/.env`
- [x] Compose db image swapped to `pgvector/pgvector:pg16`; migration 0003 written and applied
- [x] Python deps added: `networkx`, `numpy`, `pypdf`, `google-genai`, `pgvector`
- [x] Synthetic-org seed script done: `./seed.sh` loads 200 people, 600 facets, ~6,000 weighted edges (deterministic, graph verified connected; `--with-embeddings` embeds via Gemini). Real profiles (team CVs) survive re-seeding via the `is_real` flag
- [ ] Each teammate: get your own `GOOGLE_API_KEY` into `backend/.env` (gitignored)
- [ ] OPTIONAL (only if we want real LinkedIn edges): each teammate requests their **Connections.csv** at LinkedIn → Settings → *Get a copy of your data* — the email takes 24–48 h, so it can't be done at the event
- [ ] Collect 2–3 real **test CVs as PDF** and run them through the parser prompt once
- [ ] Everyone through SETUP.md on their own laptop, then run `./seed.sh` once

## Workstream A — Intake (CV → confirmed profile)

| Task | Tier | Notes |
| --- | --- | --- |
| `POST /api/intake/cv` — PDF upload, extract text (pypdf) | Must | reject >10 MB, non-PDF |
| LLM parse → structured JSON (roles, companies, dates, skills) | Must | Pydantic schema as the contract; retry once on invalid JSON |
| Confirm screen: parsed fields editable, then save | Must | writes `people` + `profiles_raw` + `facets` |
| Compute facet embeddings on save | Must | one batched embedding call |
| Three-question chat intake (know / want / would help) | Stretch | fills ask + offer facets |
| Connections.csv import → declared edges | Should | needs the pre-event exports |

## Workstream B — Engine (the part judges reward)

| Task | Tier | Notes |
| --- | --- | --- |
| Edge builder: declared, same-employer-overlap, same-project, same-school | Must | runs at seed time + on new profile |
| Weight function: type base × recency decay × overlap length | Must | document the constants, judges will ask |
| Semantic "should know each other" edges (cosine > threshold) | Should | dashed in UI |
| Vector search: query embedding vs expertise facets + hard SQL filters | Must | pgvector `<=>` cosine, filters never fuzzy |
| Path search: NetworkX shortest path on `-log(weight)` | Must | cap at 4 hops |
| Final score: `relevance × path_strength × willingness` | Must | willingness = opt-in flag (+ accept rate later) |
| "Why" line per result (template first, LLM polish if time) | Must | *template* is the Must; LLM version is polish |
| LLM-named clusters | Stretch | |

## Workstream C — Search UI

| Task | Tier | Notes |
| --- | --- | --- |
| Ask box page (free text) + results list | Must | name, title, score, why line, "via A → B" breadcrumb |
| Path detail view | Must | list form is enough |
| Force-graph canvas with path highlight | Should | `react-force-graph`; **skip if behind schedule — the list demos fine** |
| Agent steps shown live ("widening search…") | Stretch | |

## Workstream D — Intros

| Task | Tier | Notes |
| --- | --- | --- |
| "Introduce me": LLM-drafted message per hop | Should | this is the demo's closing beat — do it right after Must is done |
| Double opt-in state machine on `intro_requests` | Should | |
| Meeting brief / calendar slots | Stretch | |

## API surface

| Endpoint | Purpose |
| --- | --- |
| `POST /api/intake/cv` | PDF in → parsed profile JSON out |
| `POST /api/intake/confirm` | save person + facets + embeddings |
| `GET  /api/graph` | nodes + edges for the canvas |
| `POST /api/search` | `{query}` → ranked people with path + why |
| `POST /api/intros` | `{target_id}` → drafted messages per hop |
| `GET  /api/health` | exists already |

## Schedule and cut line

| Block | Goal |
| --- | --- |
| Day 1 AM | Migration 0003 live, seed script loads 200 people + edges, skeleton endpoints return stub data |
| Day 1 PM | Intake pipeline end to end (upload → parse → confirm → embedded) |
| Day 1 eve | Path ranking works on seed data; `POST /api/search` returns real ranked results |
| Day 2 AM | Search UI wired: ask box → results with why + via. **Checkpoint: if this isn't working by midday, drop the canvas and all Should items.** |
| Day 2 PM | Drafted intros, canvas if time, then STOP building |
| Last 2 h | Freeze main. Demo prep only (below) |

Rule: a working path with an explanation beats five half-built features. One person owns the seed data + demo narrative from day 1 — not everyone codes.

## Demo prep (non-negotiable)

- [ ] Embeddings for all 200 seed people **precomputed in the seed script** — no API calls needed to boot the demo
- [ ] One **canned search response** on disk; env flag `DEMO_FALLBACK=1` serves it if the LLM/API dies on stage
- [ ] The CV used on stage is one that's been through the parser 10 times
- [ ] Rehearse the 5-step script (concept doc has it) three times, timed to 3 minutes
- [ ] Record a backup screen capture of one good run
- [ ] Demo from `main`, frozen 2 h before; last-minute fixes on a branch, merged only if rehearsal passes

## Decisions (settled 2026-11-12)

1. **Provider**: Gemini via personal GCP (free tier) — Gemini Flash for parsing/drafting/explaining, `text-embedding-004` for vectors (768-dim, baked into the schema).
2. **Real profiles in the demo**: yes — team members add themselves via the CV upload flow; `is_real=true` rows survive re-seeding.
3. Still open: **primary user for the pitch** (new joiner vs project lead) — changes only the demo query, decide during rehearsal.
