"""PIN hashing, classroom session tokens, and PIN attempt throttling.

Standard library only: PBKDF2 for PIN storage and an HMAC-signed expiring
token for the classroom session. A 4-digit PIN is a low-security credential
by design (camp classrooms, no personal data), so the attempt throttle is
the main brute-force defence.
"""

import base64
import binascii
import hashlib
import hmac
import secrets
import time

from .config import settings

_PBKDF2_ITERATIONS = 100_000

# --- PIN hashing ------------------------------------------------------------


def hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, _PBKDF2_ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, _PBKDF2_ITERATIONS)
    return hmac.compare_digest(digest.hex(), digest_hex)


# --- Classroom session tokens ------------------------------------------------


def _sign(payload: bytes) -> str:
    return hmac.new(settings.secret_key.encode(), payload, hashlib.sha256).hexdigest()


def create_classroom_token(classroom_id: int) -> str:
    expires_at = int(time.time()) + settings.token_ttl_hours * 3600
    payload = f"{classroom_id}:{expires_at}".encode()
    return base64.urlsafe_b64encode(payload).decode() + "." + _sign(payload)


def verify_classroom_token(token: str) -> int | None:
    """Return the classroom id if the token is valid and unexpired, else None."""
    try:
        payload_b64, signature = token.split(".", 1)
        payload = base64.urlsafe_b64decode(payload_b64)
    except (ValueError, binascii.Error):
        return None
    if not hmac.compare_digest(_sign(payload), signature):
        return None
    try:
        classroom_id, expires_at = payload.decode().split(":", 1)
        if int(expires_at) < time.time():
            return None
        return int(classroom_id)
    except (ValueError, UnicodeDecodeError):
        return None


# --- PIN attempt throttling (in-memory, per classroom) ------------------------

_MAX_FAILURES = 8
_WINDOW_SECONDS = 300
_failed_attempts: dict[int, list[float]] = {}


def pin_attempts_blocked(classroom_id: int) -> bool:
    now = time.time()
    recent = [t for t in _failed_attempts.get(classroom_id, []) if now - t < _WINDOW_SECONDS]
    _failed_attempts[classroom_id] = recent
    return len(recent) >= _MAX_FAILURES


def record_failed_pin_attempt(classroom_id: int) -> None:
    _failed_attempts.setdefault(classroom_id, []).append(time.time())
