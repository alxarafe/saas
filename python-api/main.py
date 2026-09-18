from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import os
import time
import jwt
import json
import psycopg
from psycopg.errors import UniqueViolation

VALID_EMAIL = "admin@example.com"
VALID_PASSWORD = "secret"
JWT_SECRET = "secret"

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "postgres"),
    "port": os.environ.get("DB_PORT", "5432"),
    "user": os.environ.get("DB_USER", "saas"),
    "password": os.environ.get("DB_PASSWORD", "saas"),
    "dbname": os.environ.get("DB_NAME", "saas"),
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""

async def open_conn():
    return await psycopg.AsyncConnection.connect(**DB_CONFIG, autocommit=True)

@asynccontextmanager
async def lifespan(app):
    conn = await open_conn()
    try:
        async with conn.transaction():
            await conn.execute(SCHEMA)
    finally:
        await conn.close()
    yield

app = FastAPI(lifespan=lifespan)

def error_response(status, code, details=None):
    body = {"error": {"code": code}}
    if details is not None:
        body["error"]["details"] = details
    return JSONResponse(status_code=status, content=body)

async def parse_json_body(request: Request):
    raw = await request.body()
    if not raw.strip():
        return None, error_response(400, "bad_request")
    try:
        body = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, error_response(400, "bad_request")
    if not isinstance(body, dict):
        return None, error_response(400, "bad_request")
    return body, None

@app.get("/health")
def health():
    return {"status": "ok"}

def validation_details(body, fields):
    details = []
    for field in fields:
        value = body.get(field)
        if value is None or (isinstance(value, str) and value == ""):
            details.append({"field": field, "code": "required"})
        elif not isinstance(value, str):
            details.append({"field": field, "code": "invalid_type"})
    return details

@app.post("/auth/login")
async def login(request: Request):
    body, err = await parse_json_body(request)
    if err:
        return err

    details = validation_details(body, ("email", "password"))
    if details:
        return error_response(422, "validation_error", details)

    if body.get("email") != VALID_EMAIL or body.get("password") != VALID_PASSWORD:
        return error_response(401, "invalid_credentials")

    now = int(time.time())
    token = jwt.encode(
        {"sub": "1", "email": VALID_EMAIL, "iat": now, "exp": now + 3600},
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"data": {"token": token}}

@app.get("/me")
async def me(request: Request):
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return error_response(401, "missing_token")

    token = auth.removeprefix("Bearer ")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return error_response(401, "invalid_token")

    return {
        "data": {
            "id": int(payload["sub"]),
            "email": payload["email"],
        }
    }

def validate_bulk_payload(body):
    if "data" not in body or not isinstance(body["data"], list):
        return None, error_response(
            422, "validation_error",
            [{"field": "data", "code": "invalid_type"}],
        )
    details = []
    users = []
    for i, item in enumerate(body["data"]):
        if not isinstance(item, dict):
            details.append({"field": f"data[{i}]", "code": "invalid_type"})
            continue
        users.append(item)
        for field in ("email", "password_hash"):
            value = item.get(field)
            if value is None or (isinstance(value, str) and value == ""):
                details.append({"field": f"data[{i}].{field}", "code": "required"})
            elif not isinstance(value, str):
                details.append({"field": f"data[{i}].{field}", "code": "invalid_type"})
    if details:
        return None, error_response(422, "validation_error", details)
    if not users:
        return None, error_response(
            422, "validation_error",
            [{"field": "data", "code": "required"}],
        )
    return users, None

@app.post("/users/bulk")
async def create_users_bulk(request: Request):
    body, err = await parse_json_body(request)
    if err:
        return err

    users, err = validate_bulk_payload(body)
    if err:
        return err

    conn = await open_conn()
    try:
        async with conn.transaction():
            created = []
            for user in users:
                cur = await conn.execute(
                    "INSERT INTO users (email, password_hash) VALUES (%s, %s) "
                    "RETURNING id, email, created_at",
                    (user["email"], user["password_hash"]),
                )
                row = await cur.fetchone()
                created.append({
                    "id": row[0],
                    "email": row[1],
                    "created_at": row[2].isoformat(),
                })
    except UniqueViolation:
        return error_response(409, "conflict")
    except psycopg.Error:
        return error_response(500, "internal_error")
    finally:
        await conn.close()

    return JSONResponse(status_code=201, content={"data": created})

@app.get("/users")
async def list_users(request: Request):
    try:
        limit = int(request.query_params.get("limit", "20"))
        offset = int(request.query_params.get("offset", "0"))
    except ValueError:
        return error_response(
            422, "validation_error",
            [{"field": "limit", "code": "invalid_type"}],
        )
    if limit < 1 or limit > 100:
        return error_response(
            422, "validation_error",
            [{"field": "limit", "code": "invalid_type"}],
        )
    if offset < 0:
        return error_response(
            422, "validation_error",
            [{"field": "offset", "code": "invalid_type"}],
        )

    conn = await open_conn()
    try:
        cur = await conn.execute("SELECT COUNT(*) FROM users")
        total = (await cur.fetchone())[0]
        cur = await conn.execute(
            "SELECT id, email, created_at FROM users ORDER BY id LIMIT %s OFFSET %s",
            (limit, offset),
        )
        rows = await cur.fetchall()
    except psycopg.Error:
        return error_response(500, "internal_error")
    finally:
        await conn.close()

    return {
        "data": [
            {"id": r[0], "email": r[1], "created_at": r[2].isoformat()}
            for r in rows
        ],
        "pagination": {"limit": limit, "offset": offset, "total": total},
    }

@app.exception_handler(404)
async def not_found(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": {"code": "endpoint_not_found"}},
    )
