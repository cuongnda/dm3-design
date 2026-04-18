# Feature: IoT Sensors & Energy Management

> Domain: OPERATE | Color: #4CAF50 | Priority: P1
> Status: NOT IMPLEMENTED | Owner: iot-svc team

## Overview
IoT & Energy Management provides a unified dashboard for all IoT sensors (temperature, humidity, air quality, water leak, occupancy) and energy monitoring (electricity, water, gas). Supports alert thresholds, consumption reports, environmental compliance, and ESG reporting. Sensor data stored as time-series in TimescaleDB with continuous aggregates for efficient querying.

## Data Models

### Sensor
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Sensor name (e.g., "Cảm biến nhiệt độ T5-01") |
| sensor_type | SensorType | yes | — | Sensor category |
| protocol | text | yes | — | zigbee / zwave / modbus / bacnet / mqtt / lora |
| device_id | text | yes | — | Hardware device ID |
| location | jsonb | yes | — | {building, floor, zone, room, coordinates} |
| unit | text | yes | — | Measurement unit (°C, %, ppm, kWh, etc.) |
| reading_interval_sec | int | yes | 60 | Expected reading interval |
| status | SensorStatus | yes | online | Current status |
| last_reading | jsonb | no | — | {value, unit, timestamp} |
| last_seen | timestamptz | no | — | Last communication |
| battery_percent | int | no | — | Battery level (wireless sensors) |
| firmware_version | text | no | — | Current firmware |
| linked_asset_id | uuid | no | — | Related asset (maintenance-svc) |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### SensorReading (TimescaleDB Hypertable)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| tenant_id | uuid | yes | — | Tenant reference |
| time | timestamptz | yes | — | Reading timestamp |
| sensor_id | uuid | yes | — | Sensor reference |
| sensor_type | SensorType | yes | — | Sensor type (for partitioning) |
| value | double precision | yes | — | Reading value |
| unit | text | yes | — | Measurement unit |
| quality | text | no | good | good / suspect / bad |
| metadata | jsonb | no | — | Extra data |

### AlertThreshold
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Alert name |
| sensor_ids | uuid[] | no | — | Specific sensors (null = all of type) |
| sensor_type | SensorType | no | — | Or all sensors of type |
| condition | text | yes | — | gt / lt / gte / lte / eq / between / outside |
| value | double precision | yes | — | Threshold value |
| value_high | double precision | no | — | Upper bound (for between/outside) |
| duration_sec | int | no | 0 | Must exceed for N seconds before alert |
| severity | text | yes | warning | info / warning / critical |
| enabled | bool | yes | true | Active flag |
| notification_channels | text[] | yes | — | push / email / sms / in_app |
| notification_targets | uuid[] | no | — | Specific users to notify |
| cooldown_min | int | yes | 30 | Min time between repeat alerts |
| auto_action | jsonb | no | — | Automation trigger on alert |
| last_triggered_at | timestamptz | no | — | Last alert time |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### EnergyMeter
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| site_id | uuid | yes | — | Site reference |
| name | text | yes | — | Meter name (e.g., "Đồng hồ điện tầng 3") |
| meter_type | MeterType | yes | — | electricity / water / gas |
| meter_id | text | yes | — | Hardware meter ID |
| protocol | text | yes | — | modbus / bacnet / pulse / mqtt |
| location | jsonb | yes | — | Physical location |
| unit | text | yes | — | kWh / m³ / etc. |
| multiplier | double precision | yes | 1.0 | Reading multiplier |
| parent_meter_id | uuid | no | — | Parent meter (for sub-metering) |
| assigned_tenant_id | uuid | no | — | Billing tenant (for sub-metering) |
| assigned_zone | text | no | — | Billing zone |
| rate_schedule_id | uuid | no | — | Rate schedule for cost calc |
| status | text | yes | active | active / offline / maintenance |
| last_reading | jsonb | no | — | {value, timestamp} |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### EnergyReading (TimescaleDB Hypertable)
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| tenant_id | uuid | yes | — | Tenant reference |
| time | timestamptz | yes | — | Reading timestamp |
| meter_id | uuid | yes | — | Meter reference |
| meter_type | MeterType | yes | — | Meter type |
| cumulative_value | double precision | yes | — | Cumulative meter reading |
| delta_value | double precision | no | — | Delta since last reading |
| unit | text | yes | — | Measurement unit |
| power_kw | double precision | no | — | Instantaneous power (electricity) |
| voltage | double precision | no | — | Voltage (electricity) |
| current_a | double precision | no | — | Current in amps |
| power_factor | double precision | no | — | Power factor |
| metadata | jsonb | no | — | Extra data |

