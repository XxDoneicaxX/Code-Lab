from sqlalchemy.orm import Session

from .. import models, security


class InvalidPinError(Exception):
    pass


class PinLockedError(Exception):
    pass


def list_classrooms(db: Session) -> list[models.Classroom]:
    return db.query(models.Classroom).order_by(models.Classroom.id).all()


def get_classroom(db: Session, classroom_id: int) -> models.Classroom | None:
    return db.get(models.Classroom, classroom_id)


def authenticate(classroom: models.Classroom, pin: str) -> str:
    """Verify the PIN and return a session token.

    Raises PinLockedError when the classroom has had too many recent failures,
    InvalidPinError when the PIN is wrong.
    """
    if security.pin_attempts_blocked(classroom.id):
        raise PinLockedError
    if not security.verify_pin(pin, classroom.pin_hash):
        security.record_failed_pin_attempt(classroom.id)
        raise InvalidPinError
    return security.create_classroom_token(classroom.id)
