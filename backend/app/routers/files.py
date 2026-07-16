import re

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_classroom_id
from ..schemas import (
    FileContentOut,
    FileCreateIn,
    FileMoveIn,
    FileNodeOut,
    FileRenameIn,
    FileSaveIn,
    FileSaveOut,
    FileTreeOut,
)
from ..services import file_service, project_service

router = APIRouter(prefix="/api/groups", tags=["files"])

_DUPLICATE_NAME_DETAIL = "Something with that name already exists in this folder."


def _authorized_group(db: Session, group_id: int, classroom_id: int) -> models.Group:
    group = project_service.get_group(db, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found.")
    if group.classroom_id != classroom_id:
        raise HTTPException(
            status_code=403, detail="This group belongs to a different classroom."
        )
    return group


def _authorized_project(db: Session, group_id: int, classroom_id: int) -> models.Project:
    group = _authorized_group(db, group_id, classroom_id)
    return project_service.get_or_create_project(db, group)


def _authorized_node(
    db: Session, group_id: int, file_id: int, classroom_id: int
) -> models.ProjectFile:
    project = _authorized_project(db, group_id, classroom_id)
    try:
        return file_service.get_node(db, file_id, project.id)
    except file_service.FileNotFoundInProjectError:
        raise HTTPException(status_code=404, detail="File not found.")


@router.get("/{group_id}/files", response_model=FileTreeOut)
def list_files(
    group_id: int, classroom_id: int = Depends(get_classroom_id), db: Session = Depends(get_db)
):
    group = _authorized_group(db, group_id, classroom_id)
    project = project_service.get_or_create_project(db, group)
    root = file_service.get_or_create_root(db, project)
    files = file_service.list_tree(db, project)
    return {"classroom": group.classroom, "group": group, "root_id": root.id, "files": files}


@router.get("/{group_id}/files/download-all")
def download_all_files(
    group_id: int, classroom_id: int = Depends(get_classroom_id), db: Session = Depends(get_db)
):
    group = _authorized_group(db, group_id, classroom_id)
    project = project_service.get_or_create_project(db, group)
    files = file_service.list_tree(db, project)
    zip_bytes = file_service.build_project_zip(project, files)
    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", group.name).strip("_") or "project"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.zip"'},
    )


@router.get("/{group_id}/files/{file_id}", response_model=FileContentOut)
def get_file_content(
    group_id: int,
    file_id: int,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    node = _authorized_node(db, group_id, file_id, classroom_id)
    if node.is_directory or node.is_asset:
        raise HTTPException(status_code=400, detail="Only text files have editable content.")
    return {"id": node.id, "name": node.name, "content": node.content or ""}


@router.put("/{group_id}/files/{file_id}", response_model=FileSaveOut)
def save_file_content(
    group_id: int,
    file_id: int,
    payload: FileSaveIn,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    node = _authorized_node(db, group_id, file_id, classroom_id)
    try:
        node = file_service.save_content(db, node, payload.content)
    except file_service.NotAFileError as err:
        raise HTTPException(status_code=400, detail=str(err))
    return {"updated_at": node.updated_at}


@router.post("/{group_id}/files", response_model=FileNodeOut, status_code=201)
def create_file(
    group_id: int,
    payload: FileCreateIn,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    project = _authorized_project(db, group_id, classroom_id)
    try:
        return file_service.create_node(
            db, project, payload.parent_id, payload.name, payload.is_directory
        )
    except file_service.InvalidNameError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except file_service.FileNotFoundInProjectError:
        raise HTTPException(status_code=404, detail="Parent folder not found.")
    except file_service.NotADirectoryError_ as err:
        raise HTTPException(status_code=400, detail=str(err))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=_DUPLICATE_NAME_DETAIL)


@router.patch("/{group_id}/files/{file_id}", response_model=FileNodeOut)
def rename_file(
    group_id: int,
    file_id: int,
    payload: FileRenameIn,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    node = _authorized_node(db, group_id, file_id, classroom_id)
    try:
        node = file_service.rename_node(db, node, payload.name)
    except file_service.InvalidNameError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=_DUPLICATE_NAME_DETAIL)
    return node


@router.patch("/{group_id}/files/{file_id}/move", response_model=FileNodeOut)
def move_file(
    group_id: int,
    file_id: int,
    payload: FileMoveIn,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    project = _authorized_project(db, group_id, classroom_id)
    node = _authorized_node(db, group_id, file_id, classroom_id)
    try:
        return file_service.move_node(db, project, node, payload.parent_id)
    except file_service.FileNotFoundInProjectError:
        raise HTTPException(status_code=404, detail="Destination folder not found.")
    except file_service.NotADirectoryError_ as err:
        raise HTTPException(status_code=400, detail=str(err))
    except file_service.InvalidMoveError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=_DUPLICATE_NAME_DETAIL)


@router.delete("/{group_id}/files/{file_id}", status_code=204)
def delete_file(
    group_id: int,
    file_id: int,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    node = _authorized_node(db, group_id, file_id, classroom_id)
    try:
        file_service.delete_node(db, node)
    except file_service.InvalidNameError as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.post("/{group_id}/files/upload", response_model=FileNodeOut, status_code=201)
async def upload_asset(
    group_id: int,
    file: UploadFile,
    parent_id: int | None = Form(default=None),
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    project = _authorized_project(db, group_id, classroom_id)
    data = await file.read()
    try:
        return file_service.save_asset(db, project, parent_id, file.filename or "upload", data)
    except file_service.InvalidNameError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except file_service.FileNotFoundInProjectError:
        raise HTTPException(status_code=404, detail="Parent folder not found.")
    except file_service.NotADirectoryError_ as err:
        raise HTTPException(status_code=400, detail=str(err))
    except file_service.UnsupportedAssetTypeError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except file_service.AssetTooLargeError as err:
        raise HTTPException(status_code=413, detail=str(err))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=_DUPLICATE_NAME_DETAIL)


@router.get("/{group_id}/files/{file_id}/raw")
def get_asset_raw(
    group_id: int,
    file_id: int,
    classroom_id: int = Depends(get_classroom_id),
    db: Session = Depends(get_db),
):
    node = _authorized_node(db, group_id, file_id, classroom_id)
    if not node.is_asset:
        raise HTTPException(status_code=400, detail="Only uploaded assets can be downloaded raw.")
    path = file_service.get_asset_path(node)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Asset file is missing on the server.")
    return Response(content=path.read_bytes(), media_type=node.content_type)