### RateSchedule
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| name | text | yes | — | Schedule name |
| meter_type | MeterType | yes | — | Applicable meter type |
| rate_type | text | yes | — | flat / tiered / time_of_use |
| rates | jsonb | yes | — | Rate definition (see notes) |
| currency | text | yes | VND | Currency |
| effective_from | date | yes | — | Start date |
| effective_until | date | no | — | End date |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
SensorType: temperature | humidity | co2 | pm25 | voc | air_quality_index | occupancy | motion | water_leak | smoke | vibration | light_level | noise_level | door_contact
SensorStatus: online | offline | low_battery | error | maintenance
MeterType: electricity | water | gas
```

## API Endpoints

### GET /api/v1/iot/sensors
- **Auth:** Bearer token, role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | page | int | 1 | Page number |
  | limit | int | 20 | Items per page (max 100) |
  | site_id | uuid | required | Filter by site |
  | sensor_type | SensorType | — | Filter by type |
  | status | SensorStatus | — | Filter by status |
  | floor | text | — | Filter by floor |
  | zone | text | — | Filter by zone |
  | search | text | — | Search name |
- **Response 200:**
  ```json
  {
    "data": [{
      "id": "uuid",
      "name": "Cảm biến nhiệt độ T5-01",
      "sensor_type": "temperature",
      "location": {"building": "Tòa A", "floor": "Tầng 5", "room": "501"},
      "status": "online",
      "last_reading": {"value": 26.5, "unit": "°C", "timestamp": "2026-02-19T09:00:00+07:00"},
      "battery_percent": 85,
      "alert_active": false
    }],
    "total": 120
  }
  ```

### GET /api/v1/iot/sensors/{id}
- **Auth:** role >= viewer
- **Response 200:** Full sensor detail

### POST /api/v1/iot/sensors
- **Auth:** role >= admin
- **Body:** Sensor registration
- **Response 201:** Created sensor

### PUT /api/v1/iot/sensors/{id}
- **Auth:** role >= admin
- **Response 200:** Updated sensor

### GET /api/v1/iot/sensors/{id}/readings
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | from | timestamptz | -24h | Start time |
  | to | timestamptz | now | End time |
  | interval | text | auto | Aggregation: raw / 1min / 5min / 15min / 1h / 1d |
  | aggregate | text | avg | avg / min / max / sum / count |
- **Response 200:**
  ```json
  {
    "sensor_id": "uuid",
    "sensor_type": "temperature",
    "unit": "°C",
    "interval": "15min",
    "data": [
      {"time": "2026-02-19T08:00:00+07:00", "value": 25.3, "min": 24.8, "max": 25.9},
      {"time": "2026-02-19T08:15:00+07:00", "value": 25.7, "min": 25.1, "max": 26.2}
    ],
    "statistics": {"avg": 25.5, "min": 24.2, "max": 27.1, "stddev": 0.8}
  }
  ```

### GET /api/v1/iot/alerts
- **Auth:** role >= operator
- **Query params:** site_id, sensor_type, severity, active, from, to
- **Response 200:** Active and historical alerts

### GET /api/v1/iot/alert-thresholds
- **Auth:** role >= operator
- **Query params:** site_id, sensor_type, enabled
- **Response 200:** Threshold configuration list

### POST /api/v1/iot/alert-thresholds
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "name": "Nhiệt độ phòng server cao",
    "sensor_type": "temperature",
    "sensor_ids": ["uuid"],
    "condition": "gt",
    "value": 28,
    "duration_sec": 300,
    "severity": "critical",
    "notification_channels": ["push", "sms"],
    "notification_targets": ["uuid"],
    "cooldown_min": 15,
    "auto_action": {"type": "create_work_order", "priority": "high", "category": "hvac"}
  }
  ```
- **Response 201:** Created threshold

### PUT /api/v1/iot/alert-thresholds/{id}
- **Auth:** role >= admin
- **Response 200:** Updated threshold

### GET /api/v1/energy/meters
- **Auth:** role >= viewer
- **Query params:** site_id, meter_type, status, zone
- **Response 200:** Meter list with current readings

