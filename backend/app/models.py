from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Classroom(Base):
    __tablename__ = "classrooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    pin_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    groups: Mapped[list["Group"]] = relationship(
        back_populates="classroom", order_by="Group.created_at"
    )


class Group(Base):
    """A saved codespace within a classroom.

    `kind` splits this into two independent sections that never mix:
    "capstone" (teacher-managed team projects) and "in_class" (ad hoc saves
    from the Python Workspace, e.g. one-off exercises)."""

    __tablename__ = "groups"
    __table_args__ = (UniqueConstraint("classroom_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    classroom_id: Mapped[int] = mapped_column(ForeignKey("classrooms.id"))
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(20), default="capstone", server_default="capstone")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    classroom: Mapped[Classroom] = relationship(back_populates="groups")
    # A group's project is deleted along with it (teacher-confirmed deletion).
    project: Mapped["Project | None"] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )

    @property
    def last_saved(self) -> datetime | None:
        return self.project.updated_at if self.project else None


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    # One persistent project per group, enforced by the database.
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), unique=True)
    # Superseded by ProjectFile (a project is now a file tree, not one blob)
    # but left in place rather than dropped: SQLite can't cheaply drop a
    # column, and every existing project's code was migrated into a main.py
    # ProjectFile row by backfill_project_files() — see services/file_service.py.
    code: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    group: Mapped[Group] = relationship(back_populates="project")
    files: Mapped[list["ProjectFile"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectFile(Base):
    """One node (file or folder) in a project's file tree.

    Every project has exactly one root node (`parent_id is None`, a
    directory named ""), created on first access. main.py and an assets/
    folder are seeded as its children. Text file content lives directly in
    `content`; uploaded assets (images/audio) store their bytes on disk
    instead — see file_service.py — with only metadata here.
    """

    __tablename__ = "project_files"
    __table_args__ = (UniqueConstraint("project_id", "parent_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("project_files.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    is_directory: Mapped[bool] = mapped_column(default=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(nullable=True)
    disk_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    project: Mapped[Project] = relationship(back_populates="files")
    parent: Mapped["ProjectFile | None"] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["ProjectFile"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )

    @property
    def is_asset(self) -> bool:
        return self.disk_filename is not None
