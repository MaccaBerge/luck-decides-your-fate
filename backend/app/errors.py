"""Uniform error envelope: every non-2xx response is {"error": {"code": ..., "message": ...}}."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def game_not_found() -> ApiError:
    return ApiError(404, "game_not_found", "Game not found")


def entry_not_found() -> ApiError:
    return ApiError(404, "entry_not_found", "Entry not found")


def spin_in_progress() -> ApiError:
    return ApiError(409, "spin_in_progress", "A spin is in progress")


def not_enough_entries() -> ApiError:
    return ApiError(409, "not_enough_entries", "Add at least 2 names to spin the wheel")


def entries_limit() -> ApiError:
    return ApiError(409, "entries_limit", "A wheel can have at most 100 names")


def unauthorized() -> ApiError:
    return ApiError(401, "unauthorized", "Not logged in")


def invalid_password() -> ApiError:
    return ApiError(401, "invalid_password", "Wrong password")


def validation_error(message: str) -> ApiError:
    return ApiError(422, "validation_error", message)


def error_response(status: int, code: str, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )


_HTTP_CODES = {
    400: ("bad_request", "Bad request"),
    401: ("unauthorized", "Not logged in"),
    403: ("forbidden", "Forbidden"),
    404: ("not_found", "Not found"),
    405: ("method_not_allowed", "Method not allowed"),
}


def describe_validation_error(errors: list[dict[str, Any]]) -> str:
    """Turn the first pydantic error into a short human-readable sentence."""
    if not errors:
        return "Invalid request"
    err = errors[0]
    etype = err.get("type", "")
    loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
    msg = str(err.get("msg", "Invalid value"))
    if etype == "json_invalid":
        return "Request body is not valid JSON"
    if etype == "missing" and not loc:
        return "Request body is required"
    if etype == "model_attributes_type" or (etype.endswith("_type") and not loc):
        return "Request body must be a JSON object"
    if msg.startswith("Value error, "):
        msg = msg[len("Value error, "):]
    field = ".".join(loc)
    return f"{field}: {msg}" if field else msg


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(422, "validation_error", describe_validation_error(list(exc.errors())))

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> Any:
        if exc.status_code == 404:
            # SPA fallback for non-API GETs when the built frontend is present.
            from app.routes.static import spa_fallback

            resp = spa_fallback(request)
            if resp is not None:
                return resp
        code, default_msg = _HTTP_CODES.get(exc.status_code, ("http_error", "Request failed"))
        message = default_msg
        if isinstance(exc.detail, str) and exc.detail and exc.status_code not in _HTTP_CODES:
            message = exc.detail
        return error_response(exc.status_code, code, message, headers=getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def _unhandled(_request: Request, _exc: Exception) -> JSONResponse:
        return error_response(500, "internal_error", "Something went wrong")
