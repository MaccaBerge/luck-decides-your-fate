"""Automatic backups of the SQLite file to a private S3-compatible bucket. Off unless configured.

The newest object in the bucket decides when the next backup is due, not a timer: every deploy
restarts the container, so a plain 24-hour sleep might never fire.

Failures are recorded as an exception class name only. Messages from the S3 client can contain
the endpoint or bucket, so they must not reach the logs or the dashboard.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Protocol

from app.config import Settings
from app.services.backup import BACKUP_FILENAME_RE, backup_filename, create_snapshot
from app.timeutil import utc_iso

if TYPE_CHECKING:
    from app.context import AppContext

log = logging.getLogger(__name__)

CHECK_INTERVAL_S = 60 * 60
BACKUP_PREFIX = "backups/"


class SnapshotCheckFailed(Exception):
    """The snapshot failed PRAGMA integrity_check, so it wasn't uploaded."""


@dataclass(frozen=True)
class StoredBackup:
    key: str
    last_modified: datetime


class BackupStore(Protocol):
    """Blocking calls, run in a worker thread. Tests inject a fake."""

    def list_objects(self) -> list[StoredBackup]: ...  # everything under BACKUP_PREFIX
    def upload(self, path: str, key: str) -> None: ...
    def delete(self, key: str) -> None: ...


class S3BackupStore:
    def __init__(self, settings: Settings) -> None:
        # Imported here so that an app with backups off doesn't load it.
        import boto3
        from botocore.config import Config

        self._bucket = settings.backup_s3_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.backup_s3_endpoint,
            aws_access_key_id=settings.backup_s3_access_key_id,
            aws_secret_access_key=settings.backup_s3_secret_access_key,
            region_name="auto",
            config=Config(
                # A cancelled task can't interrupt a blocking thread, so calls must end by themselves.
                connect_timeout=10,
                read_timeout=60,
                retries={"max_attempts": 3},
                # R2 and other S3-compatible stores don't all support the newer default checksums.
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )

    def list_objects(self) -> list[StoredBackup]:
        pages = self._client.get_paginator("list_objects_v2").paginate(Bucket=self._bucket, Prefix=BACKUP_PREFIX)
        return [
            StoredBackup(item["Key"], item["LastModified"]) for page in pages for item in page.get("Contents", [])
        ]

    def upload(self, path: str, key: str) -> None:
        self._client.upload_file(path, self._bucket, key)

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)


def _our_backups(objects: list[StoredBackup]) -> list[StoredBackup]:
    """Only objects with the exact backup name. Nothing else in the bucket is ever touched."""
    return [
        o
        for o in objects
        if o.key.startswith(BACKUP_PREFIX) and BACKUP_FILENAME_RE.fullmatch(o.key[len(BACKUP_PREFIX) :])
    ]


def _check_snapshot(path: str) -> None:
    con = sqlite3.connect(path)
    try:
        if con.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise SnapshotCheckFailed
    finally:
        con.close()


def _snapshot_and_upload(database_path: str, store: BackupStore) -> None:
    # All in one thread: the temp file is removed even if the task waiting for this was cancelled.
    path = create_snapshot(database_path)
    try:
        _check_snapshot(path)
        store.upload(path, BACKUP_PREFIX + backup_filename())
    finally:
        os.unlink(path)


def _delete_old_backups(store: BackupStore, keep: int) -> None:
    # Backup names sort by time.
    backups = sorted(_our_backups(store.list_objects()), key=lambda o: o.key, reverse=True)
    for old in backups[keep:]:
        store.delete(old.key)


def _record_failure(ctx: AppContext, step: str, exc: Exception) -> None:
    name = type(exc).__name__
    ctx.backup_status.last_error = name
    log.error("backup: %s failed (%s)", step, name)
    ctx.manager.request_dashboard()


async def run_backup_check(ctx: AppContext, store: BackupStore, now: datetime | None = None) -> bool:
    """Back up if the newest copy is too old. Returns whether it uploaded. Failures don't raise."""
    settings = ctx.settings
    status = ctx.backup_status
    now = now or datetime.now(timezone.utc)
    try:
        backups = _our_backups(await asyncio.to_thread(store.list_objects))
        newest = max((b.last_modified for b in backups), default=None)
        if newest is not None:
            status.last_success_at = utc_iso(newest)
        if newest is not None and now - newest < timedelta(hours=settings.backup_interval_hours):
            status.last_error = None
            ctx.manager.request_dashboard()
            return False
        await asyncio.to_thread(_snapshot_and_upload, settings.database_path, store)
    except Exception as exc:  # noqa: BLE001
        _record_failure(ctx, "upload", exc)
        return False

    status.last_success_at = utc_iso(now)
    status.last_error = None
    log.info("backup: uploaded")
    ctx.manager.request_dashboard()
    try:
        await asyncio.to_thread(_delete_old_backups, store, settings.backup_keep)
    except Exception as exc:  # noqa: BLE001
        # The new copy is safe; old ones are retried after the next upload.
        _record_failure(ctx, "deleting old copies", exc)
    return True


async def backup_loop(
    ctx: AppContext, store: BackupStore | None = None, interval_s: float = CHECK_INTERVAL_S
) -> None:
    while True:
        try:
            if store is None:
                store = await asyncio.to_thread(S3BackupStore, ctx.settings)
            await run_backup_check(ctx, store)
        except Exception as exc:  # noqa: BLE001
            _record_failure(ctx, "setup", exc)
        await asyncio.sleep(interval_s)
