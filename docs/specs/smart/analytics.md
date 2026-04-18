# Feature: Analytics & Reporting

> Domain: SMART | Color: #9C27B0 | Priority: P1
> Status: NOT IMPLEMENTED | Owner: report-svc team

## Overview
Analytics provides cross-domain dashboards, trend analysis, anomaly detection, and scheduled reports across all DM3 domains. Aggregates data from access events, visitor logs, attendance records, energy consumption, parking sessions, and maintenance work orders into actionable insights. Uses TimescaleDB continuous aggregates and ClickHouse (Phase 3) for high-performance analytical queries.

## Data Models

### Dashboard
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| name | text | yes | — | Dashboard name |
| description | text | no | — | Description |
| owner_id | uuid | yes | — | Creator |
| visibility | text | yes | private | private / role / site / public |
| visible_to_roles | text[] | no | — | If visibility=role |
| visible_to_sites | uuid[] | no | — | If visibility=site |
| layout | jsonb | yes | — | Widget grid layout [{widget_id, x, y, w, h}] |
| filters | jsonb | no | {} | Dashboard-level filters {site_id, date_range} |
| auto_refresh_sec | int | no | 60 | Auto-refresh interval |
| is_default | bool | yes | false | Default dashboard for role |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Widget
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| dashboard_id | uuid | yes | — | Parent dashboard |
| name | text | yes | — | Widget title |
| type | WidgetType | yes | — | Widget visualization type |
| domain | text | yes | — | Data domain |
| data_source | jsonb | yes | — | Query definition (see below) |
| config | jsonb | yes | {} | Visualization config (colors, axes, thresholds) |
| refresh_sec | int | no | — | Override dashboard refresh |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Widget data_source schema:
```json
{
  "type": "timeseries",
  "service": "access-svc",
  "metric": "door_traffic",
  "aggregation": "count",
  "group_by": ["door_id", "direction"],
  "filters": {"site_id": "uuid", "direction": "entry"},
  "time_range": "last_7d",
  "interval": "1h"
}
```

### Report
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| name | text | yes | — | Report name |
| type | ReportType | yes | — | Report category |
| domain | text | yes | — | Target domain |
| template_id | uuid | no | — | Report template |
| parameters | jsonb | yes | {} | Report parameters |
| format | text | yes | pdf | pdf / xlsx / csv |
| status | text | yes | pending | pending / generating / completed / failed |
| file_ref | text | no | — | Generated file (MinIO ref) |
| file_size_bytes | int | no | — | File size |
| generated_at | timestamptz | no | — | Generation completion time |
| generated_by | uuid | yes | — | Requester |
| error | text | no | — | Error if failed |
| created_at | timestamp | yes | now() | Creation time |

### ScheduledReport
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| name | text | yes | — | Schedule name |
| report_type | ReportType | yes | — | Report type to generate |
| parameters | jsonb | yes | {} | Report parameters |
| format | text | yes | pdf | Output format |
| schedule_cron | text | yes | — | Cron expression |
| recipients | jsonb | yes | — | [{user_id, email, channel}] |
| timezone | text | yes | Asia/Ho_Chi_Minh | Timezone |
| enabled | bool | yes | true | Active flag |
| last_run_at | timestamptz | no | — | Last generation |
| next_run_at | timestamptz | no | — | Next scheduled run |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Anomaly
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| domain | text | yes | — | Source domain |
| type | AnomalyType | yes | — | Anomaly category |
| severity | text | yes | medium | low / medium / high / critical |
| title | text | yes | — | Short description |
| description | text | yes | — | Detailed explanation |
| metric_name | text | yes | — | Affected metric |
| expected_value | double precision | no | — | Expected/baseline value |
| actual_value | double precision | no | — | Observed value |
| deviation_percent | double precision | no | — | % deviation from baseline |
| confidence | double precision | yes | — | Detection confidence (0-1) |
| detected_at | timestamptz | yes | — | Detection time |
| status | text | yes | new | new / investigating / resolved / false_positive |
| resolved_by | uuid | no | — | Who resolved |
| resolution_notes | text | no | — | Resolution explanation |
| related_entities | jsonb | no | — | [{type, id, name}] |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Enums
```
WidgetType: stat_card | line_chart | bar_chart | pie_chart | donut_chart | heatmap | table | gauge | map | timeline | funnel
ReportType: access_daily | access_monthly | visitor_daily | visitor_monthly | attendance_daily | attendance_monthly | parking_revenue | energy_consumption | energy_esg | maintenance_sla | occupancy | security_summary | custom
AnomalyType: access_pattern | energy_spike | occupancy_deviation | device_health | attendance_irregularity | parking_anomaly | security_event_cluster
```

