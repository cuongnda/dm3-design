"""Access decision engine — the core of the simulator.

All decisions are made locally against the SQLite database.
Target: < 50ms decision time.
"""

from __future__ import annotations

import time
from datetime import datetime

import pytz

from dm3_simulator.database import DeviceDatabase
from dm3_simulator.models import AccessDecision


def evaluate_schedule(schedule_json: dict, now_ms: int) -> bool:
    """Check if current time falls within any schedule period.

    Args:
        schedule_json: Schedule with timezone and periods.
            Example: {"timezone": "Asia/Ho_Chi_Minh", "periods": [{"days": [1,2,3,4,5], "start": "07:00", "end": "19:00"}]}
        now_ms: Current time in Unix milliseconds.

    Returns:
        True if current time matches any period.
    """
    tz = pytz.timezone(schedule_json.get("timezone", "UTC"))
    now_local = datetime.fromtimestamp(now_ms / 1000, tz=tz)
    weekday = now_local.isoweekday()  # 1=Mon, 7=Sun
    current_time = now_local.strftime("%H:%M")

    for period in schedule_json.get("periods", []):
        if weekday in period.get("days", []):
            if period.get("start", "00:00") <= current_time <= period.get("end", "23:59"):
                return True
    return False


def evaluate_passage_time(passage_time: dict, now_ms: int) -> bool:
    """Check if current time falls within passage_time slots (AP-level free access).

    Passage time uses day-of-week 0=Sunday convention (different from isoweekday).

    Args:
        passage_time: {"timezone": "Asia/Ho_Chi_Minh", "slots": [{"day": 1, "start": "08:00", "end": "18:00"}]}
        now_ms: Current time in Unix milliseconds.

    Returns:
        True if current time is within any passage_time slot.
    """
    slots = passage_time.get("slots", [])
    if not slots:
        return False

    tz = pytz.timezone(passage_time.get("timezone", "UTC"))
    now_local = datetime.fromtimestamp(now_ms / 1000, tz=tz)
    # Convert to 0=Sunday convention: isoweekday() gives 1=Mon..7=Sun → 0=Sun,1=Mon..6=Sat
    weekday = now_local.isoweekday() % 7  # 7(Sun)->0, 1(Mon)->1, ..., 6(Sat)->6
    current_time = now_local.strftime("%H:%M")

    for slot in slots:
        if slot.get("day") == weekday:
            if slot.get("start", "00:00") <= current_time <= slot.get("end", "23:59"):
                return True
    return False


class AccessEngine:
    """Offline-first access decision engine.

    Evaluates access requests against the local SQLite database.
    Implements the full decision algorithm from the DM3 spec.
    """

    def __init__(self, db: DeviceDatabase, lockdown_active: bool = False) -> None:
        self.db = db
        self.lockdown_active = lockdown_active

    async def evaluate(
        self,
        credential_type: str,
        credential_value: str,
        door_id: str,
        timestamp: int | None = None,
        direction: str = "entry",
    ) -> AccessDecision:
        """Evaluate an access request and return a decision.

        Args:
            credential_type: Type of credential (face, card, pin, qr, fingerprint).
            credential_value: The credential value (card_uid, face_template_hash, etc.).
            door_id: The door being accessed.
            timestamp: Event timestamp in Unix ms (defaults to now).
            direction: Access direction (entry/exit) for anti-passback.

        Returns:
            AccessDecision with granted/denied status and reason.
        """
        start_ns = time.monotonic_ns()
        now_ms = timestamp or int(time.time() * 1000)

        # Step 0: Check passage time — if active, grant access to everyone
        passage_time = await self.db.get_config("passage_time")
        if passage_time and evaluate_passage_time(passage_time, now_ms):
            # Passage time active: door is freely open, still identify the person if possible
            person = await self.db.lookup_credential(credential_type, credential_value)
            return self._decision(
                True, "passage_time", start_ns,
                person_id=person.person_id if person else None,
                person_name=person.name if person else None,
            )

        # Step 1: Check lockdown
        if self.lockdown_active:
            return self._decision(False, "lockdown_active", start_ns)

        # Step 2: Lookup credential
        person = await self.db.lookup_credential(credential_type, credential_value)
        if person is None:
            return self._decision(False, "denied_unknown", start_ns)

        # Step 3: Check blacklist (highest priority)
        if await self.db.is_blacklisted(person.person_id):
            return self._decision(
                False, "denied_blacklist", start_ns,
                person_id=person.person_id, person_name=person.name,
            )

        # Step 4: Check person active status
        if person.status != "active":
            return self._decision(
                False, "denied_inactive", start_ns, person_id=person.person_id
            )

        # Step 5: Check person validity window
        if person.valid_from and now_ms < person.valid_from:
            return self._decision(
                False, "denied_expired", start_ns, person_id=person.person_id
            )
        if person.valid_until and now_ms > person.valid_until:
            return self._decision(
                False, "denied_expired", start_ns, person_id=person.person_id
            )

        # Step 6: Check failed attempt lockout
        if await self.db.is_locked_out(person.person_id):
            return self._decision(
                False, "denied_lockout", start_ns, person_id=person.person_id
            )

        # Step 7: Find applicable access rules (sorted by priority DESC)
        rules = await self.db.get_matching_rules(door_id, person.person_id)
        if not rules:
            return self._decision(
                False, "denied_zone", start_ns, person_id=person.person_id
            )

        # Step 8: Evaluate rules in priority order
        for rule in rules:
            if not rule.enabled:
                continue

            # Check rule validity window
            if rule.valid_from and now_ms < rule.valid_from:
                continue
            if rule.valid_until and now_ms > rule.valid_until:
                continue

            # Check if door is in rule's door_ids
            if door_id not in rule.door_ids:
                continue

            # Check if person is in any of the rule's person groups
            if not await self.db.person_in_groups(person.person_id, rule.person_group_ids):
                continue

            # Check time schedule
            if rule.schedule_json:
                if not evaluate_schedule(rule.schedule_json, now_ms):
                    continue

            # Check anti-passback
            if rule.anti_passback:
                last_dir = await self.db.get_last_direction(person.person_id)
                if last_dir == direction:
                    return self._decision(
                        False, "denied_anti_passback", start_ns,
                        person_id=person.person_id,
                    )

            # GRANTED — first matching rule wins
            return self._decision(
                True, "authorized", start_ns,
                person_id=person.person_id,
                person_name=person.name,
                rule_id=rule.rule_id,
            )

        # No rule matched schedule
        return self._decision(
            False, "denied_time", start_ns, person_id=person.person_id
        )

    @staticmethod
    def _decision(
        granted: bool,
        reason: str,
        start_ns: int,
        person_id: str | None = None,
        person_name: str | None = None,
        rule_id: str | None = None,
    ) -> AccessDecision:
        """Build an AccessDecision with timing."""
        elapsed_ms = (time.monotonic_ns() - start_ns) / 1_000_000
        return AccessDecision(
            granted=granted,
            reason=reason,
            person_id=person_id,
            person_name=person_name,
            rule_id=rule_id,
            decision_time_ms=round(elapsed_ms, 3),
        )
