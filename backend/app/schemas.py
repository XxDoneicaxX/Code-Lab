from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClassroomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: str
    last_saved: datetime | None = None


class GroupListOut(BaseModel):
    classroom: ClassroomOut
    groups: list[GroupOut]


class _GroupNameIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Group name cannot be blank.")
        return value


class GroupCreateIn(_GroupNameIn):
    kind: str = Field(default="capstone", pattern=r"^(capstone|in_class)$")


class GroupRenameIn(_GroupNameIn):
    pass


class PinVerifyIn(BaseModel):
    pin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class PinVerifyOut(BaseModel):
    token: str


class FileNodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_id: int | None
    name: str
    is_directory: bool
    content_type: str | None = None
    size_bytes: int | None = None


class FileTreeOut(BaseModel):
    classroom: ClassroomOut
    group: GroupOut
    root_id: int
    files: list[FileNodeOut]


class FileContentOut(BaseModel):
    id: int
    name: str
    content: str


class FileSaveIn(BaseModel):
    content: str = Field(max_length=200_000)


class FileSaveOut(BaseModel):
    updated_at: datetime


class FileCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    is_directory: bool = False
    parent_id: int | None = None


class FileRenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
