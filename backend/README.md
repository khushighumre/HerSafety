# NightWise Backend

FastAPI + SQLite backend for the NightWise women's night-travel safety platform.

> **Hackathon prototype.** This backend does **not** contact real emergency services.
> All SOS and journey-sharing flows are clearly simulated.

---

## Requirements

- Python **3.11** or 3.12 (3.11 recommended — tested)
- No PostgreSQL, Docker, Redis, or cloud credentials required
- SQLite is bundled with Python

---

## Windows PowerShell setup

Run all commands from the **repository root** (`NightWise-/`).

### 1. Create a virtual environment inside `backend/`

```powershell
py -3.11 -m venv backend\.venv
```

### 2. Activate the virtual environment

```powershell
backend\.venv\Scripts\Activate.ps1
```

If you see an execution-policy error, run once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 3. Install dependencies

```powershell
pip install -r backend\requirements.txt
```

### 4. Copy the example environment file

```powershell
Copy-Item backend\.env.example backend\.env
```

Edit `backend\.env` if your frontend runs on a port other than **8080**.

### 5. Start the backend

```powershell
cd backend
uvicorn main:app --reload --port 8000
```

The backend runs on **http://localhost:8000**.

---

## Endpoints

| URL | Description |
|-----|-------------|
| `GET http://localhost:8000/health` | Root liveness check |
| `GET http://localhost:8000/api/v1/health` | Versioned liveness check |
| `GET http://localhost:8000/docs` | Interactive Swagger UI |
| `GET http://localhost:8000/redoc` | ReDoc documentation |

---

## SQLite database

The database file is created automatically on first startup:

```
backend/nightwise.db
```

It is gitignored. Delete it to reset all tables.

---

## Configuring the allowed frontend origin

The frontend dev server runs on **http://localhost:8080** by default (set by the
Lovable/TanStack Start Vite config).

To allow a different origin, edit `backend/.env`:

```env
BACKEND_CORS_ORIGINS=http://localhost:8080,http://localhost:3000
```

Restart uvicorn after changing `.env`.

---

## OpenStreetMap Geographic Context Layer

Phase 1B introduces real, source-backed geographic evidence along route corridors retrieved from OpenStreetMap via Overpass API.

- **No paid API key required**: Overpass is an open, public service.
- **Configurable endpoints**: Set `OVERPASS_ENDPOINT` in `backend/.env` to switch between public instances.
- **In-memory caching**: Corridor query responses are cached with a configurable TTL (`OVERPASS_CACHE_TTL_SEC`, default: 30 minutes) to minimize external requests and prevent rate-limiting.
- **Bounded timeouts & error resilience**: Configurable timeout (`OVERPASS_TIMEOUT_SEC`, default: 10s). If the provider is unreachable, routes return with an explicit `unavailable` status; live routing geometry, distance, and duration are preserved.
- **Safety disclaimer**: Mapped physical amenities, road classes, and lighting tags provide geographic context only. They do not constitute verified safety predictions or proof of route safety.

### Overpass Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OVERPASS_ENDPOINT` | `https://overpass-api.de/api/interpreter` | Overpass API public interpreter endpoint |
| `OVERPASS_TIMEOUT_SEC` | `10.0` | Timeout in seconds for Overpass queries |
| `OVERPASS_CACHE_TTL_SEC` | `1800.0` | In-memory cache TTL in seconds (30 mins) |
| `OVERPASS_MAX_CACHE_SIZE` | `200` | Maximum number of cached corridor bounding boxes |
| `OVERPASS_MAX_BBOX_SPAN` | `0.25` | Max bounding box dimension in degrees (~28 km) |

---

## Project structure

```
backend/
  main.py                   # FastAPI app, CORS, lifespan
  database.py               # SQLAlchemy engine, session, Base, get_db
  models.py                 # ORM table definitions
  schemas.py                # Pydantic request/response schemas
  routing_provider.py       # OpenRouteService live routing & geocoding
  osm_evidence_provider.py  # OpenStreetMap / Overpass corridor evidence
  scoring.py                # Deterministic scoring functions & demo heuristics
  requirements.txt
  .env.example
  routers/
    __init__.py
    health.py               # GET /health and GET /api/v1/health
    routes.py               # POST /api/v1/routes/compare
  tests/
    test_routes.py          # Routing provider, endpoint, scoring, CORS tests
    test_osm_evidence.py    # Overpass evidence provider unit & integration tests
  uploads/                  # Evidence file storage (gitignored)
  nightwise.db              # SQLite database (gitignored, auto-created)
```