## API Endpoints

### GET /api/v1/analytics/{domain}/summary
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Filter by site |
  | from | timestamptz | -24h | Start time |
  | to | timestamptz | now | End time |
- **Domain values:** access, visitor, attendance, parking, energy, maintenance, security
- **Response 200 (example: access):**
  ```json
  {
    "domain": "access",
    "period": {"from": "...", "to": "..."},
    "summary": {
      "total_events": 12450,
      "granted": 12100,
      "denied": 350,
      "unique_persons": 890,
      "peak_hour": "08:00-09:00",
      "peak_count": 420,
      "busiest_door": {"id": "uuid", "name": "Cổng chính", "events": 2100}
    },
    "trends": {
      "vs_previous_period": {"events": "+5.2%", "denied": "-12%"},
      "vs_same_day_last_week": {"events": "+2.1%"}
    }
  }
  ```

### GET /api/v1/analytics/{domain}/trends
- **Auth:** role >= viewer
- **Query params:** site_id, from, to, interval (1h/1d/1w), metric, group_by
- **Response 200:**
  ```json
  {
    "metric": "access_events",
    "interval": "1h",
    "data": [
      {"time": "2026-02-19T08:00:00+07:00", "value": 420, "groups": {"entry": 280, "exit": 140}}
    ]
  }
  ```

### GET /api/v1/analytics/occupancy
- **Auth:** role >= viewer
- **Query params:** site_id, floor, zone, from, to, interval
- **Response 200:**
  ```json
  {
    "site_id": "uuid",
    "current_occupancy": 456,
    "max_capacity": 800,
    "utilization_percent": 57,
    "by_floor": [
      {"floor": "Tầng 1", "current": 85, "capacity": 150, "utilization": 56.7}
    ],
    "trend": [
      {"time": "08:00", "occupancy": 120},
      {"time": "09:00", "occupancy": 380},
      {"time": "10:00", "occupancy": 456}
    ],
    "peak_today": {"time": "10:30", "occupancy": 478}
  }
  ```

### GET /api/v1/dashboards
- **Auth:** Bearer token
- **Query params:** site_id, visibility, owner_id
- **Response 200:** Dashboard list (filtered by user access)

### POST /api/v1/dashboards
- **Auth:** role >= operator
- **Body:**
  ```json
  {
    "name": "Security Overview",
    "visibility": "role",
    "visible_to_roles": ["security_admin", "guard"],
    "layout": [
      {"widget_id": "uuid", "x": 0, "y": 0, "w": 6, "h": 4}
    ],
    "auto_refresh_sec": 30
  }
  ```
- **Response 201:** Created dashboard

### GET /api/v1/dashboards/{id}
- **Auth:** dashboard viewer
- **Response 200:** Dashboard with all widget data pre-loaded

### PUT /api/v1/dashboards/{id}
- **Auth:** dashboard owner or role >= admin
- **Response 200:** Updated dashboard

### DELETE /api/v1/dashboards/{id}
- **Auth:** dashboard owner or role >= admin
- **Response 204:** Deleted

### POST /api/v1/dashboards/{id}/widgets
- **Auth:** dashboard owner or role >= admin
- **Body:** Widget definition
- **Response 201:** Created widget

### PUT /api/v1/dashboards/{id}/widgets/{widget_id}
- **Auth:** dashboard owner or role >= admin
- **Response 200:** Updated widget

### DELETE /api/v1/dashboards/{id}/widgets/{widget_id}
- **Auth:** dashboard owner or role >= admin
- **Response 204:** Deleted

### POST /api/v1/reports/generate
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "type": "energy_consumption",
    "parameters": {
      "site_id": "uuid",
      "from": "2026-01-01",
      "to": "2026-01-31",
      "meter_types": ["electricity", "water"],
      "group_by": "zone"
    },
    "format": "pdf"
  }
  ```
- **Response 202:** Accepted with report ID (async generation)

### GET /api/v1/reports/{id}
- **Auth:** report requester or role >= admin
- **Response 200:** Report metadata + download URL

### GET /api/v1/reports/{id}/download
- **Auth:** report requester or role >= admin
- **Response 200:** File stream (PDF/XLSX/CSV)

### GET /api/v1/reports
- **Auth:** role >= admin
- **Query params:** site_id, type, status, from, to
- **Response 200:** Report list

### GET /api/v1/reports/schedules
- **Auth:** role >= admin
- **Query params:** site_id, enabled
- **Response 200:** Scheduled report list

### POST /api/v1/reports/schedules
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "name": "Báo cáo điện nước hàng tháng",
    "report_type": "energy_consumption",
    "parameters": {"site_id": "uuid", "meter_types": ["electricity", "water"]},
    "format": "pdf",
    "schedule_cron": "0 8 1 * *",
    "recipients": [{"user_id": "uuid", "channel": "email"}],
    "timezone": "Asia/Ho_Chi_Minh"
  }
  ```
