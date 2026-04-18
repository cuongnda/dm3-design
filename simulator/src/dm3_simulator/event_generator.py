"""Random event generation for testing."""

from __future__ import annotations

import hashlib
import random
import uuid
from typing import Any

# Vietnamese names for mock data
VIETNAMESE_LAST_NAMES = [
    "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ",
    "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý",
]
VIETNAMESE_MIDDLE_NAMES = [
    "Văn", "Thị", "Hoàng", "Minh", "Thanh", "Quốc", "Đức", "Hữu",
    "Ngọc", "Tuấn", "Anh", "Phương", "Bảo", "Quang",
]
VIETNAMESE_FIRST_NAMES = [
    "An", "Bình", "Cường", "Dũng", "Hà", "Hải", "Hạnh", "Hiếu", "Hoa",
    "Hùng", "Hương", "Khánh", "Lan", "Linh", "Long", "Mai", "Minh", "Nam",
    "Nga", "Nhân", "Phúc", "Quân", "Sơn", "Tâm", "Thảo", "Thiện",
    "Thúy", "Tiến", "Trung", "Tú", "Tuấn", "Tùng", "Vy",
]


def generate_vietnamese_name() -> str:
    """Generate a random Vietnamese full name."""
    last = random.choice(VIETNAMESE_LAST_NAMES)
    middle = random.choice(VIETNAMESE_MIDDLE_NAMES)
    first = random.choice(VIETNAMESE_FIRST_NAMES)
    return f"{last} {middle} {first}"


def generate_card_uid() -> str:
    """Generate a random card UID (8 hex chars)."""
    return uuid.uuid4().hex[:8].upper()


def generate_face_hash() -> str:
    """Generate a random face template hash."""
    return hashlib.sha256(uuid.uuid4().bytes).hexdigest()[:32]


def generate_pin() -> str:
    """Generate a random 4-6 digit PIN."""
    length = random.choice([4, 6])
    return "".join(str(random.randint(0, 9)) for _ in range(length))


def generate_uhf_uid() -> str:
    """Generate a random UHF RFID tag UID (24 hex chars / 96-bit EPC)."""
    return uuid.uuid4().hex[:24].upper()


def generate_mock_persons(count: int = 50) -> list[dict[str, Any]]:
    """Generate mock person records with credentials.

    Args:
        count: Number of persons to generate.

    Returns:
        List of person dicts with credentials.
    """
    persons = []
    for i in range(count):
        person_id = str(uuid.uuid4())
        name = generate_vietnamese_name()
        credentials = [
            {"id": f"{person_id}-card", "type": "card", "value": generate_card_uid()},
            {"id": f"{person_id}-face", "type": "face", "value": generate_face_hash()},
        ]
        # ~60% of people have a PIN
        if random.random() < 0.6:
            credentials.append(
                {"id": f"{person_id}-pin", "type": "pin", "value": generate_pin()}
            )
        # ~30% of people have a UHF tag (for LPR Desktop / UHF reader scenarios)
        if random.random() < 0.3:
            credentials.append(
                {"id": f"{person_id}-uhf", "type": "uhf", "value": generate_uhf_uid()}
            )

        persons.append({
            "person_id": person_id,
            "name": name,
            "status": "active",
            "valid_from": None,
            "valid_until": None,
            "credentials": credentials,
        })
    return persons


def generate_mock_rules(
    door_ids: list[str], person_ids: list[str], count: int = 5,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Generate mock access rules and person groups.

    Returns:
        Tuple of (rules, groups).
    """
    groups = []
    rules = []

    # Split persons into groups
    chunk_size = max(1, len(person_ids) // count)
    for i in range(count):
        group_id = f"group-{i + 1:03d}"
        start = i * chunk_size
        end = start + chunk_size if i < count - 1 else len(person_ids)
        groups.append({"group_id": group_id, "person_ids": person_ids[start:end]})

    schedules = [
        {"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [1, 2, 3, 4, 5], "start": "07:00", "end": "19:00"}]},
        {"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [1, 2, 3, 4, 5, 6, 7], "start": "00:00", "end": "23:59"}]},
        {"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [1, 2, 3, 4, 5], "start": "08:00", "end": "17:00"}]},
        {"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [6, 7], "start": "09:00", "end": "15:00"}]},
        {"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [1, 2, 3, 4, 5], "start": "18:00", "end": "23:59"}]},
    ]

    for i in range(count):
        rule_doors = door_ids if i == 0 else [random.choice(door_ids)]
        rules.append({
            "rule_id": f"rule-{i + 1:03d}",
            "name": f"Access Rule {i + 1}",
            "door_ids": rule_doors,
            "person_group_ids": [f"group-{i + 1:03d}"],
            "schedule_json": schedules[i % len(schedules)],
            "anti_passback": i == 3,
            "multi_factor": False,
            "priority": (count - i) * 10,
            "enabled": True,
        })

    return rules, groups


def pick_event_type(event_mix: dict[str, int]) -> str:
    """Pick a random event type based on the configured mix."""
    types = list(event_mix.keys())
    weights = list(event_mix.values())
    return random.choices(types, weights=weights, k=1)[0]


DENIAL_REASONS = [
    ("denied_unknown", 40),
    ("denied_time", 25),
    ("denied_expired", 15),
    ("denied_blacklist", 10),
    ("denied_zone", 5),
    ("denied_anti_passback", 3),
    ("denied_lockout", 2),
]


def pick_denial_reason() -> str:
    """Pick a random denial reason based on distribution."""
    reasons, weights = zip(*DENIAL_REASONS)
    return random.choices(reasons, weights=weights, k=1)[0]


ALARM_TYPES = [
    ("forced_entry", 40),
    ("tamper", 25),
    ("door_held_open", 20),
    ("sensor_fault", 10),
    ("communication_lost", 5),
]


def pick_alarm_type() -> str:
    """Pick a random alarm type based on distribution."""
    types, weights = zip(*ALARM_TYPES)
    return random.choices(types, weights=weights, k=1)[0]


DOOR_STATES = [
    ("open", 30),
    ("closed", 30),
    ("held_open", 15),
    ("forced", 10),
    ("tampered", 10),
    ("alarm", 5),
]


def pick_door_state() -> str:
    """Pick a random door state for simulation."""
    states, weights = zip(*DOOR_STATES)
    return random.choices(states, weights=weights, k=1)[0]


def generate_alarm_event(device_id: str, door_id: str, zone_id: str = "zone-001") -> dict[str, Any]:
    """Generate a random alarm event."""
    alarm_type = pick_alarm_type()
    return {
        "type": "alarm.triggered",
        "device_id": device_id,
        "door_id": door_id,
        "alarm_type": alarm_type,
        "zone_id": zone_id,
        "severity": "critical" if alarm_type in ("forced_entry", "tamper") else "warning",
    }


def generate_door_state_event(device_id: str, door_id: str) -> dict[str, Any]:
    """Generate a random door state change event."""
    return {
        "type": "door.state",
        "device_id": device_id,
        "door_id": door_id,
        "state": pick_door_state(),
        "trigger": random.choice(["access_granted", "remote_command", "manual", "timeout", "sensor"]),
    }
