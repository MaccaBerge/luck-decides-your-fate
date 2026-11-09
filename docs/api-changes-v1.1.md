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
| DELETE | `/api/games/{id}/players/me` | none | 200 `{ "ended", "state" }`: the player and their name are removed and the host role passes on (`ended: false`, `state` is the game). If they were the last player the game ends: `{ "ended": true, "state": null }` (see below) | 403 `not_a_player`, 409 `spin_in_progress` |
| DELETE | `/api/games/{id}/players/{player_id}` | none | 200 `PublicGameState` (host only) | 403 `not_host`, 404 `player_not_found`, 409 `not_multiplayer`, 409 `spin_in_progress` |
| POST | `/api/games/{id}/socket-ticket` | none | 200 `{ "ticket" }`: single use, valid for 30 seconds | 403 `not_a_player` |
| GET | `/api/join/{code}` | none | 200 `{ "game_id", "players" }` (the code is case-insensitive; `players` is how many are in the game) | 404 `code_not_found` |

`avatar` is one of `fox`, `cat`, `frog`, `panda`, `owl`, `octopus`, `penguin`, `tiger`, `unicorn`, `bear`, `wizard`, `ninja`, `hero`, `cowboy`, `alien`, `robot`. Names follow the entry rules (1–40 characters after trimming).

`/ws/games/{id}?ticket=...` connects as that player (a ticket never contains the key). Without a valid ticket the socket just watches, exactly as before. A player's socket opening or closing is a public change (`state` to everyone, since `status` changes). A player with no open socket for 10 minutes is removed, as is anyone whose name the host deletes. When the host leaves, the earliest-joined player who is here becomes host, else the earliest-joined player.

New error codes: `not_host` (403), `not_a_player` (403), `not_multiplayer` (409), `already_multiplayer` (409), `code_not_found` (404), `player_not_found` (404).

Controller links are solo games until the controller part of multiplayer (2b); a friend can host one like any other wheel, and its rule still applies.

**Ending a game.** When the last player leaves, the game ends. An ordinary wheel is deleted (its watchers get `game_deleted`); a controller link is only closed: it goes back to a solo wheel with no code, its names, rule and label kept, so a friend can never delete the controller's link (the owner's decision). The leave response is the same either way; only revisiting the old URL shows the difference. A player removed by the 10-minute sweep doesn't end the game.

## v1.4: kicking, banning, requests and who can join

`PublicGameState` has two more multiplayer fields:

| Field | Value |
|---|---|
| `join_policy` | who can join: `"open"` (anyone with the code), `"ask"` (the host accepts each one), `"closed"` (nobody new). `"open"` for solo wheels and by default. |
| `join_requests` | people asking to join, oldest first: `{ "player_id", "name", "avatar", "state" }`, where `state` is `"pending"` (waiting for the host) or `"accepted"` (the host said yes; waiting for the player to confirm). Declined requests and invitations aren't listed. `[]` for solo wheels. |
| `removed_players` | kicked and banned players (not those away too long), newest first: `{ "player_id", "name", "avatar", "reason", "invited" }`; `reason` is `"kicked"` or `"banned"`, and `invited` is true once the host has invited them back. `[]` for solo wheels. |

The server remembers why a player was removed (`kicked`, `banned`, or `timed_out` after 10 minutes away), and each request to join, keyed by the hash of the key the browser holds. Leaving on your own records nothing. A closed controller link forgets its removals and requests.