- **Response 201:** Created schedule

### PUT /api/v1/reports/schedules/{id}
- **Auth:** role >= admin
- **Response 200:** Updated schedule

### DELETE /api/v1/reports/schedules/{id}
- **Auth:** role >= admin
- **Response 204:** Deleted

### GET /api/v1/analytics/anomalies
- **Auth:** role >= operator
- **Query params:** site_id, domain, severity, status, from, to
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "type": "energy_spike",
      "severity": "high",
      "title": "Tiêu thụ điện tầng 3 tăng đột biến 45%",
      "detected_at": "2026-02-19T14:30:00+07:00",
      "expected_value": 42.5,
      "actual_value": 61.6,
      "deviation_percent": 45,
      "confidence": 0.92,
      "status": "new",
      "related_entities": [{"type": "meter", "id": "uuid", "name": "Đồng hồ T3"}]
    }],
    "total": 8
  }
  ```

### PUT /api/v1/analytics/anomalies/{id}
- **Auth:** role >= admin
- **Body:** `{"status": "resolved", "resolution_notes": "Do sự kiện đặc biệt, tiêu thụ hợp lý"}`
- **Response 200:** Updated anomaly

### POST /api/v1/analytics/data-export
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "domain": "access",
    "from": "2026-01-01",
    "to": "2026-02-01",
    "site_id": "uuid",
    "format": "csv",
    "columns": ["time", "door_name", "user_name", "direction", "decision"]
  }
  ```
- **Response 202:** Accepted with export job ID

### GET /api/v1/analytics/data-export/{id}
- **Auth:** export requester
- **Response 200:** Export status + download URL when ready

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| dm3/{site}/analytics/anomaly/new | server→client | 1 | `{"anomaly_id":"...","type":"...","severity":"high","title":"..."}` | New anomaly detected alert |
| dm3/{site}/analytics/dashboard/{id}/refresh | server→client | 0 | `{"widget_id":"...","data":{...}}` | Real-time widget data push |

## Business Rules
1. **Data aggregation tiering:** Raw data queried for last 24h. 5-min aggregates for 1-30 days. Hourly for 1-12 months. Daily for 1-5 years. Ensures consistent query performance.
2. **Anomaly detection baseline:** Baselines calculated from 4-week rolling average, same day-of-week, same time-of-day. Anomaly triggered when deviation > 2 standard deviations.
3. **Dashboard permission scoping:** Widgets only show data for sites/resources the viewing user has access to. Same dashboard, different data per user role.
4. **Report generation timeout:** Reports must complete within 5 minutes. Large exports auto-paginated. Very large exports (>1M rows) split into multiple files.
5. **Scheduled report retry:** IF scheduled report fails THEN retry 3 times with 15-min delay. After 3 failures, disable schedule and alert admin.
6. **Data export limits:** Max export: 1M rows per request. Max date range: 1 year. Rate limit: 5 exports per user per hour.
7. **Cross-domain correlation:** Analytics engine can correlate events across domains (e.g., access denied → alarm triggered → camera event) using time-window correlation (±30 seconds).
8. **Anomaly auto-escalation:** IF anomaly severity = critical AND unresolved for > 1 hour THEN escalate to site_admin via notification.
9. **Dashboard versioning:** Dashboard layouts auto-saved. Users can revert to last 5 versions.
10. **Real-time vs batch:** Dashboard widgets use real-time data (WebSocket push). Reports use batch-processed aggregates for consistency.
11. **Multi-site aggregation:** Cross-site dashboards aggregate data from multiple sites. Performance: pre-computed rollups per site, aggregated at query time.
12. **Vietnamese report templates:** Built-in templates for common Vietnamese compliance reports (báo cáo an ninh, báo cáo PCCC, báo cáo năng lượng).

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View dashboards | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create dashboards | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit own dashboards | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit any dashboard | ❌ | ❌ | ✅ | ✅ | ✅ |
| Set default dashboards | ❌ | ❌ | ✅ | ✅ | ✅ |
| View analytics | ✅ | ✅ | ✅ | ✅ | ✅ |
| Generate reports | ❌ | ❌ | ✅ | ✅ | ✅ |
| Schedule reports | ❌ | ❌ | ✅ | ✅ | ✅ |
| Export data | ❌ | ❌ | ✅ | ✅ | ✅ |
| View anomalies | ❌ | ✅ | ✅ | ✅ | ✅ |
| Resolve anomalies | ❌ | ❌ | ✅ | ✅ | ✅ |
| Cross-site analytics | ❌ | ❌ | ❌ | ✅ | ✅ |
| Delete dashboards | ❌ | ❌ | ✅ | ✅ | ✅ |

