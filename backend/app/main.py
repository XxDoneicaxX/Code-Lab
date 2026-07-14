from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401  (registers tables with Base.metadata)
from .config import settings
from .database import Base, SessionLocal, engine
from .routers import classrooms, groups, projects
from .seed import seed_classrooms

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.auto_seed_on_boot:
        db = SessionLocal()
        try:
            lines = seed_classrooms(db, pin_mode=settings.seed_pin_mode)
            if lines:
                # No shell access on hosts like App Runner to run the seed
                # CLI manually, so print PINs here — they land in CloudWatch
                # (or whatever collects stdout) instead of a local file.
                print("=" * 60)
                print("Tech Titans Lab: seeded classrooms on first boot. Classroom PINs:")
                print("\n".join(lines))
                print("Save these now — they won't be printed again unless the DB is reset.")
                print("=" * 60)
        finally:
            db.close()
    yield


app = FastAPI(title="Tech Titans Lab API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_isolation_headers(request: Request, call_next):
    """input() needs a cross-origin isolated page (SharedArrayBuffer);
    the Vite dev server sets these separately — this covers production,
    where this app serves itself with no separate reverse proxy needed."""
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    return response


app.include_router(classrooms.router)
app.include_router(groups.router)
app.include_router(projects.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve the built frontend (frontend/dist, from `npm run build`) so a single
# `uvicorn app.main:app` process is the whole deployment — no separate static
# host or reverse proxy required. Absent in local dev unless you've built it.
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        # Everything else (including client-side routes like /classrooms/4)
        # falls back to index.html so React Router can take over.
        return FileResponse(FRONTEND_DIST / "index.html")
