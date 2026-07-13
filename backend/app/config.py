from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """App configuration. Override any field via environment variable or backend/.env."""

    # Absolute path so the DB lands in backend/ no matter where uvicorn is launched from.
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'codelab.db').as_posix()}"
    secret_key: str = "dev-secret-change-me"
    token_ttl_hours: int = 12
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # For hosts with no shell access to run `python -m app.seed` manually
    # (e.g. AWS App Runner). Off by default so local dev / the CLI script's
    # existing behavior is unaffected.
    auto_seed_on_boot: bool = False
    seed_pin_mode: str = "random"  # "random" or "sequential"

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env")


settings = Settings()
