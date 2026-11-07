# API changes in v1.1

Additions to the v1 contract (`docs/plan-v1.md` §8). Nothing from v1 changed shape.

## New error codes

| Code | HTTP | When |
|---|---|---|
| `too_many_attempts` | 429 | Admin login from an IP that has too many recent failures. Includes a `Retry-After` header in whole seconds. |
| `unhealthy` | 503 | `GET /api/health` could not query the database. The 200 response is unchanged. |

## WebSocket close codes

| Code | When | Client behavior |
|---|---|---|
| `1012` | The server is shutting down (for example a redeploy). Replaces `1001`. | Non-fatal: reconnect with the normal backoff. Only `4401` and `4404` are final. |

## v1.2: admin dashboard

`Dashboard` has a new field, `backup: { enabled, last_success_at, last_error }`, for automatic backups. `last_error` is an exception class name such as `ClientError`, never a URL or key. It's only in the admin dashboard, never in public state or on player sockets.

## New endpoints

| Method | Path | Auth | Success |
|---|---|---|---|
| GET | `/api/admin/backup` | admin cookie (otherwise 401 envelope) | 200 `application/vnd.sqlite3`, a consistent database snapshot, with `Content-Disposition: attachment; filename="luckdecidesyourfate-YYYYMMDD-HHMMSS.db"` (UTC) |
| GET | `/robots.txt` | none | 200 `text/plain` |
| GET | `/api/admin/analytics?days=7\|30\|90` | admin cookie (otherwise 401 envelope) | 200 `AnalyticsReport` (below). `days` defaults to 7; any other value is a 422 `validation_error`. |

## v1.2: public game state

`PublicGameState` has a new field, `recent_spins`: up to 10 finished spins, newest first. Each item has exactly `spin_id`, `winner_name` and `finished_at`. A spin in progress is never listed. It appears in REST responses and player `state` events, and in the `game` part of admin state.

## v1.3: admin analytics

`GET /api/admin/analytics` returns:

```json
{
  "generated_at": "2026-11-07T13:38:16.000Z",
  "days": 7,
  "sections": [
    { "id": "links", "title": "Your links", "metrics": [
      { "id": "link_spins", "title": "Spins on links", "description": "…", "kind": "number",
        "data": { "value": 17, "hint": null }, "error": null }
    ] }
  ]
}
```

`kind` is `number`, `series`, `breakdown` or `table` (a `series` may carry an optional `hint`, and a `number` an optional `format`, which is `"duration"` when `value` is seconds), and `data` has that kind's shape (see `docs/analytics.md`). If one metric fails, its `data` is `null` and `error` is the exception's class name only; the other metrics still load. The response can contain rule information, so it's admin-only and never appears in public state or on player sockets.

## v1.3: visits

`/ws/games/{id}` accepts an optional `?resume=1`. The wheel page adds it to every connection after its first one (after the tab was hidden for 15 seconds, or an automatic reconnect), so the server counts one visit per page load. It's a flag, not an identifier; anything other than `1` counts as a new visit. The socket behaves the same either way: it marks the link opened, sends `state` and updates presence.

## v1.4: click-to-target

`rule_status` in admin link state has a new field, `targets`: every entry of `target_names` in priority order, as `{ "name", "entry_ids" }`, where `entry_ids` are the active entries the server matches to that target (possibly none). The controller uses it to show and toggle targets by clicking names, without matching names in the browser. Targets are still saved through `PATCH /api/admin/links/{id}` with `target_names`. Admin-only, like the rest of `rule_status`.

## v1.4: multiplayer games

A game is `solo` (one screen; anyone with the URL can change it, as before) or `multiplayer` (a hosted game people join). `PublicGameState` has three new fields:

| Field | Value |
|---|---|
| `kind` | `"solo"` or `"multiplayer"` |
| `join_code` | 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` for multiplayer games, otherwise `null` |
| `players` | multiplayer only (otherwise `[]`), in joining order: `{ "id", "entry_id", "name", "avatar", "status", "is_host" }`. `name` is the player's entry on the wheel; `status` is `"here"` while one of their sockets is open, else `"away"`. |

Players are identified by a random key returned once when they host or join. The browser sends it as an `X-Player-Token` header; the server stores only its SHA-256. In a multiplayer game, every change (entries, shuffle, restore, settings, spin) needs the host's key: anyone else gets a 403 `not_host`. Solo wheels ignore the header.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/games/{id}/host` | `{ "name", "avatar" }` | 201 `{ player_id, player_token, state }`: the game becomes multiplayer, the caller is host, and their name is added to the wheel | 409 `already_multiplayer`, 409 `entries_limit`, 409 `spin_in_progress`, 422 |
| POST | `/api/games/{id}/players` | `{ "name", "avatar" }` | 201 `{ player_id, player_token, state }`; the first player of an empty game becomes host | 409 `not_multiplayer`, 409 `entries_limit`, 409 `spin_in_progress`, 422 |
| DELETE | `/api/games/{id}/players/me` | none | 200 `PublicGameState` (the player and their name are removed; the host role passes on) | 403 `not_a_player`, 409 `spin_in_progress` |
| DELETE | `/api/games/{id}/players/{player_id}` | none | 200 `PublicGameState` (host only) | 403 `not_host`, 404 `player_not_found`, 409 `not_multiplayer`, 409 `spin_in_progress` |
| POST | `/api/games/{id}/socket-ticket` | none | 200 `{ "ticket" }`: single use, valid for 30 seconds | 403 `not_a_player` |
| GET | `/api/join/{code}` | none | 200 `{ "game_id" }` (the code is case-insensitive) | 404 `code_not_found` |

`avatar` is one of `fox`, `cat`, `frog`, `panda`, `owl`, `octopus`, `penguin`, `tiger`, `unicorn`, `bear`, `wizard`, `ninja`, `hero`, `cowboy`, `alien`, `robot`. Names follow the entry rules (1–40 characters after trimming).

`/ws/games/{id}?ticket=...` connects as that player (a ticket never contains the key). Without a valid ticket the socket just watches, exactly as before. A player's socket opening or closing is a public change (`state` to everyone, since `status` changes). A player with no open socket for 10 minutes is removed, as is anyone whose name the host deletes. When the host leaves, the earliest-joined player who is here becomes host, else the earliest-joined player.

New error codes: `not_host` (403), `not_a_player` (403), `not_multiplayer` (409), `already_multiplayer` (409), `code_not_found` (404), `player_not_found` (404).

Controller links are solo games until the controller part of multiplayer (2b); a friend can host one like any other wheel, and its rule still applies.

