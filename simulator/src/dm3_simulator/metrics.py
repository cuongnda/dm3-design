"""Prometheus metrics for the DM3 simulator."""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram, Summary


# Device metrics
devices_total = Gauge(
    "dm3_sim_devices_total", "Number of simulated devices", ["state"]
)
devices_online_ratio = Gauge(
    "dm3_sim_devices_online_ratio", "Ratio of online devices"
)

# Event metrics
events_total = Counter(
    "dm3_sim_events_total", "Total events generated", ["type", "decision"]
)
events_per_second = Gauge(
    "dm3_sim_events_per_second", "Current events per second"
)
event_publish_latency = Summary(
    "dm3_sim_event_publish_latency_ms", "Event publish latency in ms"
)

# Sync metrics
sync_person_count = Gauge(
    "dm3_sim_sync_person_count", "Synced person count", ["device_id"]
)
sync_latency = Summary(
    "dm3_sim_sync_latency_ms", "Sync latency in ms", ["sync_type"]
)
sync_failures_total = Counter(
    "dm3_sim_sync_failures_total", "Total sync failures"
)

# Queue metrics
queue_depth = Gauge(
    "dm3_sim_queue_depth", "Event queue depth", ["device_id"]
)
queue_depth_total = Gauge(
    "dm3_sim_queue_depth_total", "Total event queue depth across all devices"
)

# Decision metrics
decision_time = Summary(
    "dm3_sim_decision_time_ms", "Access decision time in ms"
)
decisions_total = Counter(
    "dm3_sim_decisions_total", "Total access decisions", ["result"]
)
