"""Consistent SQLite snapshots for the admin backup download."""
from __future__ import annotations

import os
import sqlite3
import tempfile
from datetime import datetime, timezone


def backup_filename(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return f"luckdecidesyourfate-{now.strftime('%Y%m%d-%H%M%S')}.db"


def create_snapshot(database_path: str) -> str:
    """Copy the live database to a temp file with SQLite's backup API; return the file's path.

    The backup API is safe while the app keeps writing. The caller deletes the file.
    """
    fd, path = tempfile.mkstemp(prefix="ldyf-backup-", suffix=".db")
    os.close(fd)
    try:
        source = sqlite3.connect(database_path, timeout=10)
        try:
            target = sqlite3.connect(path)
            try:
                source.backup(target)
            finally:
                target.close()
        finally:
            source.close()
    except BaseException:
        os.unlink(path)
        raise
    return path
