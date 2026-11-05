"""R6: the health check queries the database."""
from app.db import connection


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_health_503_when_database_is_unavailable(client, tmp_path, monkeypatch):
    # A directory can't be opened as a database file.
    monkeypatch.setattr(connection, "_db_path", str(tmp_path))
    r = client.get("/api/health")
    assert r.status_code == 503
    assert r.json() == {"error": {"code": "unhealthy", "message": "Database unavailable"}}
