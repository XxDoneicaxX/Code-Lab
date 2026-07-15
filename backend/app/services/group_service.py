from sqlalchemy.orm import Session

from .. import models
from . import project_service


class GroupNotFoundError(Exception):
    pass


class GroupAccessDeniedError(Exception):
    pass


def _get_owned_group(db: Session, group_id: int, classroom_id: int) -> models.Group:
    group = db.get(models.Group, group_id)
    if group is None:
        raise GroupNotFoundError
    if group.classroom_id != classroom_id:
        raise GroupAccessDeniedError
    return group


def list_groups(db: Session, classroom_id: int, kind: str) -> list[models.Group]:
    return (
        db.query(models.Group)
        .filter(models.Group.classroom_id == classroom_id, models.Group.kind == kind)
        .order_by(models.Group.created_at)
        .all()
    )


def create_group(db: Session, classroom_id: int, name: str, kind: str) -> models.Group:
    """Create a group and its one persistent (blank) project together."""
    group = models.Group(classroom_id=classroom_id, name=name, kind=kind)
    db.add(group)
    db.flush()  # assigns group.id, needed by get_or_create_project below
    project_service.get_or_create_project(db, group)
    db.refresh(group)
    return group


def rename_group(db: Session, group_id: int, classroom_id: int, name: str) -> models.Group:
    group = _get_owned_group(db, group_id, classroom_id)
    group.name = name
    db.commit()
    db.refresh(group)
    return group


def delete_group(db: Session, group_id: int, classroom_id: int) -> None:
    group = _get_owned_group(db, group_id, classroom_id)
    db.delete(group)  # cascades to the group's project
    db.commit()
