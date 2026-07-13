from fastapi import Header, HTTPException

from .security import verify_classroom_token


def get_classroom_id(x_classroom_token: str | None = Header(default=None)) -> int:
    """Resolve the X-Classroom-Token header to a classroom id, or 401."""
    if not x_classroom_token:
        raise HTTPException(status_code=401, detail="Classroom session required.")
    classroom_id = verify_classroom_token(x_classroom_token)
    if classroom_id is None:
        raise HTTPException(
            status_code=401,
            detail="Your classroom session has expired. Enter the PIN again.",
        )
    return classroom_id
