"""Consistent SQLite snapshots, for the admin backup download and automatic backups."""
from __future__ import annotations

import os
import re
import sqlite3
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone

BACKUP_FILENAME_RE = re.compile(r"luckdecidesyourfate-\d{8}-\d{6}\.db")


@dataclass
class BackupStatus:
    """What the admin dashboard shows about automatic backups."""

    enabled: bool = False
    last_success_at: str | None = None
    last_error: str | None = None  # an exception class name, never its message


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
