from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_classroom_id
from ..schemas import ProjectSaveIn, ProjectSaveOut, WorkspaceOut
from ..services import project_service

router = APIRouter(prefix="/api/groups", tags=["projects"])


def _authorized_group(db: Session, group_id: int, classroom_id: int) -> models.Group:
    group = project_service.get_group(db, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found.")
    if group.classroom_id != classroom_id:
        raise HTTPException(
            status_code=403, detail="This group belongs to a different classroom."
        )
    return group


@router.get("/{group_id}/project", response_model=WorkspaceOut)
def get_workspace(
    group_id: int,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    group = _authorized_group(db, group_id, classroom_id)
    project = project_service.get_or_create_project(db, group)
    return {"classroom": group.classroom, "group": group, "project": project}


@router.put("/{group_id}/project", response_model=ProjectSaveOut)
def save_project(
    group_id: int,
    payload: ProjectSaveIn,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    group = _authorized_group(db, group_id, classroom_id)
    project = project_service.get_or_create_project(db, group)
    project = project_service.save_code(db, project, payload.code)
    return {"updated_at": project.updated_at}
