# Feature: AI Assistant

> Domain: SMART | Color: #9C27B0 | Priority: P1
> Status: Draft | Owner: ai-asst-svc team

## Overview
The AI Assistant provides a natural language interface for querying building data, executing commands, generating reports, and troubleshooting issues across all DM3 domains. Runs on-premise using local LLM (Ollama/vLLM) for data privacy. Supports Vietnamese and English, respects user permissions, maintains conversation history, and suggests contextual actions. Available via web console chat panel, guard station voice, and mobile app.

## Data Models

### Conversation
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| user_id | uuid | yes | — | User who started conversation |
| title | text | no | — | Auto-generated conversation title |
| language | text | yes | vi | vi / en |
| interface | text | yes | web | web / mobile / voice / guard_station |
| status | text | yes | active | active / archived |
| message_count | int | yes | 0 | Total messages |
| last_message_at | timestamptz | no | — | Last activity |
| context | jsonb | no | {} | Conversation context (current page, selected entity, etc.) |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |
| updated_at | timestamp | yes | now() | Last update |

### Message
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| conversation_id | uuid | yes | — | Conversation reference |
| role | text | yes | — | user / assistant / system / tool |
| content | text | yes | — | Message text |
| language | text | yes | — | Detected/used language |
| intent | text | no | — | Detected intent (query / command / report / troubleshoot) |
| entities | jsonb | no | — | Extracted entities [{type, value, resolved_id}] |
| tool_calls | jsonb | no | — | Function calls made [{function, args, result}] |
| suggested_actions | jsonb | no | — | UI action suggestions [{label, action, params}] |
| sources | jsonb | no | — | Data sources referenced [{service, endpoint, data_summary}] |
| tokens_input | int | no | — | Input tokens used |
| tokens_output | int | no | — | Output tokens generated |
| latency_ms | int | no | — | Response time |
| feedback | text | no | — | User feedback (thumbs_up / thumbs_down) |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |

### AICommand
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| tenant_id | uuid | yes | — | Tenant reference |
| user_id | uuid | yes | — | Requesting user |
| conversation_id | uuid | no | — | Related conversation |
| command_type | text | yes | — | door_unlock / door_lock / report_generate / alarm_arm / etc. |
| target_service | text | yes | — | Target microservice |
| target_endpoint | text | yes | — | API endpoint called |
| parameters | jsonb | yes | — | Command parameters |
| requires_confirmation | bool | yes | — | Did user need to confirm? |
| confirmed | bool | no | — | Was it confirmed? |
| status | text | yes | pending | pending / confirmed / executed / failed / denied |
| result | jsonb | no | — | Execution result |
| error | text | no | — | Error message if failed |
| executed_at | timestamptz | no | — | Execution time |
| created_at | timestamp | yes | now() | Creation time |

### AIFunctionRegistry
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | uuid | yes | auto | Primary key |
| name | text | yes | — | Function name (e.g., "get_door_status") |
| description | text | yes | — | What this function does (for LLM) |
| domain | text | yes | — | secure / manage / operate / smart / platform |
| parameters_schema | jsonb | yes | — | JSON Schema for parameters |
| required_permissions | text[] | yes | — | Required user permissions |
| risk_level | text | yes | low | low / medium / high / critical |
| requires_confirmation | bool | yes | — | Requires user confirmation before execution |
| target_service | text | yes | — | gRPC/REST target service |
| target_method | text | yes | — | Method to call |
| enabled | bool | yes | true | Active flag |
| metadata | jsonb | no | {} | Custom fields |
| created_at | timestamp | yes | now() | Creation time |

### Enums
```
Intent: query | command | report | troubleshoot | general
RiskLevel: low (read-only queries) | medium (status changes) | high (access control) | critical (emergency actions)
```

## API Endpoints

### POST /api/v1/ai/chat
- **Auth:** Bearer token, any authenticated user
- **Headers:** `Accept: text/event-stream` (for streaming)
- **Body:**
  ```json
  {
    "conversation_id": "uuid",
    "message": "Hôm nay có bao nhiêu khách đến tòa nhà?",
    "language": "vi",
    "context": {
      "current_page": "/manage/visitors",
      "selected_site_id": "uuid"
    }
  }
  ```
