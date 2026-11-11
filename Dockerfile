# Deployment image (option A): React frontend built in, served by FastAPI.
# Build from the repo root:  docker build -t hackathon .
# Requires DATABASE_URL (a hosted Postgres) at runtime.

# --- Stage 1: build the React frontend ---------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# --- Stage 2: backend + built frontend ----------------------------------------
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend /build/dist ./frontend-dist

EXPOSE 5001

# Hosting platforms (Render, Railway, ...) inject PORT; default to 5001
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-5001}"]
