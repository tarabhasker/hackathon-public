"""Minimal account auth: salted PBKDF2 password hashes + HMAC-signed bearer tokens.

Stdlib only. Tokens are `<user_id>.<expiry>.<signature>`, signed with SECRET_KEY
(set it in backend/.env for anything beyond local dev).
"""
import hashlib
import hmac
import os
import secrets
import time

SECRET = os.environ.get("SECRET_KEY", "dev-only-secret-change-me").encode()
TOKEN_TTL = 7 * 24 * 3600
ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
        )
    except ValueError:
        return False
    return hmac.compare_digest(candidate.hex(), digest)


def _sign(payload: str) -> str:
    return hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()


def make_token(user_id: int) -> str:
    payload = f"{user_id}.{int(time.time()) + TOKEN_TTL}"
    return f"{payload}.{_sign(payload)}"


def read_token(token: str) -> int | None:
    """The user id a valid, unexpired token was issued for, else None."""
    try:
        user_id, expiry, signature = token.split(".")
        payload = f"{user_id}.{expiry}"
        if not hmac.compare_digest(signature, _sign(payload)):
            return None
        if int(expiry) < time.time():
            return None
        return int(user_id)
    except ValueError:
        return None