- **Response 200 (SSE stream):**
  ```
  data: {"type":"thinking","content":"Đang truy vấn dữ liệu khách..."}
  data: {"type":"tool_call","function":"get_visitor_count","args":{"site_id":"uuid","date":"2026-02-19"}}
  data: {"type":"tool_result","function":"get_visitor_count","result":{"total":42,"checked_in":38,"pending":4}}
  data: {"type":"content","content":"Hôm nay tòa nhà có **42 khách đăng ký**, trong đó **38 khách đã check-in** và **4 khách đang chờ**."}
  data: {"type":"suggested_actions","actions":[{"label":"Xem danh sách khách","action":"navigate","params":{"route":"/manage/visitors?date=today"}},{"label":"Xuất báo cáo","action":"generate_report","params":{"type":"visitor_daily"}}]}
  data: {"type":"done","tokens_input":245,"tokens_output":89,"latency_ms":1200}
  ```

### POST /api/v1/ai/commands
- **Auth:** Bearer token, permissions checked per command
- **Body:**
  ```json
  {
    "command": "Mở cửa phòng họp Lotus",
    "conversation_id": "uuid",
    "confirm": true
  }
  ```
- **Validation:** Check user has door.unlock permission, resolve "phòng họp Lotus" to door ID
- **Side effects:** Execute command via target service, audit log
- **Response 200:**
  ```json
  {
    "command_id": "uuid",
    "command_type": "door_unlock",
    "target": {"door_id": "uuid", "door_name": "Phòng họp Lotus"},
    "status": "executed",
    "result": {"success": true, "message": "Đã mở cửa phòng họp Lotus"},
    "requires_confirmation": true,
    "confirmed": true
  }
  ```
- **Errors:** 403 (insufficient permissions), 404 (entity not found), 422 (ambiguous command)

### GET /api/v1/ai/conversations
- **Auth:** Bearer token
- **Query params:** page, limit, status, from, to
- **Response 200:** User's conversation list

### GET /api/v1/ai/conversations/{id}
- **Auth:** conversation owner
- **Response 200:** Conversation with all messages

### DELETE /api/v1/ai/conversations/{id}
- **Auth:** conversation owner
- **Response 204:** Deleted

### POST /api/v1/ai/conversations/{id}/messages/{msg_id}/feedback
- **Auth:** conversation owner
- **Body:** `{"feedback": "thumbs_up"}` or `{"feedback": "thumbs_down", "comment": "Sai thông tin"}`
- **Response 200:** Feedback recorded

### GET /api/v1/ai/functions
- **Auth:** role >= admin
- **Response 200:** Available function registry (filtered by user permissions)

### GET /api/v1/ai/usage
- **Auth:** role >= admin
- **Query params:** site_id, from, to, user_id
- **Response 200:**
  ```json
  {
    "period": {"from": "2026-02-01", "to": "2026-02-19"},
    "total_conversations": 1250,
    "total_messages": 8500,
    "total_commands": 320,
    "tokens_used": {"input": 2500000, "output": 850000},
    "top_intents": [
      {"intent": "query", "count": 5200},
      {"intent": "command", "count": 1800},
      {"intent": "report", "count": 900}
    ],
    "top_functions": [
      {"function": "get_access_events", "count": 1200},
      {"function": "get_visitor_count", "count": 800}
    ],
    "satisfaction": {"thumbs_up": 750, "thumbs_down": 45, "rate": 94.3}
  }
  ```

## MQTT Topics

| Topic | Direction | QoS | Payload Schema | Description |
|-------|-----------|-----|----------------|-------------|
| dm3/{site}/ai/voice/{station_id}/input | device→server | 1 | `{"audio_ref":"...","language":"vi","user_id":"..."}` | Voice input from guard station |
| dm3/{site}/ai/voice/{station_id}/output | server→device | 1 | `{"text":"...","audio_ref":"...","actions":[]}` | Voice response to guard station |

## Business Rules
1. **Permission enforcement:** AI MUST check user permissions before executing any function call. IF user lacks permission THEN respond "Bạn không có quyền thực hiện thao tác này" and suggest contacting admin.
2. **Confirmation for risky actions:** IF function.risk_level >= high THEN require explicit user confirmation before execution. Show what will happen and ask "Bạn có chắc chắn muốn...?"
3. **Context awareness:** AI uses conversation context (current page, selected site, recent interactions) to disambiguate queries. "Mở cửa này" on door detail page → unlock that specific door.
4. **Entity resolution:** IF user references entity by name (e.g., "Phòng họp Lotus") THEN resolve to UUID via identity/facility lookup. IF ambiguous (multiple matches) THEN ask user to clarify.
5. **Language detection:** Auto-detect input language (VI/EN). Respond in same language. Support code-switching (Vietnamese with English technical terms).
6. **Rate limiting:** Max 60 messages per user per hour. Max 10 commands per user per hour. Configurable per tenant.
7. **Data scope:** AI can only query data within user's permitted sites and tenants. Cross-tenant queries blocked.
8. **Conversation retention:** Conversations retained for 90 days. Users can delete their own conversations. Admin can view conversation logs for audit.
9. **Fallback behavior:** IF LLM unavailable THEN respond with "Hệ thống AI tạm thời không khả dụng. Vui lòng thử lại sau." and suggest manual navigation.
10. **Audit trail:** ALL commands executed via AI are logged in audit-svc with conversation_id for traceability.
11. **No data leakage:** AI must not reveal data from other users' conversations or data outside the user's permission scope, even if prompted.
12. **Voice mode safety:** Voice commands for critical actions (lockdown, fire mode) require PIN confirmation in addition to voice.

