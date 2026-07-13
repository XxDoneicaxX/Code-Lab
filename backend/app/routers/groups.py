from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_classroom_id
from ..schemas import GroupCreateIn, GroupListOut, GroupOut, GroupRenameIn
from ..services import classroom_service, group_service

router = APIRouter(prefix="/api/groups", tags=["groups"])

_DUPLICATE_NAME_DETAIL = "A group with that name already exists in this classroom."


@router.get("", response_model=GroupListOut)
def list_groups(classroom_id: int = Depends(get_classroom_id), db: Session = Depends(get_db)):
    classroom = classroom_service.get_classroom(db, classroom_id)
    groups = group_service.list_groups(db, classroom_id)
    return {"classroom": classroom, "groups": groups}


@router.post("", response_model=GroupOut, status_code=201)
def create_group(
    payload: GroupCreateIn,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    try:
        return group_service.create_group(db, classroom_id, payload.name)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=_DUPLICATE_NAME_DETAIL)


@router.patch("/{group_id}", response_model=GroupOut)
def rename_group(
    group_id: int,
    payload: GroupRenameIn,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    try:
        return group_service.rename_group(db, group_id, classroom_id, payload.name)
    except group_service.GroupNotFoundError:
        raise HTTPException(status_code=404, detail="Group not found.")
    except group_service.GroupAccessDeniedError:
        raise HTTPException(
            status_code=403, detail="This group belongs to a different classroom."
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=_DUPLICATE_NAME_DETAIL)


@router.delete("/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    try:
        group_service.delete_group(db, group_id, classroom_id)
    except group_service.GroupNotFoundError:
        raise HTTPException(status_code=404, detail="Group not found.")
    except group_service.GroupAccessDeniedError:
        raise HTTPException(
            status_code=403, detail="This group belongs to a different classroom."
        )
