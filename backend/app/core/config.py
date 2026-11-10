"""Application configuration.

Values can be overridden with environment variables prefixed ``MARSWALK_``
(for example ``MARSWALK_DATA_DIR=/Volumes/External/marswalk-data``) or with a
``backend/.env`` file (git-ignored).
"""

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


@lru_cache
def get_settings() -> Settings:
    """Return cached settings (read once per process)."""
    return Settings()
