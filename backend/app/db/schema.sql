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
    last_activity_at TEXT NOT NULL,
    -- 'solo' (one screen) or 'multiplayer' (a hosted game people join). Public, unlike origin.
    kind             TEXT NOT NULL DEFAULT 'solo' CHECK (kind IN ('solo','multiplayer')),
    join_code        TEXT,             -- multiplayer only; unique index created in connection.py
    -- multiplayer: who can join. 'open': anyone with the code; 'ask': the host accepts each one;
    -- 'closed': nobody new.
    join_policy      TEXT NOT NULL DEFAULT 'open' CHECK (join_policy IN ('open','ask','closed'))
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

-- Multiplayer players. A player's name is their entry's name; deleting the entry removes them.
-- token_hash is a SHA-256 of the random key the player's browser keeps; the key itself is never stored.
CREATE TABLE IF NOT EXISTS players (
    id           TEXT PRIMARY KEY,
    game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    entry_id     TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    avatar       TEXT NOT NULL,
    is_host      INTEGER NOT NULL DEFAULT 0,
    token_hash   TEXT NOT NULL UNIQUE,
    joined_at    TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id, joined_at);

-- Why a player was removed from a multiplayer game, so their page can say so (and a banned
-- browser can't rejoin). Keyed by the hash of the key the browser still holds.
CREATE TABLE IF NOT EXISTS player_removals (
    game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    player_id  TEXT NOT NULL,
    name       TEXT NOT NULL,
    avatar     TEXT NOT NULL,
    reason     TEXT NOT NULL CHECK (reason IN ('kicked','banned','timed_out')),
    removed_at TEXT NOT NULL,
    PRIMARY KEY (game_id, token_hash)
);

-- Asking to join: a kicked or timed-out player asking to come back, or a newcomer to a game that
-- needs the host's OK. Keyed by the hash of the key the asking browser holds. 'accepted' waits for
-- the player to confirm they still want to join.
CREATE TABLE IF NOT EXISTS join_requests (
    game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    player_id  TEXT NOT NULL,     -- a returning player keeps theirs; a newcomer gets one now
    name       TEXT NOT NULL,
    avatar     TEXT NOT NULL,
    state      TEXT NOT NULL CHECK (state IN ('pending','accepted','declined')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (game_id, token_hash)
);
