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

## New endpoints

| Method | Path | Auth | Success |
|---|---|---|---|
| GET | `/api/admin/backup` | admin cookie (otherwise 401 envelope) | 200 `application/vnd.sqlite3`, a consistent database snapshot, with `Content-Disposition: attachment; filename="luckdecidesyourfate-YYYYMMDD-HHMMSS.db"` (UTC) |
| GET | `/robots.txt` | none | 200 `text/plain` |

## v1.2: public game state

`PublicGameState` has a new field, `recent_spins`: up to 10 finished spins, newest first. Each item has exactly `spin_id`, `winner_name` and `finished_at`. A spin in progress is never listed. It appears in REST responses and player `state` events, and in the `game` part of admin state.
