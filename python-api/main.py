from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import jwt

app = FastAPI()

VALID_EMAIL = "admin@example.com"
VALID_PASSWORD = "secret"
JWT_SECRET = "secret"

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/auth/login")
async def login(request: Request):
    body = await request.json()
    if body.get("email") != VALID_EMAIL or body.get("password") != VALID_PASSWORD:
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "invalid_credentials"}},
        )

    token = jwt.encode(
        {"sub": "1", "email": VALID_EMAIL},
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"data": {"token": token}}

@app.get("/me")
async def me(request: Request):
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "missing_token"}},
        )

    token = auth.removeprefix("Bearer ")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return JSONResponse(
            status_code=401,
            content={"error": {"code": "invalid_token"}},
        )

    return {
        "data": {
            "id": int(payload["sub"]),
            "email": payload["email"],
        }
    }

@app.exception_handler(404)
async def not_found(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": {"code": "endpoint_not_found"}},
    )
