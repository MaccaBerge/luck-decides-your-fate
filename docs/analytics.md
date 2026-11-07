# Analytics

The admin-only statistics page is at `/admin/analytics` (the "Analytics" button on the dashboard). It reads `GET /api/admin/analytics?days=7|30|90`, which needs the admin cookie.

Statistics are designed to be easy to add and remove:

- **Adding one** means writing one async function in `backend/app/analytics/metrics/` and decorating it with `@metric(...)`. You don't need a new endpoint, model or frontend change.
- **Removing one** means deleting its function, decorator included. Nothing else refers to it.
- The page draws whatever the endpoint returns, by `kind`. Only a brand-new kind needs frontend work (`frontend/src/admin/analytics/renderers.tsx`).

## How it fits together

| Piece | File |
|---|---|
| `@metric` decorator, `Section`, `MetricContext`, shape checks | `backend/app/analytics/registry.py` |
| One module per section; the package `__init__` imports them all | `backend/app/analytics/metrics/` |
| `scalar(sql, ...)` and `rows(sql, ...)` read-only query helpers | `backend/app/analytics/query.py` |
| Runs every metric and builds the response | `backend/app/analytics/report.py` |
| Response models (`AnalyticsReport` and the four data shapes) | `backend/app/models.py` |
| The page, and one renderer per kind | `frontend/src/admin/analytics/` |

Metrics show in registration order: sections in the order their modules are imported in `metrics/__init__.py`, and metrics in the order they appear in each module. Registering the same `id` twice fails at import time, so the app won't start.

## Kinds

Each function returns a dict in the shape for its kind. The server checks the shape, and a wrong shape shows as an error on that one metric.

| Kind | Returns | Drawn as |
|---|---|---|
| `number` | `{"value": int or float, "hint": str or None}` (`hint` is optional) | a big number with a small line under it |
| `series` | `{"points": [{"day": "YYYY-MM-DD", "value": int}]}`, exactly one point per day in the range, oldest first. Use `ctx.fill_days(counts)` to build it, which adds the zeros. | a bar chart with the total and UTC day labels |
| `breakdown` | `{"items": [{"label": str, "value": int}]}` | horizontal bars |
| `table` | `{"columns": [str], "rows": [[str or int]]}` | a table that scrolls sideways on small screens |

## What a metric function gets

`MetricContext` has:

- `ctx.app`: the `AppContext`, for live state such as `ctx.app.manager.live_games()`.
- `ctx.days`: the selected range (7, 30 or 90).
- `ctx.now`: the current time (UTC).
- `ctx.since`: the start of the range as a database timestamp, for `WHERE started_at >= ?`. The range is `days` whole UTC days ending today, so 7 days means today and the 6 days before it.
- `ctx.day_list()` and `ctx.fill_days(counts)`, for series.

If a function raises, only that metric shows an error. The response and the log show just the exception's class name, such as `KeyError`, and never its message.

## Example: adding a statistic

This adds a "Link spins per day" bar chart to the "Your links" section. Add it to the bottom of `backend/app/analytics/metrics/links.py`:

```python
@metric(
    id="link_spins_per_day",
    title="Link spins per day",
    description="Finished spins on your links each day.",
    section=SECTION,
    kind="series",
)
async def link_spins_per_day(ctx: MetricContext) -> dict:
    counts = dict(await rows(
        "SELECT substr(spins.started_at, 1, 10), COUNT(*) FROM spins"
        " JOIN games ON games.id = spins.game_id"
        " WHERE games.origin = 'admin_link' AND spins.finished_at IS NOT NULL"
        " AND spins.started_at >= ? GROUP BY 1",
        ctx.since,
    ))
    return ctx.fill_days(counts)
```

Then restart the backend and reload the page. The chart appears with the other link metrics. The `id` must be unique, and it becomes `data-testid="metric-link_spins_per_day"` on the page.

To add it to a new section instead, create a module such as `metrics/lists.py` with its own `SECTION = Section("lists", "Lists")`, and add it to the import line in `metrics/__init__.py`. That import's position sets where the section appears.

Add a test for the new metric next to the others in `backend/tests/server/test_analytics.py`, and update the expected layout in `test_default_registry_has_the_starting_metrics_in_order` (`backend/tests/core/test_analytics_registry.py`).

## Example: removing a statistic

To remove "Names per wheel", delete the `avg_names` function and its `@metric(...)` decorator from `metrics/wheels.py`, then remove `"avg_names"` from the layout test and delete its assertions. Nothing else refers to it. If you remove a section's last metric, the section disappears from the page too. You can then delete its module and its entry in `metrics/__init__.py`.

## Rules

- **Admin only.** Never import from `app.analytics` in public routes, serializers or player sockets. Analytics may show rule information, such as how often a rule decided a spin, but only here.
- **Numbers, not people.** Count what the site already stores. Don't add visitor tracking: no cookies, IP addresses, user agents, page-view logging or third-party services. A statistic that needs the browser to report events counts as visitor tracking, so the privacy page has to change first.
- **Deleted wheels.** Ordinary wheels and their names and spins are deleted after `GAME_TTL_DAYS` without activity, so statistics read from those tables only cover wheels still stored. Say so in the metric's `description`. Admin links are never deleted automatically, so their history is complete.
- **Days are UTC**, and charts label them so.
