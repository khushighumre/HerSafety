from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# SQLite file lives inside backend/ so it is easy to find and gitignore.
# check_same_thread=False is required for SQLite when FastAPI handles
# requests across multiple threads (the default uvicorn worker model).
DATABASE_URL = "sqlite:///./nightwise.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: yields a database session and closes it on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
