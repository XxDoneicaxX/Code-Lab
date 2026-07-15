from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    # FastAPI may serve requests for the same session from different threads.
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=connect_args)

if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, connection_record):
        # WAL lets reads and concurrent autosave writes proceed without the
        # whole database locking on every write; busy_timeout makes SQLite
        # wait for a brief lock to clear instead of failing immediately
        # (the frontend's autosave also retries on failure, as a second layer).
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """Hand-rolled migrations for columns added after the initial deploy.

    `Base.metadata.create_all` only creates missing tables — it never alters
    an existing one — so a column added to a model after go-live needs an
    explicit ALTER TABLE here. No Alembic in this project; this is the
    lightweight equivalent for a single-table, single-tenant SQLite app.
    """
    inspector = inspect(engine)
    if "groups" not in inspector.get_table_names():
        return  # fresh database — create_all will create it with all columns
    columns = {col["name"] for col in inspector.get_columns("groups")}
    if "kind" not in columns:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE groups ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'capstone'")
            )
