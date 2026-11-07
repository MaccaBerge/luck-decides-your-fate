CREATE TABLE IF NOT EXISTS games (
    id               TEXT PRIMARY KEY,
    game_type        TEXT NOT NULL DEFAULT 'wheel',
    origin           TEXT NOT NULL CHECK (origin IN ('public','admin_link')),
    label            TEXT,
    mode             TEXT NOT NULL DEFAULT 'fair' CHECK (mode IN ('fair','always','never')),
    target_names     TEXT NOT NULL DEFAULT '[]',
    remove_winner    INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    first_opened_at  TEXT,
    last_activity_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_origin_activity ON games(origin, last_activity_at);

CREATE TABLE IF NOT EXISTS entries (
    id         TEXT PRIMARY KEY,
    game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    position   INTEGER NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_game ON entries(game_id, position);

CREATE TABLE IF NOT EXISTS spins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    winner_entry_id TEXT NOT NULL,          -- no FK: entry may be deleted later
    winner_name     TEXT NOT NULL,          -- snapshot
    mode            TEXT NOT NULL,
    rule_applied    INTEGER NOT NULL,
    started_at      TEXT NOT NULL,
    finished_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_spins_game ON spins(game_id, id);

-- Admin analytics: daily totals that survive the cleanup of idle wheels. Numbers only:
-- `name` is a counter name from app/analytics/counters.py, never a person's name or an ID.
CREATE TABLE IF NOT EXISTS daily_counters (
    day   TEXT NOT NULL,      -- YYYY-MM-DD, UTC
    name  TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, name)
);
