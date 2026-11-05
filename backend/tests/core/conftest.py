import pytest

from app.db.connection import init_db


@pytest.fixture
async def db(tmp_path):
    path = tmp_path / "t.db"
    await init_db(str(path))
    return path
