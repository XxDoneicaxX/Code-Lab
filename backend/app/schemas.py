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
    pass


class GroupRenameIn(_GroupNameIn):
    pass


class PinVerifyIn(BaseModel):
    pin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class PinVerifyOut(BaseModel):
    token: str
    classroom: ClassroomOut


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    group_id: int
    code: str
    created_at: datetime
    updated_at: datetime


class WorkspaceOut(BaseModel):
    classroom: ClassroomOut
    group: GroupOut
    project: ProjectOut


class ProjectSaveIn(BaseModel):
    code: str = Field(max_length=200_000)


class ProjectSaveOut(BaseModel):
    updated_at: datetime
