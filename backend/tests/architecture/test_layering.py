"""Architecture rules enforced as tests (see AGENTS.md, "Backend layering").

1. Domain packages must not import the API layer or the services layer.
2. ``app.core`` must not import any other ``app`` sub-package.
"""

import ast
from pathlib import Path

import pytest

APP_DIR = Path(__file__).resolve().parents[2] / "app"

DOMAIN_PACKAGES = [
    "catalog",
    "ingestion",
    "geospatial",
    "terrain",
    "hazards",
    "uncertainty",
    "science",
    "costmap",
    "routing",
    "mission",
    "models",
]
FORBIDDEN_FOR_DOMAIN = ("app.api", "app.services", "app.main", "fastapi")


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
    return found


def _python_files(package: str) -> list[Path]:
    return sorted((APP_DIR / package).rglob("*.py"))


@pytest.mark.parametrize("package", DOMAIN_PACKAGES)
def test_domain_does_not_import_api_layer(package: str) -> None:
    for path in _python_files(package):
        bad = {m for m in _imported_modules(path) if m.startswith(FORBIDDEN_FOR_DOMAIN)}
        assert not bad, f"{path.relative_to(APP_DIR)} imports forbidden modules: {bad}"


def test_core_is_self_contained() -> None:
    for path in _python_files("core"):
        bad = {
            m
            for m in _imported_modules(path)
            if m.startswith("app.") and not m.startswith("app.core")
        }
        assert not bad, f"{path.relative_to(APP_DIR)} imports non-core app modules: {bad}"


def test_all_domain_packages_exist() -> None:
    for package in DOMAIN_PACKAGES:
        assert (APP_DIR / package / "__init__.py").is_file(), package
