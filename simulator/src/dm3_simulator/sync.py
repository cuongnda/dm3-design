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
        """Handle cfg.full message — full device configuration."""
        data = payload.get("data", {})
        config_version = data.get("config_version", 0)

        # Store all config sections
        for key, value in data.items():
            if key not in ("config_version", "checksum"):
                await self.db.set_config(key, value)

        await self.db.set_sync_state("config_version", str(config_version))
        logger.info("sync_config_applied", device_id=self.device_id, version=config_version)
        return {"config_version": config_version}

    async def handle_person_sync(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle cfg.person_sync message — person database sync."""
        data = payload.get("data", {})
        action = data.get("action", "upsert")
        persons = data.get("persons", [])
        sync_token = data.get("sync_token")

        if action == "full_sync":
            # For full sync, we could clear existing data first
            # but for simplicity we just upsert all
            pass

        synced = 0
        failed = 0
        for p in persons:
            try:
                person_id = p["person_id"]
                if action == "delete":
                    await self.db.delete_person(person_id)
                else:
                    await self.db.upsert_person(
                        person_id, p["name"],
                        "active" if p.get("active", True) else "suspended",
                        p.get("valid_from"), p.get("valid_until"),
                    )
                    for cred in p.get("credentials", []):
                        cred_type = cred.get("type", "card")
                        cred_value = cred.get("uid") or cred.get("template") or cred.get("value", "")
                        cred_id = f"{person_id}-{cred_type}"
                        await self.db.upsert_credential(cred_id, person_id, cred_type, cred_value)
                synced += 1
            except Exception as e:
                logger.error("sync_person_error", error=str(e), person=p.get("person_id"))
                failed += 1

        if sync_token:
            await self.db.set_sync_state("sync_token", sync_token)

        total = await self.db.get_person_count()
        db_version = int(await self.db.get_sync_state("person_db_version") or "0") + 1
        await self.db.set_sync_state("person_db_version", str(db_version))

        logger.info(
            "sync_persons_applied", device_id=self.device_id,
            action=action, synced=synced, failed=failed, total=total,
        )
        return {
            "synced_count": synced, "failed_count": failed,
            "local_total": total, "sync_token": sync_token or "",
        }

    async def handle_access_rules(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle cfg.access_rules message — access rules sync."""
        data = payload.get("data", {})
        rules = data.get("rules", [])
        rules_version = data.get("rules_version", 0)

        count = 0
        for rule in rules:
            # Normalize schedule format
            schedule = rule.get("schedule")
            await self.db.upsert_access_rule({
                "rule_id": rule["rule_id"],
                "name": rule.get("name", ""),
                "door_ids": rule.get("door_ids", []),
                "person_group_ids": rule.get("person_group_ids", []),
                "schedule_json": schedule,
                "anti_passback": rule.get("anti_passback", False),
                "multi_factor": rule.get("multi_factor", False),
                "priority": rule.get("priority", 0),
                "enabled": rule.get("enabled", True),
                "valid_from": rule.get("valid_from"),
                "valid_until": rule.get("valid_until"),
            })
            count += 1

        await self.db.set_sync_state("rules_version", str(rules_version))
        logger.info(
            "sync_rules_applied", device_id=self.device_id,
            version=rules_version, count=count,
        )
        return {"rules_version": rules_version, "rules_count": count}

    async def handle_blacklist(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle cfg.blacklist message — blacklist sync (priority)."""
        data = payload.get("data", {})
        action = data.get("action", "add")
        entries = data.get("entries", [])
        version = data.get("blacklist_version", 0)

        for entry in entries:
            person_id = entry["person_id"]
            if action == "remove":
                await self.db.remove_from_blacklist(person_id)
            else:
                await self.db.add_to_blacklist(
                    person_id, entry.get("name"), entry.get("reason"),
                    entry.get("effective_from"), entry.get("effective_until"),
                )

        await self.db.set_sync_state("blacklist_version", str(version))
        logger.info(
            "sync_blacklist_applied", device_id=self.device_id,
            action=action, count=len(entries), version=version,
        )
        return {"blacklist_version": version}
