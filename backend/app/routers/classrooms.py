from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import ClassroomOut, PinVerifyIn, PinVerifyOut
from ..services import classroom_service

router = APIRouter(prefix="/api/classrooms", tags=["classrooms"])


@router.get("", response_model=list[ClassroomOut])
def list_classrooms(db: Session = Depends(get_db)):
    return classroom_service.list_classrooms(db)


@router.post("/{classroom_id}/verify-pin", response_model=PinVerifyOut)
def verify_pin(classroom_id: int, payload: PinVerifyIn, db: Session = Depends(get_db)):
    classroom = classroom_service.get_classroom(db, classroom_id)
    if classroom is None:
        raise HTTPException(status_code=404, detail="Classroom not found.")
    try:
        token = classroom_service.authenticate(classroom, payload.pin)
    except classroom_service.PinLockedError:
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect attempts. Wait a few minutes and ask your teacher for the PIN.",
        )
    except classroom_service.InvalidPinError:
        raise HTTPException(status_code=401, detail="Incorrect PIN. Try again.")
    return {"token": token, "classroom": classroom}
