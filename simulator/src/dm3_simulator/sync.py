"""Sync protocol — handles full and incremental sync from server."""

from __future__ import annotations

import json
from typing import Any

import structlog

from dm3_simulator.database import DeviceDatabase

logger = structlog.get_logger()


class SyncHandler:
    """Processes incoming sync messages and updates the local database."""

    def __init__(self, db: DeviceDatabase, device_id: str) -> None:
        self.db = db
        self.device_id = device_id

    async def handle_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle cfg.full message — full device configuration with persons, credentials, rules."""
        import time as _time
        data = payload.get("data", {})
        config_version = data.get("config_version", 0)

        persons_data = data.get("persons", [])
        credentials_data = data.get("credentials", [])
        rules_data = data.get("access_rules", [])
        person_groups_data = data.get("person_groups", [])
        blacklist_data = data.get("blacklist", [])

        # Sync persons
        person_count = 0
        for p in persons_data:
            pid = p.get("id") or p.get("person_id")
            name = p.get("name", "")
            status = p.get("status", "active")
            await self.db.upsert_person(pid, name, status, p.get("valid_from"), p.get("valid_until"))
            person_count += 1

        # Sync credentials
        cred_count = 0
        for c in credentials_data:
            cid = c.get("id")
            person_id = c.get("person_id")
            ctype = c.get("type", "card")
            value = c.get("value", "")
            await self.db.upsert_credential(cid, person_id, ctype, value, c.get("status", "active"), c.get("valid_from"), c.get("valid_until"))
            cred_count += 1

        # Sync access rules
        rule_count = 0
        for rule in rules_data:
            await self.db.upsert_access_rule({
                "rule_id": rule.get("rule_id") or rule.get("id"),
                "name": rule.get("name", ""),
                "door_ids": rule.get("door_ids", []),
                "person_group_ids": rule.get("person_group_ids", []),
                "schedule_json": rule.get("schedule") or rule.get("schedule_json"),
                "anti_passback": rule.get("anti_passback", False),
                "multi_factor": rule.get("multi_factor", False),
                "priority": rule.get("priority", 0),
                "enabled": rule.get("enabled", True),
                "valid_from": rule.get("valid_from"),
                "valid_until": rule.get("valid_until"),
            })
            rule_count += 1

        # Sync person groups
        for g in person_groups_data:
            gid = g.get("group_id") or g.get("id")
            pids = g.get("person_ids", [])
            await self.db.upsert_person_group(gid, pids)

        # Sync blacklist
        for b in blacklist_data:
            await self.db.add_to_blacklist(
                b["person_id"], b.get("name"), b.get("reason"),
                b.get("effective_from"), b.get("effective_until"),
            )

        # Update sync state
        db_version = config_version if config_version > 0 else 1
        await self.db.set_sync_state("config_version", str(config_version))
        await self.db.set_sync_state("person_db_version", str(db_version))
        await self.db.set_sync_state("last_sync_time", str(int(_time.time() * 1000)))

        # Store raw config sections too
        for key, value in data.items():
            if key not in ("config_version", "checksum", "persons", "credentials", "access_rules", "person_groups", "blacklist"):
                await self.db.set_config(key, value)

        total = await self.db.get_person_count()
        logger.info(
            "sync_full_applied", device_id=self.device_id, version=config_version,
            persons=person_count, credentials=cred_count, rules=rule_count, total_persons=total,
        )
        return {"config_version": config_version, "persons": person_count, "credentials": cred_count, "rules": rule_count}

    async def handle_person_sync(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle cfg.person_sync message — person database sync.

        Server payload (§7.3):
        {
          "action": "full_sync|clear|upsert|delete",
          "users": [{ "user_id", "name", "credentials": [{type, uid/template/code}],
                       "access_zones", "schedule_id", "valid_from", "valid_until", "active" }],
          "sync_token": "...", "total_count": N, "batch": 1, "batch_total": 1
        }
        """
        data = payload.get("data", {})
        action = data.get("action", "upsert")
        users = data.get("users", [])
        sync_token = data.get("sync_token")
        batch = data.get("batch", 1)
        batch_total = data.get("batch_total", 1)

        # Clear action: wipe all users (first step of manual replace flow)
        if action == "clear":
            await self.db.db.execute("DELETE FROM credentials")
            await self.db.db.execute("DELETE FROM persons")
            await self.db.db.commit()
            await self.db.set_sync_state("person_db_version", "0")
            logger.info("sync_persons_cleared", device_id=self.device_id)
            return {"synced_count": 0, "failed_count": 0, "local_total": 0, "sync_token": sync_token or ""}

        # Full sync on batch 1: clear existing data before loading
        if action == "full_sync" and batch == 1:
            await self.db.db.execute("DELETE FROM credentials")
            await self.db.db.execute("DELETE FROM persons")
            await self.db.db.commit()

        synced = 0
        failed = 0
        for u in users:
            try:
                user_id = u["user_id"]
                if action == "delete":
                    await self.db.delete_person(user_id)
                else:
                    await self.db.upsert_person(
                        user_id, u["name"],
                        "active" if u.get("active", True) else "suspended",
                        u.get("valid_from"), u.get("valid_until"),
                    )
                    for cred in u.get("credentials", []):
                        cred_type = cred.get("type", "card")
                        # Server sends uid (card), template (face/fp), or code (qr/pin)
                        cred_value = cred.get("uid") or cred.get("template") or cred.get("code") or ""
                        cred_id = f"{user_id}-{cred_type}"
                        await self.db.upsert_credential(cred_id, user_id, cred_type, cred_value)
                synced += 1
            except Exception as e:
                logger.error("sync_person_error", error=str(e), user=u.get("user_id"))
                failed += 1

        if sync_token:
            await self.db.set_sync_state("sync_token", sync_token)

        total = await self.db.get_person_count()
        db_version = int(await self.db.get_sync_state("person_db_version") or "0") + 1
        await self.db.set_sync_state("person_db_version", str(db_version))

        # Track batch progress
        await self.db.set_sync_state("sync_batch", str(batch))
        await self.db.set_sync_state("sync_batch_total", str(batch_total))

        logger.info(
            "sync_persons_applied", device_id=self.device_id,
            action=action, synced=synced, failed=failed, total=total,
            batch=f"{batch}/{batch_total}",
        )
        return {
            "synced_count": synced, "failed_count": failed,
            "local_total": total, "sync_token": sync_token or "",
            "batch": batch, "batch_total": batch_total,
        }

    async def handle_access_rules(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle cfg.access_rules message — access rules sync.

        Server payload (§7.5):
        {
          "action": "full_sync|delta",
          "version": 42,
          "passage_time": { "timezone": "...", "slots": [{ "day", "start", "end" }] },
          "access_rules": [
            { "user_id": "uuid", "credential": "card-A1B2C3",
              "schedules": [{ "source": "IT Team", "timezone": "...",
                              "slots": [{ "day", "start", "end" }] }]
            }
          ]
        }
        """
        data = payload.get("data", {})
        version = data.get("version", 0)
        passage_time = data.get("passage_time", {})
        access_rules = data.get("access_rules", [])

        # Store passage_time as a config entry (AP-level unrestricted schedule)
        await self.db.set_config("passage_time", passage_time)

        # Store per-user access rules: each user gets a rule entry with their schedules
        count = 0
        for rule in access_rules:
            user_id = rule.get("user_id", "")
            schedules = rule.get("schedules", [])
            # Build a combined schedule_json from all schedule sources (union/OR logic)
            all_slots = []
            timezone = ""
            for sched in schedules:
                timezone = sched.get("timezone", timezone)
                for slot in sched.get("slots", []):
                    all_slots.append(slot)

            await self.db.upsert_access_rule({
                "rule_id": f"ar-{user_id}",
                "name": ", ".join(s.get("source", "") for s in schedules),
                "door_ids": [],
                "person_group_ids": [user_id],
                "schedule_json": {"timezone": timezone, "slots": all_slots} if all_slots else None,
                "anti_passback": False,
                "multi_factor": False,
                "priority": 0,
                "enabled": True,
                "valid_from": None,
                "valid_until": None,
            })
            count += 1

        await self.db.set_sync_state("rules_version", str(version))
        logger.info(
            "sync_rules_applied", device_id=self.device_id,
            version=version, users=count,
            passage_time_slots=len(passage_time.get("slots", [])),
        )
        return {"rules_version": version, "rules_count": count}

    async def handle_blacklist(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle cfg.blacklist message — blacklist sync (priority).

        Server payload (§7.4):
        {
          "action": "add|remove|full_sync",
          "entries": [{ "user_id", "name", "credentials", "reason",
                        "effective_from", "effective_until" }],
          "blacklist_version": 15
        }
        """
        data = payload.get("data", {})
        action = data.get("action", "add")
        entries = data.get("entries", [])
        version = data.get("blacklist_version", 0)

        for entry in entries:
            # Server sends user_id (not person_id)
            user_id = entry.get("user_id") or entry.get("person_id", "")
            if action == "remove":
                await self.db.remove_from_blacklist(user_id)
            else:
                await self.db.add_to_blacklist(
                    user_id, entry.get("name"), entry.get("reason"),
                    entry.get("effective_from"), entry.get("effective_until"),
                )

        await self.db.set_sync_state("blacklist_version", str(version))
        logger.info(
            "sync_blacklist_applied", device_id=self.device_id,
            action=action, count=len(entries), version=version,
        )
        return {"blacklist_version": version}

    async def handle_device_update(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle cfg.device_update message — device settings from server.

        Server payload:
        {
          "device_id": "840107",
          "name": "DQ Mini+ Demo",
          "location": "Office Staff",
          "model": "dqmini_plus",
          "open_relay_ms": 3000,
          "timezone": "Asia/Ho_Chi_Minh",
          "verify_methods": ["face", "nfc", "pin"],
          "verify_logic": "or"
        }
        """
        import time as _time
        data = payload.get("data", {})

        # Store all config fields
        for key, value in data.items():
            await self.db.set_config(f"device_{key}", value)

        await self.db.set_sync_state("last_config_update", str(int(_time.time() * 1000)))

        logger.info(
            "device_config_updated", device_id=self.device_id,
            name=data.get("name"), location=data.get("location"),
        )
        return {"applied_at": int(_time.time() * 1000)}
