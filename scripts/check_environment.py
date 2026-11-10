"""Check that the local development environment is ready for Marswalk Planner.

Usage (from the repository root):

    backend/.venv/bin/python scripts/check_environment.py

Exit code 0 means every required check passed. This script does not download
or process any planetary data.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

REQUIRED_DATA_DIRS = ["raw", "interim", "processed", "sample", "catalog", "manifests"]


def _line(ok: bool, label: str, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {label}{(' - ' + detail) if detail else ''}")
    return ok


def _command_version(cmd: list[str]) -> str | None:
    if shutil.which(cmd[0]) is None:
        return None
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return (out.stdout or out.stderr).strip().splitlines()[0] if (out.stdout or out.stderr) else None


def main() -> int:
    results: list[bool] = []

    py_ok = sys.version_info >= (3, 11)
    results.append(_line(py_ok, "Python >= 3.11", sys.version.split()[0]))

    try:
        from app.geospatial.environment import check_geospatial_environment

        env = check_geospatial_environment()
        results.append(_line(True, "pyproj / PROJ", f"{env.pyproj_version} / {env.proj_version}"))
        results.append(_line(True, "rasterio / GDAL", f"{env.rasterio_version} / {env.gdal_version}"))
        results.append(
            _line(
                env.mars_crs_available,
                f"Mars CRS {env.mars_crs_code}",
                f"{env.mars_crs_name}, a={env.mars_semi_major_axis_m} m"
                if env.mars_crs_available
                else str(env.error),
            )
        )
    except ImportError as exc:
        results.append(_line(False, "Backend packages importable", f"{exc} (activate backend/.venv?)"))

    node = _command_version(["node", "--version"])
    results.append(_line(node is not None, "Node.js", node or "not found"))
    npm = _command_version(["npm", "--version"])
    results.append(_line(npm is not None, "npm", npm or "not found"))

    for name in REQUIRED_DATA_DIRS:
        path = REPO_ROOT / "data" / name
        results.append(_line(path.is_dir(), f"data/{name}/ exists"))

    free_gb = shutil.disk_usage(REPO_ROOT).free / 1e9
    # Informational only: the HiRISE-scale data budget is discussed in docs/assumptions.md.
    print(f"[INFO] Free disk space: {free_gb:.0f} GB")

    passed = all(results)
    print("\nAll required checks passed." if passed else "\nSome checks FAILED.")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

