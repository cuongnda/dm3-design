"""
Test data factories for DM3 automation tests.
Ported from tests/helpers/test-data.ts and extended for Python.
"""
from __future__ import annotations

import random
import string
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any


def _rand_str(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def _rand_int(low: int = 0, high: int = 999) -> int:
    return random.randint(low, high)


# ── Department ────────────────────────────────────────────────


@dataclass
class DepartmentData:
    id: str = ""
    name: str = ""
    number: str = ""
    description: str = ""
    manager_name: str = ""
    user_count: int = 0
    status: str = "active"
    parent_id: str | None = None
    parent_name: str | None = None
    created_at: str = ""
    updated_at: str = ""


def make_department(**overrides: Any) -> dict:
    """Create a department dict with sensible defaults."""
    num = overrides.pop("number", f"DEPT{_rand_int():03d}")
    now = datetime.utcnow().isoformat() + "Z"
    data = {
        "id": overrides.pop("id", f"dept-{_rand_str()}"),
        "name": overrides.pop("name", f"Department {num}"),
        "number": num,
        "description": overrides.pop("description", f"Description for {num}"),
        "manager_name": overrides.pop("manager_name", f"Manager {_rand_int(1, 100)}"),
        "user_count": overrides.pop("user_count", _rand_int(0, 50)),
        "status": overrides.pop("status", "active"),
        "parent_id": overrides.pop("parent_id", None),
        "parent_name": overrides.pop("parent_name", None),
        "created_at": overrides.pop("created_at", now),
        "updated_at": overrides.pop("updated_at", now),
    }
    data.update(overrides)
    return data


def make_department_list(count: int, **overrides: Any) -> list[dict]:
    """Create a list of department dicts."""
    return [
        make_department(
            id=f"dept-{i}",
            number=f"DEPT{i:03d}",
            name=f"Department {i}",
            **overrides,
        )
        for i in range(count)
    ]


def make_hierarchical_departments() -> list[dict]:
    """Create a root + 2 children department tree."""
    root = make_department(id="root-dept", name="Engineering", number="ENG001")
    child_fe = make_department(
        id="child-dept-1",
        name="Frontend Team",
        number="ENG001-FE",
        parent_id="root-dept",
        parent_name="Engineering",
    )
    child_be = make_department(
        id="child-dept-2",
        name="Backend Team",
        number="ENG001-BE",
        parent_id="root-dept",
        parent_name="Engineering",
    )
    return [root, child_fe, child_be]


# ── User ──────────────────────────────────────────────────────


def make_user(**overrides: Any) -> dict:
    """Create a user dict with sensible defaults."""
    first = overrides.pop("first_name", f"First{_rand_int(1, 100)}")
    last = overrides.pop("last_name", f"Last{_rand_int(1, 100)}")
    return {
        "id": overrides.pop("id", f"user-{_rand_str()}"),
        "user_code": overrides.pop("user_code", f"EMP{_rand_int():03d}"),
        "first_name": first,
        "last_name": last,
        "email": overrides.pop("email", f"{first.lower()}.{last.lower()}@company.com"),
        "phone": overrides.pop("phone", f"+1{_rand_int(1000000000, 9999999999)}"),
        "position": overrides.pop("position", "Employee"),
        "status": overrides.pop("status", "active"),
        **overrides,
    }


def make_user_list(count: int, **overrides: Any) -> list[dict]:
    return [
        make_user(
            id=f"user-{i}",
            user_code=f"EMP{i:03d}",
            first_name=f"User{i}",
            last_name="Test",
            **overrides,
        )
        for i in range(count)
    ]


# ── Visitor ───────────────────────────────────────────────────


def make_visitor(**overrides: Any) -> dict:
    """Create a visitor dict."""
    return {
        "id": overrides.pop("id", str(uuid.uuid4())),
        "name": overrides.pop("name", f"Visitor {_rand_str()}"),
        "email": overrides.pop("email", f"visitor.{_rand_str()}@example.com"),
        "phone": overrides.pop("phone", f"+84{_rand_int(100000000, 999999999)}"),
        "company": overrides.pop("company", f"Company {_rand_str()}"),
        **overrides,
    }


def make_visit(**overrides: Any) -> dict:
    """Create a visit dict."""
    arrival = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
    return {
        "visitor_name": overrides.pop("visitor_name", f"Visitor {_rand_str()}"),
        "visitor_email": overrides.pop("visitor_email", f"v.{_rand_str()}@example.com"),
        "host_user_id": overrides.pop("host_user_id", "00000000-0000-0000-0000-0000000000aa"),
        "purpose": overrides.pop("purpose", "meeting"),
        "expected_arrival": overrides.pop("expected_arrival", arrival),
        **overrides,
    }


def make_visit_group(**overrides: Any) -> dict:
    """Create a visit group dict."""
    arrival = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
    return {
        "name": overrides.pop("name", f"Group {_rand_str()}"),
        "host_user_id": overrides.pop("host_user_id", "00000000-0000-0000-0000-0000000000aa"),
        "purpose": overrides.pop("purpose", "meeting"),
        "expected_arrival": overrides.pop("expected_arrival", arrival),
        **overrides,
    }


def make_agreement(**overrides: Any) -> dict:
    """Create an agreement dict."""
    return {
        "name": overrides.pop("name", f"Agreement {_rand_str()}"),
        "content": overrides.pop("content", "This is a test agreement for automation."),
        **overrides,
    }


# ── Paginated API response ────────────────────────────────────


def make_paginated_response(
    data: list[dict],
    page: int = 1,
    limit: int = 20,
    total: int | None = None,
) -> dict:
    """Wrap a list into the standard DM3 paginated envelope."""
    actual_total = total if total is not None else len(data)
    start = (page - 1) * limit
    end = start + limit
    return {
        "data": data[start:end],
        "page": page,
        "limit": limit,
        "total": actual_total,
        "total_pages": max(1, -(-actual_total // limit)),
    }


# ── CSV helpers ───────────────────────────────────────────────


def departments_to_csv(departments: list[dict]) -> str:
    header = "name,number,description,manager_email,parent_number,status"
    rows = [
        f'"{d["name"]}","{d["number"]}","{d.get("description", "")}","manager@company.com","{d.get("parent_name", "")}","{d["status"]}"'
        for d in departments
    ]
    return "\n".join([header, *rows])
