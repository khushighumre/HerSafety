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

## Project structure

```
backend/
  main.py          # FastAPI app, CORS, lifespan
  database.py      # SQLAlchemy engine, session, Base, get_db
  models.py        # ORM table definitions
  schemas.py       # Pydantic request/response schemas
  requirements.txt
  .env.example
  routers/
    __init__.py
    health.py      # GET /health and GET /api/v1/health
  uploads/         # Evidence file storage (gitignored)
  nightwise.db     # SQLite database (gitignored, auto-created)
```
