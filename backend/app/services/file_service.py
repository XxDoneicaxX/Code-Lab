import re
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from .project_service import DEFAULT_CODE

_ALLOWED_ASSET_EXTENSIONS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
}

_NAME_PATTERN = re.compile(r"^[^/\\]+$")  # no path separators — one segment only


class FileNotFoundInProjectError(Exception):
    pass


class InvalidNameError(Exception):
    pass


class NotADirectoryError_(Exception):
    """Distinct name to avoid shadowing the builtin NotADirectoryError."""


class NotAFileError(Exception):
    pass


class InvalidMoveError(Exception):
    pass


class UnsupportedAssetTypeError(Exception):
    pass


class AssetTooLargeError(Exception):
    pass


def validate_name(name: str) -> str:
    name = name.strip()
    if not name or name in (".", "..") or not _NAME_PATTERN.match(name):
        raise InvalidNameError("Names can't be blank or contain / or \\.")
    if len(name) > 255:
        raise InvalidNameError("That name is too long.")
    return name


def _uploads_dir_for(project_id: int) -> Path:
    path = Path(settings.uploads_dir) / str(project_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_or_create_root(db: Session, project: models.Project) -> models.ProjectFile:
    """Every project has exactly one root directory node. Created lazily,
    seeded with main.py (migrated from the legacy Project.code on an
    existing project, or a starter template on a brand new one) and an
    empty assets/ folder."""
    root = (
        db.query(models.ProjectFile)
        .filter(models.ProjectFile.project_id == project.id, models.ProjectFile.parent_id.is_(None))
        .first()
    )
    if root is not None:
        return root

    root = models.ProjectFile(project_id=project.id, parent_id=None, name="", is_directory=True)
    db.add(root)
    db.flush()  # assigns root.id for the children's parent_id

    db.add(
        models.ProjectFile(
            project_id=project.id,
            parent_id=root.id,
            name="main.py",
            is_directory=False,
            content=project.code or DEFAULT_CODE,
        )
    )
    db.add(
        models.ProjectFile(
            project_id=project.id, parent_id=root.id, name="assets", is_directory=True
        )
    )
    db.commit()
    db.refresh(root)
    return root


def list_tree(db: Session, project: models.Project) -> list[models.ProjectFile]:
    """Flat list of every node except the invisible root — the frontend
    reconstructs the tree from each node's parent_id."""
    root = get_or_create_root(db, project)
    return (
        db.query(models.ProjectFile)
        .filter(models.ProjectFile.project_id == project.id, models.ProjectFile.id != root.id)
        .order_by(models.ProjectFile.is_directory.desc(), models.ProjectFile.name)
        .all()
    )


def get_node(db: Session, file_id: int, project_id: int) -> models.ProjectFile:
    node = db.get(models.ProjectFile, file_id)
    if node is None or node.project_id != project_id:
        raise FileNotFoundInProjectError
    return node


def _get_parent_dir(db: Session, project: models.Project, parent_id: int | None) -> models.ProjectFile:
    if parent_id is None:
        return get_or_create_root(db, project)
    parent = get_node(db, parent_id, project.id)
    if not parent.is_directory:
        raise NotADirectoryError_("That's not a folder.")
    return parent


def create_node(
    db: Session,
    project: models.Project,
    parent_id: int | None,
    name: str,
    is_directory: bool,
) -> models.ProjectFile:
    name = validate_name(name)
    parent = _get_parent_dir(db, project, parent_id)
    node = models.ProjectFile(
        project_id=project.id,
        parent_id=parent.id,
        name=name,
        is_directory=is_directory,
        content=None if is_directory else "",
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


def rename_node(db: Session, node: models.ProjectFile, name: str) -> models.ProjectFile:
    node.name = validate_name(name)
    db.commit()
    db.refresh(node)
    return node


def move_node(
    db: Session, project: models.Project, node: models.ProjectFile, new_parent_id: int | None
) -> models.ProjectFile:
    if node.parent_id is None:
        raise InvalidMoveError("The project root can't be moved.")
    target = _get_parent_dir(db, project, new_parent_id)

    if target.id == node.id:
        raise InvalidMoveError("Can't move a folder into itself.")
    ancestor = target
    while ancestor.parent_id is not None:
        ancestor = get_node(db, ancestor.parent_id, project.id)
        if ancestor.id == node.id:
            raise InvalidMoveError("Can't move a folder into one of its own subfolders.")

    node.parent_id = target.id
    db.commit()
    db.refresh(node)
    return node


def _collect_asset_disk_paths(node: models.ProjectFile, project_id: int) -> list[Path]:
    paths = []
    if node.disk_filename:
        paths.append(_uploads_dir_for(project_id) / node.disk_filename)
    for child in node.children:
        paths.extend(_collect_asset_disk_paths(child, project_id))
    return paths


def delete_node(db: Session, node: models.ProjectFile) -> None:
    if node.parent_id is None:
        raise InvalidNameError("The project root can't be deleted.")
    disk_paths = _collect_asset_disk_paths(node, node.project_id)
    db.delete(node)  # cascades to children rows
    db.commit()
    for path in disk_paths:
        path.unlink(missing_ok=True)


def save_content(db: Session, node: models.ProjectFile, content: str) -> models.ProjectFile:
    if node.is_directory or node.is_asset:
        raise NotAFileError("Only text files can be edited and saved.")
    node.content = content
    db.commit()
    db.refresh(node)
    return node


def save_asset(
    db: Session,
    project: models.Project,
    parent_id: int | None,
    filename: str,
    data: bytes,
) -> models.ProjectFile:
    name = validate_name(filename)
    extension = Path(name).suffix.lower()
    content_type = _ALLOWED_ASSET_EXTENSIONS.get(extension)
    if content_type is None:
        raise UnsupportedAssetTypeError(
            "Only PNG, JPG, WEBP, WAV, and MP3 files can be uploaded."
        )
    if len(data) > settings.max_asset_bytes:
        raise AssetTooLargeError(
            f"That file is larger than the {settings.max_asset_bytes // (1024 * 1024)} MB limit."
        )
    parent = _get_parent_dir(db, project, parent_id)

    disk_filename = f"{uuid.uuid4().hex}{extension}"
    (_uploads_dir_for(project.id) / disk_filename).write_bytes(data)

    node = models.ProjectFile(
        project_id=project.id,
        parent_id=parent.id,
        name=name,
        is_directory=False,
        content_type=content_type,
        size_bytes=len(data),
        disk_filename=disk_filename,
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


def get_asset_path(node: models.ProjectFile) -> Path:
    return _uploads_dir_for(node.project_id) / node.disk_filename


def backfill_project_files(db: Session) -> None:
    """One-time data migration: give every pre-existing Project (whose code
    lived in Project.code) a proper file tree, without losing that code."""
    for project in db.query(models.Project).all():
        get_or_create_root(db, project)