### POST /api/v1/energy/meters
- **Auth:** role >= admin
- **Body:** Meter registration
- **Response 201:** Created meter

### GET /api/v1/energy/meters/{id}
- **Auth:** role >= viewer
- **Response 200:** Meter detail

### GET /api/v1/energy/meters/{id}/readings
- **Auth:** role >= viewer
- **Query params:** from, to, interval (15min / 1h / 1d / 1w / 1M)
- **Response 200:**
  ```json
  {
    "meter_id": "uuid",
    "meter_type": "electricity",
    "unit": "kWh",
    "interval": "1h",
    "data": [
      {"time": "2026-02-19T08:00:00+07:00", "consumption": 45.2, "power_avg_kw": 45.2, "power_peak_kw": 62.1, "cost": 135600}
    ],
    "total_consumption": 542.8,
    "total_cost": 1628400,
    "comparison": {"previous_period": 510.5, "change_percent": 6.3}
  }
  ```

### GET /api/v1/energy/consumption
- **Auth:** role >= viewer
- **Query params:**
  | Param | Type | Default | Description |
  |-------|------|---------|-------------|
  | site_id | uuid | required | Filter by site |
  | meter_type | MeterType | — | electricity / water / gas |
  | from | timestamptz | -30d | Start time |
  | to | timestamptz | now | End time |
  | group_by | text | day | hour / day / week / month |
  | zone | text | — | Filter by zone |
  | tenant_id | uuid | — | Sub-tenant billing |
- **Response 200:**
  ```json
  {
    "site_id": "uuid",
    "period": {"from": "2026-01-19", "to": "2026-02-19"},
    "electricity": {
      "total_kwh": 15420.5,
      "total_cost": 46261500,
      "peak_kw": 180.5,
      "by_zone": [
        {"zone": "Tầng 1-5", "kwh": 8200, "cost": 24600000},
        {"zone": "Tầng 6-10", "kwh": 7220.5, "cost": 21661500}
      ],
      "trend": [
        {"period": "2026-01-19", "kwh": 512.5},
        {"period": "2026-01-20", "kwh": 498.3}
      ]
    },
    "water": {
      "total_m3": 450.2,
      "total_cost": 5402400,
      "by_zone": []
    },
    "gas": {
      "total_m3": 120.0,
      "total_cost": 1800000
    },
    "esg": {
      "carbon_footprint_kg": 8520.3,
      "carbon_per_sqm": 2.1,
      "green_score": 72
    }
  }
  ```

### GET /api/v1/energy/reports
- **Auth:** role >= admin
- **Query params:** site_id, report_type (monthly / quarterly / annual / esg), period
- **Response 200:** Formatted consumption report

### POST /api/v1/energy/reports/schedule
- **Auth:** role >= admin
- **Body:**
  ```json
  {
    "site_id": "uuid",
    "report_type": "monthly",
    "meter_types": ["electricity", "water"],
    "recipients": ["uuid1", "uuid2"],
    "schedule": "0 8 1 * *",
    "format": "pdf"
  }
  ```
- **Response 201:** Scheduled report

### GET /api/v1/energy/rate-schedules
- **Auth:** role >= admin
- **Query params:** site_id, meter_type
- **Response 200:** Rate schedule list

### POST /api/v1/energy/rate-schedules
- **Auth:** role >= admin
- **Body:** Rate schedule definition
- **Response 201:** Created rate schedule