**Requests.** A request is made by a kicked player asking to come back, a timed-out player when the game needs the host's OK, or a newcomer to an `"ask"` game. The host accepts or declines; an accepted player then confirms (they may have changed their mind) and joins with the ID, name and avatar of the request, whatever the game's setting. An empty game lets the next person in (they become host), whatever its setting.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/games/{id}/players` | `{ "name", "avatar" }` | 201 `{ "requested", "player_id", "player_token", "state" }`. `requested: true` in an `"ask"` game: keep the key and confirm once accepted. Sends the browser's old key: a kicked key gets 403 `kicked` (use rejoin), a banned one 403 `banned`. | 409 `game_closed`, as before |
| DELETE | `/api/games/{id}/players/{player_id}?ban=true` | none | As before; without `ban` the player is **kicked**, with it **banned** (that browser can't come back). Deleting a player's name kicks them. | as before |
| GET | `/api/games/{id}/players/me` | none | 200 `{ "status", "request", "invited" }`: `status` is `player`, `kicked`, `banned`, `timed_out` or `none`; `request` is `pending`, `accepted`, `declined` or null; `invited` is true when the accepted request is the host's invitation | 404 |
| POST | `/api/games/{id}/rejoin` | none | 200 `{ "rejoined", "request", "state" }`: timed out from an `"open"` game goes straight back in; otherwise a request is made (`request: "pending"`; asking twice is fine) | 403 `banned`, 403 `not_a_player`, 409 `request_declined`, 409 `game_closed`, 409 `entries_limit`, 409 `spin_in_progress` |
| POST | `/api/games/{id}/join-requests/{player_id}/accept` or `/decline` | none | 200 `PublicGameState` (host only) | 403 `not_host`, 404 `request_not_found`, 422 |
| POST | `/api/games/{id}/removed/{player_id}/invite` | none | 200 `PublicGameState` (host only): invites a kicked or banned player back. A ban is lifted, and they get an accepted request, so they join by confirming it. | 403 `not_host`, 404 `player_not_found`, 409 `not_multiplayer`, 422 |
| POST | `/api/games/{id}/removed/{player_id}/unban` | none | 200 `PublicGameState` (host only): lifts a ban; that browser is a stranger again and can join (or ask) normally | 403 `not_host`, 404 `player_not_found` (not banned), 409 `not_multiplayer`, 422 |
| POST | `/api/games/{id}/join-requests/me/confirm` | none | 200 `PublicGameState`: an accepted request joins | 404 `request_not_found`, 409 `request_not_accepted`, 409 `entries_limit` |
| DELETE | `/api/games/{id}/join-requests/me` | none | 200 `PublicGameState`: withdraw a request ("No thanks"), or acknowledge a "no" | 404 `request_not_found` |
| PATCH | `/api/games/{id}/settings` | `{ "remove_winner"?, "join_policy"? }` | Both optional now (at least one); `join_policy` is multiplayer only and host only | 409 `not_multiplayer`, 422 |

A ban is per browser: a private window or another device isn't recognised.

New error codes: `kicked` (403), `banned` (403), `game_closed` (409), `request_declined` (409), `request_not_accepted` (409), `request_not_found` (404).

## v1.5: controller logins that last

A controller login now lasts until it has gone **60 days unused**, and at most **1 year** after logging in. Logins are stored in the database, so a restart or deploy no longer logs the admin out. The `admin_session` cookie's `Max-Age` is one year; the server ends the session sooner when it goes unused. Only an HMAC of the token is stored, keyed with `ADMIN_PASSWORD`, so changing the password ends every session.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/admin/sessions` | none | 200 `{ "sessions": [{ "id", "device", "created_at", "last_used_at", "expires_at", "current" }] }`, most recently used first. `device` is a label from the user agent, such as `"iPhone · Home Screen app"`; `current` marks the session making the request. | 401 |
| DELETE | `/api/admin/sessions/{id}` | none | 204: signs out that device (this one too, if it's this device's ID) | 401, 404 `session_not_found` |
| POST | `/api/admin/sessions/sign-out-others` | none | 204: signs out every device except this one | 401 |

New error code: `session_not_found` (404).

**Home Screen web app.** `/admin/manifest.webmanifest` and the icons in `/admin/` let the controller be added to a phone's Home Screen as "LDYF Controller". Only the admin code links to them.

## v1.6: the rule engine

Controller links have three more rule settings. All are admin only: public state and player sockets never contain them, and changing them sends nothing to players.

| Field | Value |
|---|---|
| `chance` | `"always"` only: the target wins this % of spins (1–100) and someone else wins the rest. `null` (the default): every spin. Below a fair share makes the target win less often than chance would. |
| `max_streak` | The streak breaker, `"always"` only (1–20): once the target has won this many spins in a row, spins are fair until someone else wins. `null` (the default): off. |
| `script` | Upcoming winners, first one next (up to 20 names, each up to 40 characters). Its first step decides the next spin if that name is on the wheel (matched like targets), and is then used up. If the name isn't on the wheel, the step waits and the rule decides meanwhile. The script ignores the streak breaker. |

`PATCH /api/admin/links/{id}` accepts `chance`, `max_streak` and `script` (`null` clears `chance` and `max_streak`). `LinkSummary` includes all three.

`rule_status` has three more fields:
- `script_step`: `{ "name", "entry_ids" }` for the script's first step (empty `entry_ids`: it waits for that name), or `null`.
- `streak`: how many spins in a row the `"always"` target has won.
- `decider`: what decides the next spin, `"script"`, `"rule"` or `"fair"`.

`state` can also be `"streak_paused"`. `rule_applied` in the spin history is true when the script or the rule decided the spin.

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/admin/links/all-fair` | none | 200 `{ "changed" }`: the panic button. Every link goes back to `"fair"` and its script is cleared; targets, `chance` and `max_streak` are kept. | 401 |
