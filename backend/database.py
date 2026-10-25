from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from pathlib import Path

# SQLite file lives inside backend/ so it is easy to find and gitignore.
# check_same_thread=False is required for SQLite when FastAPI handles
# requests across multiple threads (the default uvicorn worker model).
_db_path = Path(__file__).resolve().parent / "nightwise.db"
DATABASE_URL = f"sqlite:///{_db_path.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db():
    Base.metadata.create_all(bind=engine)
    try:
        with engine.connect() as conn:
            cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(journeys)").fetchall()]
            if cols:
                if "planned_departure_at" not in cols:
                    conn.exec_driver_sql("ALTER TABLE journeys ADD COLUMN planned_departure_at DATETIME")
                if "created_at" not in cols:
                    conn.exec_driver_sql("ALTER TABLE journeys ADD COLUMN created_at DATETIME")

            ci_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(check_ins)").fetchall()]
            if ci_cols:
                if "status" not in ci_cols:
                    conn.exec_driver_sql("ALTER TABLE check_ins ADD COLUMN status VARCHAR(30) DEFAULT 'confirmed'")
                if "created_at" not in ci_cols:
                    conn.exec_driver_sql("ALTER TABLE check_ins ADD COLUMN created_at DATETIME")
                if "responded_at" not in ci_cols:
                    conn.exec_driver_sql("ALTER TABLE check_ins ADD COLUMN responded_at DATETIME")

            cr_cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(community_reports)").fetchall()]
            if cr_cols:
                if "created_at" not in cr_cols:
                    conn.exec_driver_sql("ALTER TABLE community_reports ADD COLUMN created_at DATETIME")
                if "is_demo" not in cr_cols:
                    conn.exec_driver_sql("ALTER TABLE community_reports ADD COLUMN is_demo BOOLEAN DEFAULT 0")
                if "moderator_notes" not in cr_cols:
                    conn.exec_driver_sql("ALTER TABLE community_reports ADD COLUMN moderator_notes TEXT")
                if "reviewed_at" not in cr_cols:
                    conn.exec_driver_sql("ALTER TABLE community_reports ADD COLUMN reviewed_at DATETIME")
                if "reviewed_by" not in cr_cols:
                    conn.exec_driver_sql("ALTER TABLE community_reports ADD COLUMN reviewed_by VARCHAR(100)")
            conn.commit()
    except Exception:
        pass


def get_db():
    """FastAPI dependency: yields a database session and closes it on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