### GET /api/v1/iot/dashboard
- **Auth:** role >= viewer
- **Query params:** site_id
- **Response 200:**
  ```json
  {
    "sensors": {
      "total": 120,
      "online": 115,
      "offline": 3,
      "low_battery": 2,
      "alerts_active": 4
    },
    "environment": {
      "avg_temperature": 25.5,
      "avg_humidity": 65,
      "avg_co2": 650,
      "avg_pm25": 18,
      "air_quality": "good"
    },
    "energy_today": {
      "electricity_kwh": 245.8,
      "electricity_cost": 737400,
      "water_m3": 12.5,
      "gas_m3": 3.2
    },
    "active_alerts": [
      {"sensor": "Nhiệt độ Server Room", "value": 29.5, "threshold": 28, "severity": "critical"}
    ]
  }
  ```

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| dm3/{site}/iot/sensor/{device_id}/reading | device→server | 0 | `{"type":"temperature","value":26.5,"unit":"°C","battery":85,"ts":"..."}` | Sensor reading |
| dm3/{site}/iot/sensor/{device_id}/status | device→server | 1 | `{"online":true,"battery":85,"firmware":"1.2.3","rssi":-65}` | Sensor health |
| dm3/{site}/iot/sensor/{device_id}/config | server→device | 1 | `{"interval_sec":60,"thresholds":{"high":30,"low":18}}` | Remote sensor config |
| dm3/{site}/energy/meter/{device_id}/reading | device→server | 1 | `{"cumulative":15420.5,"power_kw":45.2,"voltage":220,"current":205,"pf":0.98,"ts":"..."}` | Energy meter reading |
| dm3/{site}/iot/alert/{alert_id} | server→client | 1 | `{"sensor_id":"...","type":"temperature","value":29.5,"threshold":28,"severity":"critical"}` | Alert notification |
| dm3/{site}/iot/gateway/{gw_id}/status | device→server | 1 | `{"online":true,"sensors_connected":15,"uptime_hours":720}` | IoT gateway health |

## Business Rules
1. **Reading validation:** IF sensor reading value outside physically possible range (e.g., temperature < -50°C or > 100°C) THEN mark quality = 'bad', do not trigger alerts, log anomaly.
2. **Stale data detection:** IF no reading from sensor for > 3× reading_interval_sec THEN mark sensor status = offline, alert if criticality warrants.
3. **Alert debouncing:** IF threshold exceeded THEN wait duration_sec before triggering alert. IF value returns to normal within duration THEN no alert. Prevents flapping.
4. **Cooldown enforcement:** IF alert already triggered within cooldown_min THEN suppress duplicate alerts. Log suppressed count.
5. **Cascading alerts:** IF > 3 sensors in same zone alert simultaneously THEN create "zone-level" aggregate alert instead of individual alerts.
6. **Energy anomaly detection:** IF consumption deviates > 30% from same-day-last-week baseline THEN flag as anomaly, alert facility manager.
7. **Peak demand tracking:** Track peak power demand per billing cycle. Alert when approaching contracted demand limit (80%, 90%, 95% thresholds).
8. **Sub-metering reconciliation:** IF sum of sub-meter readings deviates > 5% from parent meter THEN flag meter discrepancy for investigation.
9. **Auto work order:** IF alert severity = critical AND auto_action configured THEN create maintenance work order via maint-svc.
10. **ESG carbon calculation:** Carbon footprint = electricity_kwh × grid_emission_factor (Vietnam: 0.5527 kgCO2/kWh per EVN) + gas_m3 × 2.0 kgCO2/m3.
11. **Data retention tiering:** Raw readings: 30 days. 5-min aggregates: 1 year. Hourly aggregates: 5 years. Daily aggregates: permanent.
12. **Rate schedule application:** Apply correct rate based on time-of-use (peak/off-peak/shoulder), tiered blocks, or flat rate. Vietnamese electricity pricing follows EVN tariff schedules.
13. **Battery alert:** IF wireless sensor battery < 20% THEN alert. IF < 10% THEN critical alert. Track battery drain rate for replacement forecasting.
14. **Sensor calibration tracking:** Sensors have calibration_due date in metadata. Alert when calibration overdue.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| View sensor dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| View sensor readings | ✅ | ✅ | ✅ | ✅ | ✅ |
| View energy consumption | ✅ | ✅ | ✅ | ✅ | ✅ |
| View active alerts | ✅ | ✅ | ✅ | ✅ | ✅ |
| Acknowledge alerts | ❌ | ✅ | ✅ | ✅ | ✅ |
| Configure thresholds | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage sensors | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage energy meters | ❌ | ❌ | ✅ | ✅ | ✅ |
| Configure rate schedules | ❌ | ❌ | ❌ | ✅ | ✅ |
| Schedule reports | ❌ | ❌ | ✅ | ✅ | ✅ |
| Export data | ❌ | ✅ | ✅ | ✅ | ✅ |
| Delete sensors | ❌ | ❌ | ❌ | ✅ | ✅ |

