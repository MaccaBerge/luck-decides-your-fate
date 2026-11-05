# API changes in v1.1

Additions to the v1 contract (`docs/plan-v1.md` §8). Nothing from v1 changed shape.

## New error codes

| Code | HTTP | When |
|---|---|---|
| `too_many_attempts` | 429 | Admin login from an IP that has too many recent failures. Includes a `Retry-After` header in whole seconds. |
