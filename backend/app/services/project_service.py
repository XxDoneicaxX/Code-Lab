from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models

DEFAULT_CODE = "# Start coding here\n"


def get_group(db: Session, group_id: int) -> models.Group | None:
    return db.get(models.Group, group_id)


def get_or_create_project(db: Session, group: models.Group) -> models.Project:
    """Return the group's single project, creating it on first open."""
    if group.project is not None:
        return group.project

    project = models.Project(group_id=group.id, code=DEFAULT_CODE)
    db.add(project)
    try:
        db.commit()
    except IntegrityError:
        # Two students opened the workspace at the same moment; the unique
        # constraint on group_id made one insert lose. Use the winner's row.
        db.rollback()
        existing = (
            db.query(models.Project).filter(models.Project.group_id == group.id).one()
        )
        return existing
    db.refresh(project)
    return project
