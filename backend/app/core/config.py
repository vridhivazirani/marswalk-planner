"""Application configuration.

Values can be overridden with environment variables prefixed ``MARSWALK_``
(for example ``MARSWALK_DATA_DIR=/Volumes/External/marswalk-data``) or with a
``backend/.env`` file (git-ignored).
"""

import json
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> parents[3] is the repository root.
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Runtime settings for the backend."""

    model_config = SettingsConfigDict(env_prefix="MARSWALK_", env_file=".env", extra="ignore")

    environment: str = "development"
    debug: bool = False
    api_prefix: str = "/api/v1"

    # Root of the data lake (raw/, interim/, processed/, sample/, catalog/, manifests/).
    data_dir: Path = REPO_ROOT / "data"

    # Explicit CORS allowed origins (never wildcard "*" when allow_credentials=True)
    # Configure production origins via MARSWALK_CORS_ORIGINS="https://marswalk.org,https://sub.marswalk.org"
    cors_origins: str | list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @property
    def allowed_cors_origins(self) -> list[str]:
        """Parsed list of allowed CORS origins supporting comma-separated strings or JSON arrays."""
        v = self.cors_origins
        if isinstance(v, str):
            v_str = v.strip()
            if v_str.startswith("[") and v_str.endswith("]"):
                try:
                    return [str(o).strip() for o in json.loads(v_str) if str(o).strip()]
                except Exception:
                    pass
            return [origin.strip() for origin in v_str.split(",") if origin.strip()]
        if isinstance(v, (list, tuple)):
            return [str(origin).strip() for origin in v if str(origin).strip()]
        return []


@lru_cache
def get_settings() -> Settings:
    """Return cached settings (read once per process)."""
    return Settings()