## Offline Behavior
- **Web/Mobile app:** Dashboard displays cached snapshot of last-loaded data with timestamp "Dữ liệu cập nhật lúc: {time}". Auto-refresh paused. Widget-level "stale data" indicator.
- **Reports:** Previously generated reports available for download from local cache. New report generation unavailable offline.
- **Anomaly detection:** Server-side only — no offline anomaly detection. Anomaly list cached with last-known state.
- **Sync strategy:** On reconnection, dashboards auto-refresh all widgets. Pending report requests re-queued.
- **Conflict resolution:** Dashboard layout changes: last-write-wins with user notification if another user modified concurrently.
- **Local storage:** Dashboard snapshot: ~1MB per dashboard. Recent reports list: ~100KB. TTL: dashboard cache 1h, reports list 24h.

## UI Pages
| Route | Page | Key Components |
|-------|------|----------------|
| /smart/analytics | Overview | Multi-domain summary cards, quick metrics |
| /smart/analytics/dashboards | Dashboard list | Dashboard gallery, create new, set default |
| /smart/analytics/dashboards/:id | Dashboard view | Widget grid, drag-drop editor, filters |
| /smart/analytics/{domain} | Domain analytics | Domain-specific deep-dive analytics |
| /smart/analytics/occupancy | Occupancy analysis | Floor heatmap, trend charts, peak analysis |
| /smart/analytics/anomalies | Anomaly management | Anomaly list, investigation, resolution |
| /smart/analytics/reports | Report center | Generate, history, scheduled reports |
| /smart/analytics/reports/:id | Report detail | Preview, download, metadata |
| /smart/analytics/export | Data export | Export builder, download queue |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| analytics.dashboard.created | POST create | dashboard_id + owner | 1 year |
| analytics.dashboard.updated | PUT update | dashboard_id + diff | 90 days |
| analytics.dashboard.deleted | DELETE | dashboard_id + actor | 1 year |
| analytics.report.requested | POST generate | report_type + params + requester | 1 year |
| analytics.report.completed | Generation done | report_id + file_ref + size | 1 year |
| analytics.report.downloaded | GET download | report_id + actor | 1 year |
| analytics.report.scheduled | POST schedule | schedule details | 1 year |
| analytics.export.requested | POST export | domain + params + requester | 1 year |
| analytics.export.completed | Export done | export_id + rows + file_ref | 90 days |
| analytics.anomaly.detected | ML detection | full anomaly | 1 year |
| analytics.anomaly.resolved | Admin action | anomaly_id + resolution + actor | 1 year |

## Integration Points
- **Depends on:** ALL domain services (data sources via gRPC/NATS), tenant-svc (site hierarchy, multi-site), auth-svc (permission scoping), notif-svc (report delivery, anomaly alerts)
- **Consumed by:** ai-asst-svc (analytics queries from natural language), dashboards (web/mobile), automate-svc (anomaly triggers)
- **External:** ClickHouse (Phase 3 analytical warehouse), PDF generation service (wkhtmltopdf/Puppeteer), email delivery (report distribution)

## Notes
- TimescaleDB continuous aggregates provide the primary analytics engine in Phase 1-2
- ClickHouse integration in Phase 3 for ad-hoc analytical queries at scale (>1B events)
- Dashboard widget grid uses a 12-column responsive layout (similar to Grafana)
- Report templates support Vietnamese formatting: date (dd/MM/yyyy), currency (1.000.000₫), number separators
- Anomaly detection Phase 1: statistical (Z-score, IQR). Phase 3: ML-based (PyOD, Isolation Forest)
- Consider embedding Grafana dashboards as an alternative to custom dashboard builder for power users