## Offline Behavior
- **IoT gateway:** Gateways buffer sensor readings locally when server unreachable. Buffer capacity: 100,000 readings (~48h at 60s intervals for 30 sensors). On reconnection, bulk-upload with original timestamps.
- **Energy meters:** Smart meters continue recording consumption locally. Modbus/BACnet gateways buffer readings. No data loss for offline periods up to 7 days.
- **Sensors:** Battery-powered sensors continue operating independently. Sleep/wake cycle unchanged. Readings buffered at gateway level.
- **Alert processing:** Gateway can run basic threshold checks locally (configurable). Critical alerts (water leak, smoke) trigger local alarms even without server. Server-side complex rules (anomaly detection, cascading) only when online.
- **Sync strategy:** On reconnection, gateway uploads all buffered readings in time-ordered batches (1000 readings per batch). Server ingests via MQTT or REST bulk endpoint. Alert thresholds re-evaluated against buffered data.
- **Conflict resolution:** Readings are append-only, no conflicts. If duplicate readings (same sensor + timestamp), server deduplicates by (tenant_id, time, sensor_id) primary key.
- **Local storage:** Gateway buffer: 50-200MB depending on sensor count. TTL: auto-purge after successful server sync confirmation.

## UI Pages
| Route | Page | Key Components |
|-------|------|----------------|
| /operate/iot | Sensor dashboard | Floor plan overlay, sensor status grid, environment summary |
| /operate/iot/sensors | Sensor list | DataTable, type/status filters, batch actions |
| /operate/iot/sensors/:id | Sensor detail | Real-time chart, history, alert config, maintenance |
| /operate/iot/alerts | Alert management | Active alerts, history, threshold config |
| /operate/energy | Energy dashboard | Consumption overview, cost, ESG metrics, trends |
| /operate/energy/meters | Meter list | Meter tree (parent/sub), status, readings |
| /operate/energy/meters/:id | Meter detail | Real-time power, consumption chart, cost breakdown |
| /operate/energy/consumption | Consumption analysis | Multi-meter comparison, zone breakdown, export |
| /operate/energy/reports | Report center | Scheduled reports, on-demand generation, ESG |
| /operate/energy/rates | Rate configuration | Rate schedules, tariff editor |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| iot.sensor.created | POST create | full sensor | 1 year |
| iot.sensor.updated | PUT update | diff only | 1 year |
| iot.sensor.offline | No heartbeat | sensor_id + last_seen | 90 days |
| iot.sensor.online | Heartbeat restored | sensor_id + downtime_min | 90 days |
| iot.alert.triggered | Threshold exceeded | alert config + sensor + value | 1 year |
| iot.alert.resolved | Value normalized | alert_id + duration_min | 1 year |
| iot.alert.acknowledged | Operator ACK | alert_id + actor | 1 year |
| iot.threshold.created | POST threshold | full threshold | 1 year |
| iot.threshold.updated | PUT threshold | diff only | 1 year |
| energy.meter.created | POST meter | full meter | 1 year |
| energy.anomaly.detected | Anomaly detection | meter_id + expected + actual + deviation | 1 year |
| energy.report.generated | Report created | report_type + period + recipients | 90 days |
| energy.rate.updated | Rate change | old_rate + new_rate + effective_date | permanent |

## Integration Points
- **Depends on:** device-gw (sensor/meter device management, protocol adapters), tenant-svc (site hierarchy, zone mapping), notif-svc (alert notifications), auth-svc (JWT)
- **Consumed by:** analytics/report-svc (energy dashboards, ESG reports), automate-svc (sensor triggers → actions), maintenance-svc (sensor alert → auto work order), ai-asst-svc (sensor queries), booking-svc (occupancy sensor data), parking-svc (occupancy sensors)
- **External:** IoT gateways (Zigbee coordinators, LoRa gateways), BMS systems (BACnet/Modbus), smart meters (Modbus RTU/TCP), weather APIs (for HVAC optimization)

## Notes
- TimescaleDB continuous aggregates provide pre-computed rollups for fast dashboard queries
- Vietnamese electricity tariff (biểu giá điện EVN) has 6 tiers for residential + time-of-use for commercial — rate_schedule supports both
- Water pricing varies by province — Saigon Water (SAWACO) rates differ from Hanoi (VIWASUPCO)
- ESG reporting follows GRI Standards (Global Reporting Initiative) for sustainability metrics
- Consider BMS integration (BACnet/IP) for HVAC control based on sensor data in Phase 3
- Air quality index calculation follows Vietnamese QCVN 05:2023/BTNMT standards
- LoRaWAN support for large campus deployments where WiFi/Zigbee range insufficient
