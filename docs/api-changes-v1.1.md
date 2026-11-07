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
