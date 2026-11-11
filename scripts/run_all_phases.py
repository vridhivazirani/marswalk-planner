#!/usr/bin/env python3
"""MARSWALK PLANNER — MASTER PHASE EXECUTION & VALIDATION RUNNER.

Sequentially executes and validates all phases from Phase 0 to Phase 10:
- Phase 0: Geodetic & Repository Foundations
- Phase 1: Planetary Dataset Discovery & Catalog Provenance (37 authentic products)
- Phase 2: Mars Geodesy, ARD Grid & Preprocessing Pipeline
- Phase 3: Terrain Analysis, Slope Incline, Roughness & Hazards
- Phase 4: REST API Endpoints & Multi-Region Registry (12 regions)
- Phase 5: Unified Costmap Engine & A* Traversal Pathfinder
- Phase 6: 3D Mars Globe & MOLA 200m Elevation Model
- Phase 7: CRISM Hyperspectral Mineralogy & Astrobiology Target Ranking
- Phase 8: Computer Vision Candidate Detection (Boulders, Dunes, Cratering)
- Phase 9: Adapted Pandolf-Santee Biophysics & Emergency Dynamic Rerouting
- Phase 10: AI Research Assistant, Scientific Reproducibility & Export Pack
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
VENV_BIN = BACKEND_DIR / ".venv" / "bin"
PYTHON_BIN = VENV_BIN / "python"
PYTEST_BIN = VENV_BIN / "pytest"
RUFF_BIN = VENV_BIN / "ruff"

CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


def log_phase(num: int, title: str) -> None:
    print(f"\n{BOLD}{CYAN}{'='*78}{RESET}")
    print(f"{BOLD}{CYAN}  PHASE {num}: {title.upper()}{RESET}")
    print(f"{BOLD}{CYAN}{'='*78}{RESET}")


def run_cmd(cmd: list[str], cwd: Path | None = None, desc: str = "") -> bool:
    print(f"{YELLOW}▶ [{desc}] Running: {' '.join(cmd)}{RESET}")
    t0 = time.time()
    res = subprocess.run(cmd, cwd=cwd or ROOT, text=True, capture_output=True)
    dt = time.time() - t0
    if res.returncode == 0:
        print(f"{GREEN}✔ [{desc}] Passed in {dt:.2f}s{RESET}")
        return True
    else:
        print(f"{RED}✖ [{desc}] Failed with exit code {res.returncode}:{RESET}")
        print(res.stdout[-1000:] if len(res.stdout) > 1000 else res.stdout)
        print(res.stderr[-1000:] if len(res.stderr) > 1000 else res.stderr)
        return False


def main() -> int:
    start_total = time.time()
    print(f"\n{BOLD}MARSWALK PLANNER — FULL ROADMAP VERIFICATION & EXECUTION SUITE{RESET}")
    print(f"Target: All Phases (0 through 10) | Root: {ROOT}\n")

    stages_results: list[tuple[str, bool]] = []

    # Phase 0: Foundations & Geodesy Diagnostic
    log_phase(0, "Geodetic & Repository Foundations")
    p0_env = run_cmd([str(PYTHON_BIN), "scripts/check_environment.py"], desc="Geodesy & Environment")
    p0_arch = run_cmd([str(PYTEST_BIN), "tests/architecture/test_layering.py"], cwd=BACKEND_DIR, desc="Architecture Layering")
    stages_results.append(("Phase 0: Foundations & Architecture", p0_env and p0_arch))

    # Phase 1: Data Discovery & Catalog Provenance
    log_phase(1, "Planetary Dataset Discovery & Catalog Provenance")
    p1_cat = run_cmd([str(PYTEST_BIN), "tests/unit/test_atlas_catalog.py", "tests/unit/test_ingestion.py"], cwd=BACKEND_DIR, desc="Catalogue & Ingestion Tests")
    stages_results.append(("Phase 1: Catalog & Provenance (37 products)", p1_cat))

    # Phase 2: Mars Geodesy & ARD Preprocessing
    log_phase(2, "Mars Geodesy & ARD Preprocessing Pipeline")
    p2_prep = run_cmd([str(PYTHON_BIN), "scripts/run_preprocessing.py"], desc="ARD Pipeline Run")
    p2_test = run_cmd([str(PYTEST_BIN), "tests/unit/test_preprocessing.py"], cwd=BACKEND_DIR, desc="Preprocessing Tests")
    stages_results.append(("Phase 2: ARD Grid Pipeline", p2_prep and p2_test))

    # Phase 3: Terrain Analysis, Hazards & Uncertainty
    log_phase(3, "Terrain Analysis, Slope Incline, Roughness & Hazards")
    p3_test = run_cmd([
        str(PYTEST_BIN),
        "tests/unit/test_terrain.py",
        "tests/unit/test_terrain_advanced.py",
        "tests/unit/test_hazards.py",
        "tests/unit/test_costmap.py",
    ], cwd=BACKEND_DIR, desc="Terrain, Slope, Roughness & Hazard Tests")
    stages_results.append(("Phase 3: Terrain & Hazard Intelligence", p3_test))

    # Phase 4: REST API Endpoints & Multi-Region Registry
    log_phase(4, "REST API Endpoints & Multi-Region Registry")
    p4_test = run_cmd([
        str(PYTEST_BIN),
        "tests/unit/test_twin.py",
        "tests/unit/test_region_registry.py",
        "tests/unit/test_regional_atlas.py",
        "tests/unit/test_health.py",
    ], cwd=BACKEND_DIR, desc="API & Multi-Region Registry Tests")
    stages_results.append(("Phase 4: API & 12-Region Registry", p4_test))

    # Phase 5: Unified Costmap Engine & Route Planning
    log_phase(5, "Unified Costmap Engine & A* Traversal Pathfinder")
    p5_test = run_cmd([
        str(PYTEST_BIN),
        "tests/unit/test_routing.py",
        "tests/unit/test_route_comparison.py",
    ], cwd=BACKEND_DIR, desc="Costmap & Route Planning Tests")
    stages_results.append(("Phase 5: Route Optimization & Costmaps", p5_test))

    # Phase 6: 3D Mars Globe & MOLA 200m Elevation Model
    log_phase(6, "3D Mars Globe & MOLA 200m Elevation Model")
    p6_test = run_cmd([str(PYTEST_BIN), "tests/unit/test_mola_global.py"], cwd=BACKEND_DIR, desc="MOLA Topography Tests")
    stages_results.append(("Phase 6: 3D Mars Globe & MOLA Elevation", p6_test))

    # Phase 7: CRISM Hyperspectral Mineralogy & Science Opportunity
    log_phase(7, "CRISM Hyperspectral Mineralogy & Astrobiology Target Ranking")
    p7_test = run_cmd([str(PYTEST_BIN), "tests/unit/test_science.py"], cwd=BACKEND_DIR, desc="CRISM & Science Explorer Tests")
    stages_results.append(("Phase 7: CRISM Mineralogy & Science Explorer", p7_test))

    # Phase 8: Computer Vision Candidate Detection
    log_phase(8, "Computer Vision Candidate Detection")
    p8_test = run_cmd([str(PYTEST_BIN), "tests/unit/test_cv_detector.py"], cwd=BACKEND_DIR, desc="CV Shadow Trig & Dune Filter Tests")
    stages_results.append(("Phase 8: Computer Vision Detection", p8_test))

    # Phase 9: Adapted Pandolf-Santee Biophysics & Emergency Dynamic Rerouting
    log_phase(9, "Adapted Pandolf-Santee Biophysics & Emergency Rerouting")
    p9_test = run_cmd([
        str(PYTEST_BIN),
        "tests/unit/test_mission_planning.py",
        "tests/unit/test_environmental.py",
        "tests/unit/test_environmental_models.py",
        "tests/unit/test_emergency.py",
    ], cwd=BACKEND_DIR, desc="Biophysics, Consumables & Emergency Tests")
    stages_results.append(("Phase 9: Biophysics & Emergency Operations", p9_test))

    # Phase 10: AI Research Assistant, Scientific Reproducibility & Export
    log_phase(10, "AI Research Assistant, Scientific Reproducibility & Quality Gate")
    p10_back = run_cmd([
        str(PYTEST_BIN),
        "tests/unit/test_assistant.py",
        "tests/integration/test_frontend_backend_integration.py",
    ], cwd=BACKEND_DIR, desc="Assistant & Integration Tests")
    p10_lint = run_cmd([str(RUFF_BIN), "check", "."], cwd=BACKEND_DIR, desc="Backend Ruff Check")
    p10_front_lint = run_cmd(["npm", "run", "lint"], cwd=FRONTEND_DIR, desc="Frontend Oxlint")
    p10_front_build = run_cmd(["npm", "run", "build"], cwd=FRONTEND_DIR, desc="Frontend Production Build")
    stages_results.append((
        "Phase 10: AI Assistant, Reports & Platform Quality Gate",
        p10_back and p10_lint and p10_front_lint and p10_front_build
    ))

    # Summary
    total_time = time.time() - start_total
    print(f"\n{BOLD}{CYAN}{'='*78}{RESET}")
    print(f"{BOLD}{CYAN}  MASTER PHASE EXECUTION SUMMARY (Total Elapsed: {total_time:.2f}s){RESET}")
    print(f"{BOLD}{CYAN}{'='*78}{RESET}")
    all_success = True
    for name, ok in stages_results:
        status_str = f"{GREEN}PASSED [OK]{RESET}" if ok else f"{RED}FAILED [ERROR]{RESET}"
        print(f"  • {name:<55} {status_str}")
        if not ok:
            all_success = False

    print(f"{BOLD}{CYAN}{'='*78}{RESET}\n")
    if all_success:
        print(f"{BOLD}{GREEN}ALL PHASES (0 THROUGH 10) EXECUTED AND FULLY VERIFIED!{RESET}\n")
        return 0
    else:
        print(f"{BOLD}{RED}SOME PHASES ENCOUNTERED FAILURES. REVIEW LOG ABOVE.{RESET}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())

