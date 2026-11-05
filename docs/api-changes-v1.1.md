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
