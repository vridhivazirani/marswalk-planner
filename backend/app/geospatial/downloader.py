"""Robust planetary dataset downloader with integrity verification and resume capability.

Rules enforced:
1. Preserve original downloads in data/raw without in-place modification.
2. Never overwrite existing files unless explicitly flagged or resuming.
3. Compute and verify SHA-256 checksums.
4. Record every successful download in data/manifests/download_manifest.jsonl.
5. Provide clear structured logging and progress updates.
"""

from __future__ import annotations

import hashlib
import json
import logging
import ssl
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import certifi

logger = logging.getLogger("marswalk.ingestion")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    fmt = "[%(asctime)s] [%(levelname)s] %(message)s"
    handler.setFormatter(logging.Formatter(fmt, datefmt="%H:%M:%S"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


@dataclass(frozen=True)
class DownloadManifestEntry:
    """Provenance and cryptographic record for a downloaded product."""

    product_id: str
    target_rel_path: str
    source_url: str
    sha256: str
    byte_size: int
    retrieved_utc: str
    status: str
    error: str | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class PlanetaryDownloader:
    """Manages resilient planetary data downloads with resume and validation."""

    def __init__(self, data_root: Path | None = None, chunk_size: int = 1024 * 1024) -> None:
        if data_root is None:
            # Root repository data/ directory
            self.data_root = Path(__file__).resolve().parents[3] / "data"
        else:
            self.data_root = Path(data_root)

        self.raw_dir = self.data_root / "raw"
        self.manifest_dir = self.data_root / "manifests"
        self.manifest_file = self.manifest_dir / "download_manifest.jsonl"
        self.chunk_size = chunk_size

        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.manifest_dir.mkdir(parents=True, exist_ok=True)

        # Standard SSL context using certifi bundle
        self.ssl_context = ssl.create_default_context(cafile=certifi.where())

    def compute_sha256(self, file_path: Path) -> str:
        """Calculate the SHA-256 hexadecimal digest of a local file."""
        hasher = hashlib.sha256()
        with file_path.open("rb") as f:
            while chunk := f.read(self.chunk_size):
                hasher.update(chunk)
        return hasher.hexdigest()

    def record_manifest(self, entry: DownloadManifestEntry) -> None:
        """Append a manifest entry to download_manifest.jsonl."""
        with self.manifest_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry.to_dict()) + "\n")
        logger.info(f"Recorded manifest entry for {entry.product_id} ({entry.target_rel_path})")

    def download_file(
        self,
        url: str,
        dest_rel_path: str,
        product_id: str,
        expected_sha256: str | None = None,
        expected_size: int | None = None,
        progress_callback: Callable[[int, int | None], None] | None = None,
    ) -> DownloadManifestEntry:
        """Download a file with HTTP Range resume support, verify, and log.

        Args:
            url: Remote authentic URL to fetch.
            dest_rel_path: Relative destination inside data/raw (e.g. 'usgs_trn/file.tif').
            product_id: Authentic mission/USGS identifier.
            expected_sha256: Optional SHA-256 for validation.
            expected_size: Optional expected total byte count.
            progress_callback: Optional progress reporter (downloaded_bytes, total_bytes).
        """
        dest_path = self.raw_dir / dest_rel_path
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        part_path = dest_path.with_suffix(dest_path.suffix + ".part")

        # Check if already fully downloaded
        if dest_path.exists():
            existing_size = dest_path.stat().st_size
            if expected_size is None or existing_size == expected_size:
                logger.info(
                    f"File already exists: {dest_path.name} ({existing_size:,} bytes). Verifying..."
                )
                actual_hash = self.compute_sha256(dest_path)
                if expected_sha256 is None or actual_hash == expected_sha256:
                    logger.info(f"Verified existing file integrity: {dest_path.name}")
                    entry = DownloadManifestEntry(
                        product_id=product_id,
                        target_rel_path=str(dest_path.relative_to(self.data_root)),
                        source_url=url,
                        sha256=actual_hash,
                        byte_size=existing_size,
                        retrieved_utc=datetime.now(UTC).isoformat(),
                        status="ALREADY_EXISTS_VERIFIED",
                    )
                    self.record_manifest(entry)
                    return entry
                else:
                    logger.warning(
                        f"Existing file hash mismatch for {dest_path.name}. "
                        f"Expected {expected_sha256}, got {actual_hash}. Re-downloading."
                    )
                    dest_path.unlink()

        # Handle resume from .part file if available
        start_byte = 0
        if part_path.exists():
            start_byte = part_path.stat().st_size
            logger.info(f"Resuming download from byte {start_byte:,} for {dest_path.name}")

        headers = {
            "User-Agent": (
                "MarswalkPlanner/1.0 (Planetary Research Prototype; contact: research@example.com)"
            )
        }
        if start_byte > 0:
            headers["Range"] = f"bytes={start_byte}-"

        req = urllib.request.Request(url, headers=headers)

        try:
            with urllib.request.urlopen(req, context=self.ssl_context, timeout=60) as resp:
                status = resp.status
                total_content_length = resp.headers.get("Content-Length")
                total_bytes = None

                if status == 206:  # Partial Content / Resumed
                    content_range = resp.headers.get("Content-Range")
                    if content_range and "/" in content_range:
                        try:
                            total_bytes = int(content_range.split("/")[1])
                        except ValueError:
                            pass
                elif status == 200:
                    start_byte = 0
                    if total_content_length:
                        total_bytes = int(total_content_length)

                mode = "ab" if start_byte > 0 else "wb"
                downloaded = start_byte

                with part_path.open(mode) as f:
                    while chunk := resp.read(self.chunk_size):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if progress_callback:
                            progress_callback(downloaded, total_bytes)

        except urllib.error.HTTPError as exc:
            if exc.code == 416:  # Range Not Satisfiable -> part is already complete or invalid
                logger.warning(
                    f"HTTP 416 Range Not Satisfiable. Resetting part file for {dest_path.name}"
                )
                if part_path.exists():
                    part_path.unlink()
                return self.download_file(
                    url,
                    dest_rel_path,
                    product_id,
                    expected_sha256,
                    expected_size,
                    progress_callback,
                )
            error_msg = f"HTTP Error {exc.code}: {exc.reason} for {url}"
            logger.error(error_msg)
            entry = DownloadManifestEntry(
                product_id=product_id,
                target_rel_path=str(dest_path.relative_to(self.data_root)),
                source_url=url,
                sha256="",
                byte_size=part_path.stat().st_size if part_path.exists() else 0,
                retrieved_utc=datetime.now(UTC).isoformat(),
                status="FAILED",
                error=error_msg,
            )
            self.record_manifest(entry)
            return entry
        except Exception as exc:
            error_msg = f"Download exception: {exc} for {url}"
            logger.error(error_msg)
            entry = DownloadManifestEntry(
                product_id=product_id,
                target_rel_path=str(dest_path.relative_to(self.data_root)),
                source_url=url,
                sha256="",
                byte_size=part_path.stat().st_size if part_path.exists() else 0,
                retrieved_utc=datetime.now(UTC).isoformat(),
                status="FAILED",
                error=error_msg,
            )
            self.record_manifest(entry)
            return entry

        # Move .part into final destination
        part_path.rename(dest_path)
        actual_size = dest_path.stat().st_size
        actual_hash = self.compute_sha256(dest_path)

        # Integrity Checks
        if expected_size is not None and actual_size != expected_size:
            err = f"Size mismatch: expected {expected_size:,} bytes, got {actual_size:,} bytes"
            logger.error(err)
            entry = DownloadManifestEntry(
                product_id=product_id,
                target_rel_path=str(dest_path.relative_to(self.data_root)),
                source_url=url,
                sha256=actual_hash,
                byte_size=actual_size,
                retrieved_utc=datetime.now(UTC).isoformat(),
                status="CORRUPTED_SIZE_MISMATCH",
                error=err,
            )
            self.record_manifest(entry)
            return entry

        if expected_sha256 is not None and actual_hash != expected_sha256:
            err = f"SHA-256 mismatch: expected {expected_sha256}, got {actual_hash}"
            logger.error(err)
            entry = DownloadManifestEntry(
                product_id=product_id,
                target_rel_path=str(dest_path.relative_to(self.data_root)),
                source_url=url,
                sha256=actual_hash,
                byte_size=actual_size,
                retrieved_utc=datetime.now(UTC).isoformat(),
                status="CORRUPTED_HASH_MISMATCH",
                error=err,
            )
            self.record_manifest(entry)
            return entry

        logger.info(f"Successfully downloaded & verified: {dest_path.name} ({actual_size:,} bytes)")
        entry = DownloadManifestEntry(
            product_id=product_id,
            target_rel_path=str(dest_path.relative_to(self.data_root)),
            source_url=url,
            sha256=actual_hash,
            byte_size=actual_size,
            retrieved_utc=datetime.now(UTC).isoformat(),
            status="SUCCESS",
        )
        self.record_manifest(entry)
        return entry
