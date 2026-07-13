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
    __tablename__ = "groups"
    __table_args__ = (UniqueConstraint("classroom_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    classroom_id: Mapped[int] = mapped_column(ForeignKey("classrooms.id"))
    name: Mapped[str] = mapped_column(String(80))
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
    code: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    group: Mapped[Group] = relationship(back_populates="project")