## Permissions Matrix

| Action | viewer | operator | admin | site_admin | super_admin |
|--------|--------|----------|-------|------------|-------------|
| Chat (queries) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Execute read commands | ✅ | ✅ | ✅ | ✅ | ✅ |
| Execute write commands | ❌ | ✅ | ✅ | ✅ | ✅ |
| Execute access commands | ❌ | ✅* | ✅ | ✅ | ✅ |
| Execute emergency commands | ❌ | ❌ | ✅ | ✅ | ✅ |
| View own conversations | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all conversations | ❌ | ❌ | ❌ | ✅ | ✅ |
| View AI usage stats | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage function registry | ❌ | ❌ | ❌ | ❌ | ✅ |
| Voice commands | ❌ | ✅ | ✅ | ✅ | ✅ |

*\* operator limited to doors/devices they have explicit access to*

## Offline Behavior
- **Web/Mobile app:** AI chat unavailable when offline. Show cached conversation history (read-only). Display "AI không khả dụng — offline" message.
- **Guard station voice:** Offline voice commands limited to pre-configured local actions (emergency door unlock, alarm trigger) processed by edge device without LLM.
- **Sync strategy:** When online, pending feedback submissions synced. No offline message queuing (AI responses require real-time LLM processing).
- **Conflict resolution:** N/A — AI chat is inherently online-only.
- **Local storage:** Conversation history cached: last 10 conversations, ~2MB. Function registry cached for permission display.

## UI Pages
| Route | Page | Key Components |
|-------|------|----------------|
| — (global panel) | Chat panel | Slide-out panel on right side, available on all pages |
| /smart/ai | Full chat view | Full-page chat, conversation list sidebar |
| /smart/ai/conversations | Conversation history | Conversation list, search, filters |
| /smart/ai/usage | Usage analytics | Token usage, satisfaction, top queries (admin) |

## Events & Audit Log

| Event Type | Trigger | Payload | Retention |
|------------|---------|---------|-----------|
| ai.conversation.created | New conversation | conversation_id + user_id + interface | 90 days |
| ai.message.sent | User message | conversation_id + intent + entities | 90 days |
| ai.command.requested | Command identified | command details + risk_level | 1 year |
| ai.command.confirmed | User confirmed | command_id + user_id | 1 year |
| ai.command.executed | Command executed | command_id + result + target_service | permanent |
| ai.command.denied | Permission denied | command_id + user_id + required_perm | 1 year |
| ai.command.failed | Execution error | command_id + error | 1 year |
| ai.feedback.submitted | User feedback | message_id + feedback + comment | 1 year |
| ai.function.called | Function invoked | function_name + args + user_id | 90 days |

## Integration Points
- **Depends on:** ALL other services (AI queries across all domains via gRPC/REST), auth-svc (permission validation), identity-svc (entity resolution), tenant-svc (site context)
- **Consumed by:** Guard station (voice interface), mobile app (chat), web console (chat panel)
- **External:** Ollama / vLLM (local LLM inference), speech-to-text engine (Whisper for Vietnamese), text-to-speech (for guard station voice responses)

## Notes
- LLM runs on-premise for data privacy — recommended: Llama 3.1 70B or Qwen2.5-72B for Vietnamese support
- Function calling approach: LLM selects from registered functions, parameters validated against JSON Schema before execution
- Vietnamese NLP considerations: diacritics handling, Southern vs Northern dialect awareness, common abbreviations (TP.HCM, Q.1, P.BT)
- Voice input uses Whisper (large-v3) for Vietnamese speech recognition — runs on GPU alongside LLM
- Guard station voice UX: wake word "Hey Duall" → listen → process → respond via speaker
- Consider fine-tuning smaller model (7B) on DM3-specific Q&A pairs for faster response on commodity hardware
- Token usage tracking for cost allocation in multi-tenant deployments
