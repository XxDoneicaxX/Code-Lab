"""Seed the database with classrooms (no groups — teachers create those).

Usage (from the backend/ directory, venv active):
    python -m app.seed                       # create classrooms if the DB is empty
    python -m app.seed --reset               # wipe everything and re-seed
    python -m app.seed --pin 1111            # use one fixed 4-digit PIN for every classroom
    python -m app.seed --sequential-pins     # Classroom N gets PIN N repeated 4x
                                              # (1111, 2222, ... 9999, and 0000 for Classroom 10)
    python -m app.seed --dev-groups 3        # also add N sample groups to Classroom 1,
                                              # for local UI testing only

Generated PINs are printed once and written to backend/classroom_pins.txt
(gitignored). Keep that file for the teacher — PINs are stored hashed and
cannot be recovered later.

On hosts with no shell access (e.g. AWS App Runner), set AUTO_SEED_ON_BOOT=true
instead — the app seeds itself on first startup and prints the PINs to the
logs. See seed_classrooms() below, called from app.main's lifespan.
"""

import argparse
import secrets

from sqlalchemy.orm import Session

from .config import BACKEND_DIR
from .database import Base, SessionLocal, engine
from .models import Classroom, Group, Project
from .security import hash_pin
from .services.project_service import DEFAULT_CODE

CLASSROOM_COUNT = 10
PINS_FILE = BACKEND_DIR / "classroom_pins.txt"


def generate_pin() -> str:
    return f"{secrets.randbelow(10_000):04d}"


def seed_classrooms(
    db: Session,
    *,
    pin_mode: str = "random",
    fixed_pin: str | None = None,
    dev_groups: int = 0,
) -> list[str] | None:
    """Create the 10 classrooms if the database is empty.

    Returns the "Classroom N: PIN" report lines, or None if classrooms
    already exist (no-op — this is safe to call on every app startup).
    """
    if db.query(Classroom).count() > 0:
        return None

    used_pins: set[str] = set()
    lines = []
    classrooms = []
    for number in range(1, CLASSROOM_COUNT + 1):
        if fixed_pin is not None:
            pin = fixed_pin
        elif pin_mode == "sequential":
            pin = str(number % 10) * 4
        else:
            pin = generate_pin()
            while pin in used_pins:  # unique PINs so classes can't unlock each other
                pin = generate_pin()
            used_pins.add(pin)

        classroom = Classroom(name=f"Classroom {number}", pin_hash=hash_pin(pin))
        db.add(classroom)
        classrooms.append(classroom)
        lines.append(f"{classroom.name}: {pin}")
    db.flush()  # assigns ids, needed if dev_groups adds groups below

    if dev_groups > 0:
        first_classroom = classrooms[0]
        for n in range(1, dev_groups + 1):
            group = Group(classroom_id=first_classroom.id, name=f"Dev Group {n}")
            db.add(group)
            db.flush()
            db.add(Project(group_id=group.id, code=DEFAULT_CODE))

    db.commit()
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop all tables (INCLUDING SAVED PROJECTS) and re-seed.",
    )
    parser.add_argument(
        "--dev-groups",
        type=int,
        default=0,
        metavar="N",
        help="Create N sample groups (with blank projects) in Classroom 1, for local testing only.",
    )
    parser.add_argument(
        "--pin",
        type=str,
        default=None,
        metavar="NNNN",
        help="Use this fixed 4-digit PIN for every classroom instead of random unique ones "
        "(convenient for camp staff, at the cost of classrooms no longer isolating each other).",
    )
    parser.add_argument(
        "--sequential-pins",
        action="store_true",
        help="Classroom N gets PIN N repeated 4 times (1111, 2222, ... 9999, 0000 for "
        "Classroom 10). Easy to remember, at the cost of classroom isolation and being "
        "easy to guess — fine for a low-stakes summer camp.",
    )
    args = parser.parse_args()

    if args.pin is not None and args.sequential_pins:
        parser.error("--pin and --sequential-pins can't be used together.")
    if args.pin is not None and (len(args.pin) != 4 or not args.pin.isdigit()):
        parser.error("--pin must be exactly 4 digits, e.g. --pin 1111")

    if args.reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        lines = seed_classrooms(
            db,
            pin_mode="sequential" if args.sequential_pins else "random",
            fixed_pin=args.pin,
            dev_groups=args.dev_groups,
        )
        if lines is None:
            print("Database already seeded — nothing to do. Use --reset to start over.")
            return

        report = "\n".join(lines)
        PINS_FILE.write_text(report + "\n", encoding="utf-8")
        print(f"Seeded {CLASSROOM_COUNT} classrooms with no groups — teachers create groups.\n")
        print(report)
        if args.dev_groups:
            print(f"\nAdded {args.dev_groups} dev-only groups to Classroom 1.")
        print(f"\nPINs also saved to {PINS_FILE} — keep that file private (it is gitignored).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
