#!/usr/bin/env python3
"""Build a professional, Vietnamese-localized PDF of the DM3 API reference.

Pipeline:
  1. Load the committed OpenAPI spec (docs/swagger.json).
  2. Render a custom HTML document (cover + table of contents + per-tag sections).
  3. Use Playwright Chromium to (a) compute per-section page numbers and (b)
     print the final HTML to PDF with page footers.

Output: docs/api-reference.pdf
"""
from __future__ import annotations

import base64
import html as html_mod
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
DOCS = BACKEND / "docs"
REPO = BACKEND.parent
LOGO_SRC = REPO / "apps/console/public/logo.png"

BRAND_PRIMARY = "#3B82F6"
BRAND_BG = "#0B1120"

# ─── Standard Duali front-matter (fixed boilerplate, Vietnamese) ─────────────
# This mirrors the copyright + disclaimer pages used on every Duali document.
FRONT_COPYRIGHT = (
    "Bản quyền © 2026 DUALi Inc. Bảo lưu mọi quyền. Nghiêm cấm sao chép, tiết lộ, "
    "phân phối hoặc sử dụng tài liệu này, toàn bộ hay một phần, cho bất kỳ mục đích "
    "nào khác ngoài mục đích mà tài liệu này được cung cấp. Tài liệu này có bản quyền "
    "và chứa thông tin mật cũng như các quyền sở hữu trí tuệ khác của DUALi Inc. "
    "Mọi hành vi sử dụng, sao chép, tiết lộ hoặc phân phối trái phép đều bị coi là "
    "xâm phạm quyền sở hữu trí tuệ của DUALi."
)

FRONT_DISCLAIMER_PARAGRAPHS = [
    (
        "DUALi Inc. có quyền thay đổi các ứng dụng hoặc dịch vụ của mình hoặc ngừng "
        "bất kỳ ứng dụng hoặc dịch vụ nào vào bất kỳ lúc nào mà không cần thông báo. "
        "DUALi cung cấp hỗ trợ khách hàng trong các lĩnh vực kỹ thuật khác nhau, "
        "nhưng không có toàn quyền truy cập vào dữ liệu liên quan đến việc sử dụng "
        "sản phẩm và ứng dụng của khách hàng."
    ),
    (
        "Do đó, DUALi không có trách nhiệm và không chịu trách nhiệm về các ứng dụng "
        "hoặc phần mềm của khách hàng hoặc các hoạt động liên quan đến hệ thống hoặc "
        "ứng dụng của các sản phẩm của DUALi. Ngoài ra, DUALi không có trách nhiệm "
        "pháp lý và không chịu trách nhiệm về việc vi phạm bằng sáng chế và/hoặc bất "
        "kỳ quyền sở hữu hoặc sở hữu công nghiệp nào của bên thứ ba, mà có thể ảnh "
        "hưởng đến sự hỗ trợ của DUALi."
    ),
    (
        "Thông tin trong hướng dẫn sử dụng này được soạn thảo theo hiểu biết tốt nhất "
        "của chúng tôi. Giao diện của bạn có thể sẽ khác và không giống với tài liệu "
        "hướng dẫn này tùy thuộc vào gói dịch vụ mà bạn đang sử dụng. DUALi không đảm "
        "bảo tính đúng đắn và đầy đủ của các chi tiết được đưa ra trong hướng dẫn sử "
        "dụng này và có thể không chịu trách nhiệm về những thiệt hại xảy ra do thông "
        "tin không chính xác hoặc không đầy đủ đó. Mặc dù chúng tôi đã cố gắng hết "
        "sức, nhưng các sai sót có thể không hoàn toàn tránh được, chúng tôi hoan "
        "nghênh mọi ý kiến đóng góp. Trung tâm phát triển của chúng tôi, tại Hàn "
        "Quốc, luôn sẵn sàng hỗ trợ kỹ thuật. Để được hỗ trợ, hãy liên hệ với nhóm "
        "hỗ trợ của chúng tôi theo thông tin dưới đây;"
    ),
]

FRONT_CONTACT_LINES = [
    "Tel: +82 31 213 0074",
    "E-mail: sales@duali.com, support@demasterpro.com",
]

# ─── Vietnamese chrome strings (UI labels only — API content stays source) ──
L = {
    "cover_subtitle": "Tài liệu tham chiếu REST API",
    "cover_tag": "Nền tảng kiểm soát truy cập & tòa nhà thông minh",
    "toc": "Mục lục",
    "overview": "Tổng quan",
    "auth_section": "Xác thực API",
    "auth_body": (
        "Toàn bộ endpoint đều thuộc phạm vi tenant, xác thực bằng header "
        "<code>Authorization: Bearer &lt;token&gt;</code>. "
        "Token API có tiền tố <code>dm3_live_</code> (môi trường thật) hoặc "
        "<code>dm3_test_</code> (sandbox). "
        "Phát hành token trong <i>Settings → API Integration</i>."
    ),
    "rate_section": "Giới hạn tần suất",
    "rate_body": (
        "Mặc định 60 yêu cầu / phút cho mỗi token. Vượt giới hạn trả về "
        "<code>HTTP 429</code>."
    ),
    "envelope_section": "Định dạng phản hồi",
    "envelope_body": (
        "Phản hồi thành công trả về dữ liệu trực tiếp; phản hồi lỗi theo cấu trúc "
        "<code>{ &quot;error&quot;: &quot;&lt;code&gt;&quot;, "
        "&quot;message&quot;: &quot;&lt;human readable&gt;&quot; }</code>."
    ),
    "endpoints": "Danh sách endpoint",
    "parameters": "Tham số",
    "path_params": "Tham số đường dẫn",
    "query_params": "Tham số truy vấn",
    "header_params": "Tham số header",
    "body_params": "Nội dung yêu cầu",
    "responses": "Phản hồi",
    "required": "bắt buộc",
    "security": "Yêu cầu xác thực",
    "deprecated": "KHÔNG CÒN DÙNG",
    "col_name": "Tên",
    "col_type": "Kiểu",
    "col_required": "Bắt buộc",
    "col_desc": "Mô tả",
    "col_status": "Mã",
    "col_example": "Ví dụ",
    "sample_response": "Ví dụ phản hồi",
    "sample_request": "Ví dụ yêu cầu",
    "no_desc": "(chưa có mô tả)",
    "page": "Trang",
    "generated": "Tài liệu tự sinh từ nguồn — Duall Master 3.0",
}

# ─── Vietnamese names for the biggest tag groups ────────────────────────────
TAG_VI = {
    "Access": "Kiểm soát truy cập",
    "Access Groups": "Nhóm truy cập",
    "Access Points": "Điểm truy cập",
    "Access Events": "Sự kiện truy cập",
    "Auth": "Xác thực & phiên đăng nhập",
    "Authentication": "Xác thực & phiên đăng nhập",
    "Companies": "Công ty (tenant)",
    "Users": "Người dùng",
    "Identity": "Danh tính",
    "Identities": "Danh tính",
    "Devices": "Thiết bị",
    "Audit": "Nhật ký kiểm toán",
    "Audit Logs": "Nhật ký kiểm toán",
    "Attendance": "Chấm công & nghỉ phép",
    "Visitors": "Quản lý khách",
    "Parking": "Bãi đỗ xe",
    "CCTV": "Camera giám sát",
    "Zones": "Khu vực",
    "Schedules": "Lịch biểu",
    "Sites": "Địa điểm",
    "Credentials": "Thông tin xác thực",
    "API Tokens": "Token API",
    "OAuth": "OAuth2",
    "Roles": "Vai trò",
    "Tenants": "Tenant",
    "Settings": "Cấu hình",
    "System": "Hệ thống",
    "Plugins": "Plugin",
    "Organizations": "Tổ chức",
    "Dashboard": "Bảng điều khiển",
    "Reports": "Báo cáo",
}

METHOD_COLORS = {
    "GET": "#3B82F6",
    "POST": "#10B981",
    "PUT": "#F59E0B",
    "PATCH": "#8B5CF6",
    "DELETE": "#EF4444",
    "HEAD": "#64748B",
    "OPTIONS": "#64748B",
}

# ─── Vietnamese overview (replaces spec's English info.description) ──────────
OVERVIEW_VI = (
    "API nền tảng kiểm soát truy cập & tòa nhà thông minh, triển khai theo mô "
    "hình đa tenant.<br><br>"
    "Toàn bộ endpoint được giới hạn phạm vi theo tenant thông qua header "
    "<code>Authorization: Bearer dm3_live_...</code> hoặc <code>dm3_test_...</code>. "
    "Phát hành token tại <i>Settings → API Integration</i>. Token có tiền tố "
    "<code>dm3_live_</code> tác động lên dữ liệu thật; <code>dm3_test_</code> là "
    "môi trường sandbox.<br><br>"
    "Giới hạn mặc định là 60 yêu cầu/phút trên mỗi token. Phản hồi theo cấu trúc "
    "nhất quán: phản hồi thành công trả về tài nguyên trực tiếp, phản hồi lỗi trả "
    "về <code>{ &quot;error&quot;: &quot;&lt;code&gt;&quot;, "
    "&quot;message&quot;: &quot;&lt;human readable&gt;&quot; }</code>."
)

# ─── Per-endpoint Vietnamese summary & description overrides ────────────────
# Keyed by "METHOD /path". Falls back to spec text if missing.
SUMMARY_VI = {
    "GET /access/events": "Lịch sử truy cập",
    "GET /access/events/export": "Xuất lịch sử truy cập ra CSV/XLSX",
    "GET /access/groups": "Danh sách nhóm truy cập",
    "POST /access/groups": "Tạo nhóm truy cập",
    "GET /access/groups/{id}": "Lấy thông tin nhóm truy cập",
    "PUT /access/groups/{id}": "Cập nhật nhóm truy cập",
    "DELETE /access/groups/{id}": "Xóa nhóm truy cập",
    "GET /attendance/holidays": "Danh sách ngày nghỉ lễ",
    "GET /attendance/me/attendance": "Chấm công của tôi",
    "POST /attendance/me/leave/requests": "Gửi đơn xin nghỉ phép",
    "GET /audit/export": "Xuất nhật ký kiểm toán ra CSV",
    "GET /audit/logs": "Danh sách nhật ký kiểm toán",
    "GET /audit/logs/{id}": "Lấy một bản ghi kiểm toán",
    "GET /auth/api-tokens": "Danh sách token API",
    "POST /auth/login": "Đăng nhập",
    "POST /auth/logout": "Đăng xuất",
    "GET /auth/me": "Lấy hồ sơ của tôi",
    "POST /auth/refresh": "Làm mới token phiên",
    "GET /auth/system/companies": "Danh sách công ty",
    "POST /auth/system/companies": "Tạo công ty",
    "GET /auth/system/companies/{id}": "Lấy thông tin công ty",
    "PUT /auth/system/companies/{id}": "Cập nhật công ty",
    "DELETE /auth/system/companies/{id}": "Xóa mềm một công ty",
    "GET /cctv/cameras": "Danh sách camera",
    "POST /cctv/cameras": "Tạo camera",
    "GET /cctv/cameras/{id}": "Lấy thông tin camera",
    "GET /gateway/devices": "Danh sách thiết bị",
    "POST /gateway/devices": "Tạo thiết bị",
    "GET /gateway/devices/{id}": "Lấy thông tin thiết bị",
    "PUT /gateway/devices/{id}": "Cập nhật thiết bị",
    "DELETE /gateway/devices/{id}": "Xóa thiết bị",
    "GET /identity/users": "Danh sách người dùng",
    "POST /identity/users": "Tạo người dùng",
    "GET /identity/users/{id}": "Lấy thông tin người dùng",
    "PUT /identity/users/{id}": "Cập nhật người dùng",
    "DELETE /identity/users/{id}": "Xóa người dùng",
    "GET /parking/sessions": "Danh sách phiên đỗ xe",
    "GET /parking/vehicles": "Danh sách phương tiện đỗ xe",
    "POST /parking/vehicles": "Tạo phương tiện đỗ xe",
    "GET /visitors": "Danh sách lượt khách",
    "POST /visitors": "Tạo lượt khách",
    "GET /visitors/{id}": "Lấy thông tin lượt khách",
    "PUT /visitors/{id}": "Cập nhật lượt khách",
    "POST /visitors/{id}/checkin": "Ghi nhận khách đến",
}

# Common parameter / response descriptions emitted by swag annotations.
# Keys are matched case-insensitively; fragments match exactly.
COMMON_VI = {
    # ── identifiers ────────────────────────────────────────────────────────
    "access group id (uuid)": "ID nhóm truy cập (UUID)",
    "audit log entry uuid": "UUID bản ghi kiểm toán",
    "camera uuid": "UUID camera",
    "company uuid": "UUID công ty",
    "device id (uuid)": "ID thiết bị (UUID)",
    "user id (uuid)": "ID người dùng (UUID)",
    "visit uuid": "UUID lượt khách",

    # ── pagination / sorting ──────────────────────────────────────────────
    "page number": "Số trang",
    "page number (1-indexed)": "Số trang (bắt đầu từ 1)",
    "page number (default 1)": "Số trang (mặc định 1)",
    "page size": "Kích thước trang",
    "page size (default 20)": "Kích thước trang (mặc định 20)",
    "page size (default 20, max 100)": "Kích thước trang (mặc định 20, tối đa 100)",
    "page size (max 200)": "Kích thước trang (tối đa 200)",
    "sort field": "Trường sắp xếp",
    "sort direction": "Hướng sắp xếp",

    # ── filters ────────────────────────────────────────────────────────────
    "filter by action": "Lọc theo hành động",
    "filter by action (e.g. user.create)": "Lọc theo hành động (ví dụ: user.create)",
    "filter by active status": "Lọc theo trạng thái hoạt động",
    "filter by actor email (partial match)": "Lọc theo email người thao tác (khớp một phần)",
    "filter by actor user uuid": "Lọc theo UUID người thao tác",
    "filter by access point uuid": "Lọc theo UUID điểm truy cập",
    "filter by bound access point uuid": "Lọc theo UUID điểm truy cập liên kết",
    "filter by credential type": "Lọc theo loại thông tin xác thực",
    "filter by credential type (face, card, pin, qr, plate)":
        "Lọc theo loại thông tin xác thực (face, card, pin, qr, plate)",
    "filter by decision (granted, denied)": "Lọc theo quyết định (granted, denied)",
    "filter by connection status": "Lọc theo trạng thái kết nối",
    "filter by department id (repeatable)": "Lọc theo ID phòng ban (có thể lặp lại)",
    "filter by device id, name, or location": "Lọc theo ID thiết bị, tên, hoặc vị trí",
    "filter by device type": "Lọc theo loại thiết bị",
    "filter by emitting service": "Lọc theo dịch vụ phát sinh",
    "filter by emitting service (e.g. auth-svc)": "Lọc theo dịch vụ phát sinh (ví dụ: auth-svc)",
    "filter by entity uuid": "Lọc theo UUID đối tượng",
    "filter by entity type": "Lọc theo loại đối tượng",
    "filter by entity type (e.g. user, device)": "Lọc theo loại đối tượng (ví dụ: user, device)",
    "filter by expected_arrival date (yyyy-mm-dd)": "Lọc theo ngày dự kiến đến (YYYY-MM-DD)",
    "filter by host user uuid": "Lọc theo UUID người tiếp đón",
    "filter by name (ilike)": "Lọc theo tên (ILIKE)",
    "filter by session status (active, exited, voided)": "Lọc theo trạng thái phiên (active, exited, voided)",
    "filter by status": "Lọc theo trạng thái",
    "filter by status (online, offline, error)": "Lọc theo trạng thái (online, offline, error)",
    "filter by status (repeatable)": "Lọc theo trạng thái (có thể lặp lại)",
    "filter by status (success, failure)": "Lọc theo trạng thái (success, failure)",
    "filter by tenant uuid (system admin only)": "Lọc theo UUID tenant (chỉ dành cho quản trị hệ thống)",
    "filter by vehicle plate": "Lọc theo biển số xe",
    "filter by vehicle type": "Lọc theo loại phương tiện",
    "filter by visit status": "Lọc theo trạng thái lượt khách",
    "filter by year (defaults to current year)": "Lọc theo năm (mặc định là năm hiện tại)",
    "partial match on name or code": "Khớp một phần theo tên hoặc mã",
    "partial match on plate, owner name, or phone": "Khớp một phần theo biển số, tên chủ xe, hoặc số điện thoại",
    "search by name or email": "Tìm theo tên hoặc email",

    # ── time windows ───────────────────────────────────────────────────────
    "iso date (yyyy-mm-dd) end of window. defaults to today.":
        "Ngày ISO (YYYY-MM-DD) kết thúc khoảng. Mặc định là hôm nay.",
    "iso date (yyyy-mm-dd) start of window. defaults to first day of current month.":
        "Ngày ISO (YYYY-MM-DD) bắt đầu khoảng. Mặc định là ngày đầu tháng hiện tại.",
    "iso-8601 end of entry window": "Mốc kết thúc (ISO-8601)",
    "iso-8601 end timestamp": "Thời điểm kết thúc (ISO-8601)",
    "iso-8601 start of entry window": "Mốc bắt đầu (ISO-8601)",
    "iso-8601 start timestamp": "Thời điểm bắt đầu (ISO-8601)",

    # ── request bodies ─────────────────────────────────────────────────────
    "access group fields": "Trường dữ liệu của nhóm truy cập",
    "camera payload (name, type, rtsp_url or hanet_device_id, access_point_id, etc.)":
        "Dữ liệu camera (name, type, rtsp_url hoặc hanet_device_id, access_point_id, v.v.)",
    "company payload (name, code, plugins[], admin email, etc.)":
        "Dữ liệu công ty (name, code, plugins[], email quản trị, v.v.)",
    "device fields to update": "Trường cần cập nhật cho thiết bị",
    "device fields: device_id (hardware id, required), name, type, model, location, firmware_version":
        "Trường thiết bị: device_id (id phần cứng, bắt buộc), name, type, model, location, firmware_version",
    "fields to update": "Trường cần cập nhật",
    "fields to update (all optional)": "Trường cần cập nhật (đều tùy chọn)",
    "leave request (policy_id, start_date, end_date, half_day, reason)":
        "Đơn xin nghỉ (policy_id, start_date, end_date, half_day, reason)",
    "optional check-in metadata": "Thông tin check-in tùy chọn",
    "subset of user fields to update": "Tập con trường người dùng cần cập nhật",
    "user fields: first_name, last_name, email, phone, department_id, position, status, access_group_id, effective_date, expired_date":
        "Trường người dùng: first_name, last_name, email, phone, department_id, position, status, access_group_id, effective_date, expired_date",
    "vehicle payload (plate, owner_name, phone, vehicle_type, pass_id, etc.)":
        "Dữ liệu phương tiện (plate, owner_name, phone, vehicle_type, pass_id, v.v.)",
    "visit payload (first_name, last_name, email, expected_arrival, host_user_id, etc.)":
        "Dữ liệu lượt khách (first_name, last_name, email, expected_arrival, host_user_id, v.v.)",
    "{ email, password }": "{ email, password }",
    "{ refresh_token }": "{ refresh_token }",

    # ── response phrases ───────────────────────────────────────────────────
    "account locked after 5 failed attempts (15 min cooldown)":
        "Tài khoản bị khóa sau 5 lần đăng nhập sai (tạm khóa 15 phút)",
    "api_integration plugin not enabled": "Plugin api_integration chưa được bật",
    "bad request": "Yêu cầu không hợp lệ",
    "created": "Đã tạo",
    "csv file download": "Tải về tệp CSV",
    "device_id already registered": "device_id đã được đăng ký",
    "either { access_token, refresh_token, user } or { companies: [] } when disambiguation is needed":
        "Trả về { access_token, refresh_token, user } hoặc { companies: [] } khi cần chọn công ty",
    "email or employee number already exists": "Email hoặc mã nhân viên đã tồn tại",
    "forbidden": "Từ chối truy cập",
    "internal server error": "Lỗi máy chủ nội bộ",
    "missing or invalid bearer token": "Thiếu hoặc sai bearer token",
    "no content": "Không có nội dung",
    "not a system admin": "Không phải quản trị hệ thống",
    "not found": "Không tìm thấy",
    "not found or already suspended": "Không tìm thấy hoặc đã bị tạm ngưng",
    "ok": "OK",
    "paginated list": "Danh sách có phân trang",
    "paginated list of access events": "Danh sách sự kiện truy cập có phân trang",
    "paginated list with data and pagination envelope":
        "Danh sách có phân trang kèm envelope dữ liệu và phân trang",
    "csv or xlsx file download": "Tải về tệp CSV hoặc XLSX",
    "result exceeds 50,000 row export limit": "Vượt giới hạn xuất 50.000 dòng",
    "output format (csv or xlsx, default csv)": "Định dạng đầu ra (csv hoặc xlsx, mặc định csv)",
    "paginated user list with total count": "Danh sách người dùng có phân trang kèm tổng số",
    "status: deleted": "status: deleted",
    "too many requests": "Vượt giới hạn tần suất",
    "unauthorized": "Chưa xác thực",
    "user not found or not in tenant": "Không tìm thấy người dùng hoặc không thuộc tenant",
    "validation error": "Lỗi kiểm tra dữ liệu",
    "{ access_token, refresh_token }": "{ access_token, refresh_token }",
}


def translate_common(text: str) -> str:
    """Look up a common English phrase in COMMON_VI (case-insensitive)."""
    if not text:
        return text
    key = text.strip().lower()
    return COMMON_VI.get(key, text)


DESC_VI = {
    "GET /access/events":
        "Trả về lịch sử sự kiện truy cập có phân trang cho tenant của người "
        "gọi. Hỗ trợ lọc theo điểm truy cập, người dùng, loại quyết định "
        "(granted/denied), loại thông tin xác thực và khoảng thời gian "
        "ISO-8601. Kết quả sắp xếp theo thời gian mới nhất trước.",
    "GET /access/events/export":
        "Xuất lịch sử sự kiện truy cập của tenant dưới dạng CSV hoặc XLSX "
        "theo luồng stream. Nhận các tham số lọc giống endpoint danh sách. "
        "Giới hạn tối đa 50.000 dòng mỗi lần xuất.",
    "GET /access/groups":
        "Nhóm truy cập kết hợp các điểm truy cập, mẫu thời gian và người dùng. "
        "Có phân trang, lọc được theo tên.",
    "DELETE /access/groups/{id}":
        "Xóa mềm. Người dùng đang thuộc nhóm này vẫn giữ bản ghi phân công nhưng "
        "các bản ghi đó trở nên không còn hiệu lực.",
    "GET /attendance/holidays":
        "Thuộc plugin chấm công. Quyền đọc mở cho mọi người dùng đã bật plugin.",
    "GET /attendance/me/attendance":
        "Thuộc plugin chấm công. Trả về các bản ghi chấm công của chính người "
        "gọi trong khoảng thời gian yêu cầu.",
    "POST /attendance/me/leave/requests":
        "Gửi đơn xin nghỉ phép cho người dùng đã xác thực. Trường user_id do "
        "phía gọi truyền vào sẽ bị bỏ qua.",
    "GET /audit/export":
        "Trả về các bản ghi kiểm toán phù hợp dưới dạng CSV theo luồng stream. "
        "Hỗ trợ cùng bộ lọc với endpoint danh sách. Giới hạn tối đa 50.000 dòng "
        "mỗi lần xuất.",
    "GET /audit/logs":
        "Trả về danh sách có phân trang các bản ghi kiểm toán. Người dùng tenant "
        "chỉ xem được bản ghi của tenant mình; quản trị hệ thống xem tất cả. Hỗ "
        "trợ lọc theo actor, service, action, entity_type, thời gian…",
    "GET /audit/logs/{id}":
        "Trả về một bản ghi kiểm toán theo id. Người dùng tenant chỉ đọc được "
        "các bản ghi thuộc tenant của mình.",
    "GET /auth/api-tokens":
        "Trả về tất cả token API đã phát hành cho tenant của người gọi. Chuỗi "
        "bí mật chỉ hiển thị một lần khi tạo; endpoint này chỉ trả về phần "
        "metadata (prefix, scope, thông tin sử dụng…).",
    "POST /auth/login":
        "Bước 1 của luồng đăng nhập hai bước. Nếu người dùng thuộc nhiều công "
        "ty, hệ thống trả về danh sách công ty thay vì token và phía gọi phải "
        "thực hiện tiếp POST /auth/login-step2.",
    "POST /auth/logout":
        "Thu hồi refresh token để không thể dùng đổi token tiếp. Access token "
        "vẫn hoạt động cho tới khi hết hạn tự nhiên (thời gian sống ngắn).",
    "GET /auth/me":
        "Trả về hồ sơ của người gọi kèm theo vai trò và cấu hình plugin của "
        "tenant. Console gọi mỗi lần tải trang để khôi phục phiên.",
    "POST /auth/refresh":
        "Hỗ trợ khoảng ân hạn 7 ngày đối với refresh token hết hạn để các "
        "terminal offline vẫn đồng bộ được. Có giới hạn tần suất theo IP.",
    "GET /auth/system/companies":
        "Chỉ dành cho quản trị hệ thống. Mỗi công ty là một tenant; danh sách "
        "này kiểm soát ai có thể đăng nhập vào nền tảng.",
    "POST /auth/system/companies":
        "Chỉ dành cho quản trị hệ thống. Tạo tenant mới kèm cấu hình plugin, "
        "khởi tạo dữ liệu mặc định trong các schema dm3_* của tenant, và có thể "
        "mời một quản trị viên ban đầu.",
    "PUT /auth/system/companies/{id}":
        "Thay đổi cấu hình plugin sẽ áp dụng ở lần đăng nhập kế tiếp của tenant "
        "đó — các phiên đang chạy giữ nguyên tập plugin cũ cho đến khi access "
        "token được làm mới.",
    "DELETE /auth/system/companies/{id}":
        "Chỉ dành cho quản trị hệ thống. Đánh dấu tenant ở trạng thái tạm ngưng; "
        "các phiên đang chạy tiếp tục hợp lệ cho đến khi JWT hết hạn nhưng các "
        "lần đăng nhập mới sẽ bị chặn.",
    "GET /cctv/cameras":
        "Thuộc plugin CCTV. Quyền đọc mở cho mọi người dùng đã bật plugin; "
        "quyền ghi yêu cầu cctv.camera.manage.",
    "POST /cctv/cameras":
        "Đăng ký một nguồn RTSP/WebRTC. Với tích hợp Hanet, cung cấp id thiết "
        "bị Hanet thay vì URL RTSP thô.",
    "GET /gateway/devices":
        "Mỗi dòng bao gồm trạng thái online, phiên bản firmware và danh sách "
        "các điểm truy cập được gán cho thiết bị.",
    "POST /gateway/devices":
        "Với môi trường thật, khuyến nghị dùng luồng provisioning bằng mã QR. "
        "Endpoint này là đường ghi trực tiếp, phục vụ các tích hợp tự quản lý "
        "thiết bị từ bên ngoài.",
    "PUT /gateway/devices/{id}":
        "Cập nhật một phần. Thay đổi verify_methods hoặc open_relay_ms có hiệu "
        "lực sau chu kỳ đồng bộ cấu hình kế tiếp.",
    "DELETE /gateway/devices/{id}":
        "Xóa vĩnh viễn thiết bị. Các thông tin xác thực được cache offline trên "
        "thiết bị vẫn tồn tại cho tới khi thiết bị đồng bộ và phát hiện mình đã "
        "bị thu hồi.",
    "GET /identity/users":
        "Danh sách người dùng có phân trang, lọc được theo từ khóa tìm kiếm, "
        "trạng thái và phòng ban.",
    "POST /identity/users":
        "Tạo bản ghi người dùng. Các trường bắt buộc gồm first_name, last_name, "
        "và ít nhất một trong email hoặc emp_number. Thông tin xác thực tùy "
        "chọn (thẻ, PIN, sinh trắc học) được gắn qua endpoint credentials "
        "riêng biệt.",
    "GET /identity/users/{id}":
        "Lấy toàn bộ thông tin người dùng, bao gồm phòng ban, thành viên trong "
        "nhóm truy cập và metadata của các thông tin xác thực.",
    "PUT /identity/users/{id}":
        "Cập nhật một phần — chỉ các trường có trong body được cập nhật. Bỏ "
        "qua một trường để giữ nguyên giá trị cũ.",
    "DELETE /identity/users/{id}":
        "Xóa mềm — bản ghi người dùng được đánh dấu đã xóa và ẩn khỏi các "
        "endpoint danh sách/chi tiết, nhưng vẫn lưu giữ để đảm bảo tính toàn "
        "vẹn của nhật ký kiểm toán. Các thông tin xác thực liên quan bị thu "
        "hồi ngay lập tức.",
    "GET /parking/sessions":
        "Thuộc plugin đỗ xe. Một phiên là một vé vào/ra. Quyền đọc mở; quyền "
        "ghi yêu cầu parking.ticket.manage.",
    "GET /parking/vehicles":
        "Thuộc plugin đỗ xe. Quyền đọc mở cho mọi người dùng đã bật plugin; "
        "quyền ghi yêu cầu parking.vehicle.manage.",
    "GET /visitors":
        "Thuộc plugin khách. Quyền ghi yêu cầu visitor.visit.manage; quyền đọc "
        "mở cho mọi người dùng đã bật plugin.",
    "POST /visitors":
        "Gửi email mời kèm mã QR đến khách nếu có địa chỉ email. Thuộc plugin "
        "khách, yêu cầu visitor.visit.manage.",
    "POST /visitors/{id}/checkin":
        "Ghi nhận thời điểm đến và metadata tùy chọn (ảnh, thẻ). Chuyển "
        "visit.status sang trạng thái checked_in.",
}

# ─── utils ──────────────────────────────────────────────────────────────────


def esc(s: str | None) -> str:
    return html_mod.escape(str(s)) if s is not None else ""


def tag_vi(name: str) -> str:
    return TAG_VI.get(name, name)


def logo_data_uri() -> str:
    return "data:image/png;base64," + base64.b64encode(LOGO_SRC.read_bytes()).decode(
        "ascii"
    )


def slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# ─── schema rendering ───────────────────────────────────────────────────────


def schema_to_type(schema: dict) -> str:
    if not isinstance(schema, dict):
        return "object"
    if "$ref" in schema:
        return schema["$ref"].rsplit("/", 1)[-1]
    t = schema.get("type", "object")
    fmt = schema.get("format")
    if t == "array":
        items = schema.get("items", {})
        return f"{schema_to_type(items)}[]"
    if fmt:
        return f"{t}&lt;{fmt}&gt;"
    enum = schema.get("enum")
    if enum:
        return t + " · " + " | ".join(f'"{e}"' for e in enum[:5]) + (
            " …" if len(enum) > 5 else ""
        )
    return t


# ─── page rendering ─────────────────────────────────────────────────────────


def render_parameters(params: list) -> str:
    if not params:
        return ""
    groups = {"path": [], "query": [], "header": [], "body": []}
    for p in params:
        loc = p.get("in", "query")
        groups.setdefault(loc, []).append(p)
    parts = []
    headings = {
        "path": L["path_params"],
        "query": L["query_params"],
        "header": L["header_params"],
        "body": L["body_params"],
    }
    for loc in ("path", "query", "header", "body"):
        items = groups.get(loc) or []
        if not items:
            continue
        parts.append(f'<div class="subsection">{headings[loc]}</div>')
        parts.append('<table class="params"><thead><tr>')
        parts.append(
            f'<th style="width:22%">{L["col_name"]}</th>'
            f'<th style="width:18%">{L["col_type"]}</th>'
            f'<th style="width:10%">{L["col_required"]}</th>'
            f'<th>{L["col_desc"]}</th>'
        )
        parts.append("</tr></thead><tbody>")
        for p in items:
            name = p.get("name", "—")
            schema = p.get("schema") or p
            type_s = schema_to_type(schema)
            required = "✓" if p.get("required") else "—"
            required_cls = "req-yes" if p.get("required") else "req-no"
            desc = esc(translate_common(p.get("description") or "")).replace(
                "\n", "<br>"
            )
            parts.append(
                f'<tr><td class="param-name">{esc(name)}</td>'
                f'<td class="type">{type_s}</td>'
                f'<td class="{required_cls}">{required}</td>'
                f'<td>{desc}</td></tr>'
            )
        parts.append("</tbody></table>")
    return "".join(parts)


def render_request_body(body: dict | None) -> str:
    # OpenAPI 3.0 requestBody (swag currently emits 2.0 so this is usually empty)
    if not body:
        return ""
    content = body.get("content", {})
    if not content:
        return ""
    parts = [f'<div class="subsection">{L["body_params"]}</div>']
    for mime, media in content.items():
        schema = media.get("schema", {})
        parts.append(
            f'<div class="mime">{esc(mime)} → <code>{schema_to_type(schema)}</code></div>'
        )
        if body.get("description"):
            parts.append(f'<div class="desc">{esc(body["description"])}</div>')
    return "".join(parts)


# ─── Per-endpoint sample responses (pretty-printed JSON) ────────────────────
# Keyed by "METHOD /path". Shown as a code block under the response table.
SAMPLES_VI: dict[str, str] = {
    "POST /auth/login": """{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "user": {
    "id": "3f7b0a52-9b1c-4e6a-9d21-0c4d5a9f8e10",
    "email": "admin@duali.com",
    "first_name": "Nguyen",
    "last_name": "Admin",
    "role": "company_admin",
    "tenant_id": "e1d2c3b4-a5f6-4789-0123-456789abcdef"
  }
}""",
    "GET /auth/me": """{
  "id": "3f7b0a52-9b1c-4e6a-9d21-0c4d5a9f8e10",
  "email": "admin@duali.com",
  "first_name": "Nguyen",
  "last_name": "Admin",
  "role": "company_admin",
  "tenant_id": "e1d2c3b4-a5f6-4789-0123-456789abcdef",
  "plugins": ["visitor", "parking", "cctv", "attendance", "api_integration"]
}""",
    "GET /access/events": """{
  "data": [
    {
      "id": "9f81e0b4-c2a7-4ee9-8b30-1c1a2b3c4d5e",
      "tenant_id": "e1d2c3b4-a5f6-4789-0123-456789abcdef",
      "time": "2026-04-22T08:15:42Z",
      "access_point_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
      "device_id": "d0e1f2a3-b4c5-6789-0123-456789abcdef",
      "device_name": "Cửa chính - Tầng 1",
      "user_id": "3f7b0a52-9b1c-4e6a-9d21-0c4d5a9f8e10",
      "user_name": "Nguyen Van A",
      "credential_type": "face",
      "direction": "in",
      "decision": "granted",
      "reason": "",
      "confidence": 0.972,
      "photo_ref": "events/e1d2c3b4/d0e1f2a3/2026-04-22/9f81e0b4.jpg",
      "photo_url": "https://minio.local/dm3/events/...?X-Amz-Signature=...",
      "metadata": {"temperature": 36.5, "mask": true}
    }
  ],
  "total": 12843,
  "page": 1,
  "limit": 20
}""",
    "GET /access/events/export": """# CSV response (format=csv)
Time,Access Point ID,Device Name,User Name,Credential Type,Direction,Decision,Reason
2026-04-22T08:15:42Z,a1b2c3d4-e5f6-7890-1234-56789abcdef0,Cửa chính - Tầng 1,Nguyen Van A,face,in,granted,
2026-04-22T08:16:03Z,a1b2c3d4-e5f6-7890-1234-56789abcdef0,Cửa chính - Tầng 1,Tran Thi B,card,in,denied,expired
...""",
    "GET /access/groups": """{
  "data": [
    {
      "id": "b2c3d4e5-f6a7-8901-2345-6789abcdef01",
      "tenant_id": "e1d2c3b4-a5f6-4789-0123-456789abcdef",
      "name": "Nhân viên văn phòng",
      "description": "Truy cập toàn bộ tầng văn phòng 24/7",
      "access_point_ids": ["a1b2c3d4-e5f6-7890-1234-56789abcdef0"],
      "user_count": 42,
      "created_at": "2026-01-15T09:00:00Z",
      "updated_at": "2026-04-10T14:22:11Z"
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 20
}""",
    "GET /identity/users": """{
  "data": [
    {
      "id": "3f7b0a52-9b1c-4e6a-9d21-0c4d5a9f8e10",
      "tenant_id": "e1d2c3b4-a5f6-4789-0123-456789abcdef",
      "email": "user@duali.com",
      "first_name": "Nguyen",
      "last_name": "Van A",
      "employee_number": "EMP-0042",
      "department_id": "d1e2f3a4-b5c6-7890-1234-56789abcdef0",
      "position": "Kỹ sư phần mềm",
      "status": "active",
      "access_group_id": "b2c3d4e5-f6a7-8901-2345-6789abcdef01",
      "created_at": "2026-01-15T09:00:00Z"
    }
  ],
  "total": 156,
  "page": 1,
  "limit": 20
}""",
    "GET /gateway/devices": """{
  "data": [
    {
      "id": "d0e1f2a3-b4c5-6789-0123-456789abcdef",
      "tenant_id": "e1d2c3b4-a5f6-4789-0123-456789abcdef",
      "device_id": "DM3-TERM-0042",
      "name": "Cửa chính - Tầng 1",
      "type": "access_terminal",
      "model": "DM3-Terminal-V2",
      "location": "Tòa nhà A - Tầng 1",
      "firmware_version": "3.0.12",
      "status": "online",
      "last_seen_at": "2026-04-22T08:20:01Z"
    }
  ],
  "total": 24,
  "page": 1,
  "limit": 20
}""",
    "GET /audit/logs": """{
  "data": [
    {
      "id": "aaaabbbb-cccc-dddd-eeee-ffff00001111",
      "time": "2026-04-22T08:15:42Z",
      "tenant_id": "e1d2c3b4-a5f6-4789-0123-456789abcdef",
      "actor_user_id": "3f7b0a52-9b1c-4e6a-9d21-0c4d5a9f8e10",
      "actor_email": "admin@duali.com",
      "service": "identity-svc",
      "action": "user.create",
      "entity_type": "user",
      "entity_id": "newuser-0042",
      "status": "success",
      "ip_address": "203.0.113.17",
      "metadata": {"email": "user@duali.com"}
    }
  ],
  "total": 8421,
  "page": 1,
  "limit": 20
}""",
}


def render_sample(path: str, method: str) -> str:
    key = f"{method.upper()} {path}"
    sample = SAMPLES_VI.get(key)
    if not sample:
        return ""
    return (
        f'<div class="subsection">{L["sample_response"]}</div>'
        f'<pre class="sample">{esc(sample)}</pre>'
    )


def render_responses(responses: dict) -> str:
    if not responses:
        return ""
    parts = [f'<div class="subsection">{L["responses"]}</div>']
    parts.append('<table class="params"><thead><tr>')
    parts.append(
        f'<th style="width:15%">{L["col_status"]}</th>'
        f'<th>{L["col_desc"]}</th>'
    )
    parts.append("</tr></thead><tbody>")
    for status in sorted(responses.keys(), key=lambda s: (len(s) > 3, s)):
        resp = responses[status] or {}
        desc = esc(translate_common(resp.get("description") or ""))
        code_cls = "status-2xx"
        try:
            code = int(status)
            if 400 <= code < 500:
                code_cls = "status-4xx"
            elif code >= 500:
                code_cls = "status-5xx"
        except ValueError:
            code_cls = "status-default"
        parts.append(
            f'<tr><td class="{code_cls}">{esc(status)}</td><td>{desc}</td></tr>'
        )
    parts.append("</tbody></table>")
    return "".join(parts)


def render_operation(path: str, method: str, op: dict) -> str:
    method_up = method.upper()
    color = METHOD_COLORS.get(method_up, "#6B7280")
    key = f"{method_up} {path}"
    summary = esc(
        SUMMARY_VI.get(key) or op.get("summary") or f"{method_up} {path}"
    )
    raw_desc = DESC_VI.get(key) or op.get("description") or ""
    description = esc(raw_desc)
    deprecated = op.get("deprecated", False)
    op_id = op.get("operationId") or slugify(f"{method}-{path}")
    anchor = f"op-{slugify(op_id)}"

    parts = [f'<article class="endpoint" id="{anchor}">']
    deprecated_html = (
        f' <span class="deprecated">{L["deprecated"]}</span>'
        if deprecated
        else ""
    )
    parts.append(
        f'<div class="ep-head">'
        f'<span class="method" style="background:{color}">{method_up}</span>'
        f'<span class="path"><code>{esc(path)}</code></span>'
        f"{deprecated_html}"
        f"</div>"
    )
    parts.append(f'<div class="summary">{summary}</div>')
    if description:
        parts.append(f'<div class="desc">{description}</div>')

    # security
    security = op.get("security")
    if security:
        keys = []
        for item in security:
            keys.extend(item.keys())
        if keys:
            parts.append(
                f'<div class="security">{L["security"]}: '
                + ", ".join(f"<code>{esc(k)}</code>" for k in sorted(set(keys)))
                + "</div>"
            )

    params = op.get("parameters") or []
    parts.append(render_parameters(params))
    parts.append(render_request_body(op.get("requestBody")))
    parts.append(render_responses(op.get("responses") or {}))
    parts.append(render_sample(path, method))
    parts.append("</article>")
    return "".join(parts)


def group_operations(spec: dict) -> list[tuple[str, list]]:
    """Return [(tag, [(path, method, op), ...]), ...] in a stable order."""
    paths = spec.get("paths", {})
    tag_order = [t.get("name") for t in spec.get("tags", []) if t.get("name")]
    seen = set(tag_order)

    groups: dict[str, list] = {t: [] for t in tag_order}
    for path in sorted(paths.keys()):
        methods = paths[path]
        for method, op in methods.items():
            if method not in (
                "get",
                "post",
                "put",
                "patch",
                "delete",
                "head",
                "options",
            ):
                continue
            op_tags = op.get("tags") or ["Other"]
            for tag in op_tags:
                if tag not in groups:
                    groups[tag] = []
                    if tag not in seen:
                        tag_order.append(tag)
                        seen.add(tag)
                groups[tag].append((path, method, op))
    return [(t, groups[t]) for t in tag_order if groups.get(t)]


# ─── document ───────────────────────────────────────────────────────────────


CSS = f"""
@page {{
    size: A4 portrait;
    margin: 20mm 18mm 22mm 18mm;
    @bottom-left {{
        content: "Tài liệu tự sinh từ nguồn — Duall Master 3.0";
        font-family: -apple-system, "Segoe UI", sans-serif;
        font-size: 8pt;
        color: #6B7280;
    }}
    @bottom-right {{
        content: "Trang " counter(page);
        font-family: -apple-system, "Segoe UI", sans-serif;
        font-size: 8pt;
        color: #6B7280;
    }}
}}

* {{ box-sizing: border-box; }}
html {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
body {{
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI",
                 "Helvetica Neue", Arial, sans-serif;
    color: #111827;
    font-size: 10pt;
    line-height: 1.55;
    margin: 0;
}}
code {{
    font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
    background: #F3F4F6;
    padding: 1pt 4pt;
    border-radius: 3pt;
    font-size: 9.2pt;
    color: #1E293B;
}}
h1, h2, h3 {{ color: {BRAND_BG}; letter-spacing: -0.01em; }}

/* ─ cover ─ (fits inside the default @page margins; main block centered,
   copyright notice pinned to the bottom of the page) */
.cover {{
    page-break-after: always;
    min-height: 255mm;
    background: {BRAND_BG};
    color: #F8FAFC;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 20mm 16mm 16mm;
    border-radius: 4pt;
}}
.cover .cover-main {{
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
}}
.cover img {{ width: 160px; height: auto; margin-bottom: 28pt; }}
.cover h1 {{
    color: white;
    font-size: 34pt;
    margin: 0 0 12pt;
    font-weight: 700;
    letter-spacing: -0.02em;
}}
.cover .accent {{ color: {BRAND_PRIMARY}; font-weight: 600; font-size: 13pt; margin: 4pt 0 20pt; }}
.cover .cover-main p {{ margin: 4pt 0; font-size: 11pt; opacity: 0.85; }}
.cover .cover-main p.org {{ margin-top: 14pt; }}
.cover .cover-copyright {{
    margin-top: 14pt;
    padding-top: 10pt;
    border-top: 1px solid rgba(148, 163, 184, 0.35);
    font-size: 7.5pt;
    line-height: 1.5;
    color: #94A3B8;
    text-align: justify;
}}
.cover .cover-copyright p {{ margin: 0; }}
/* suppress footer on the cover page */
@page :first {{
    @bottom-left {{ content: ""; }}
    @bottom-right {{ content: ""; }}
}}

/* ─ front matter (copyright + disclaimer) ─ */
.front-page {{
    page-break-after: always;
    padding: 6mm 4mm;
    color: #111827;
    font-size: 10.5pt;
    line-height: 1.7;
}}
.front-page p {{ margin: 0 0 12pt; text-align: justify; }}
.front-page .copyright-block {{ max-width: 150mm; margin: 0 auto; }}
.front-page .logo-mark {{
    margin-top: 30mm;
    display: flex;
    justify-content: flex-end;
}}
.front-page .logo-mark img {{ width: 120px; height: auto; }}
.front-page .contact {{
    margin-top: 6pt;
    font-size: 10pt;
    color: #111827;
}}
.front-page .contact a {{ color: #2563EB; text-decoration: underline; }}

/* ─ section title pages ─ */
.section-title {{
    page-break-before: always;
    padding-top: 12pt;
}}
.section-title h2 {{
    font-size: 22pt;
    margin: 0 0 6pt;
    padding-bottom: 8pt;
    border-bottom: 3px solid {BRAND_PRIMARY};
}}
.section-title .en-name {{
    color: #6B7280;
    font-size: 10pt;
    margin-bottom: 20pt;
    font-style: italic;
}}

/* ─ table of contents ─ */
.toc {{ page-break-after: always; }}
.toc h1 {{
    font-size: 28pt;
    margin: 0 0 20pt;
    padding-bottom: 10pt;
    border-bottom: 3px solid {BRAND_PRIMARY};
}}
.toc .group {{ margin: 18pt 0 6pt; font-size: 12pt; font-weight: 600; color: {BRAND_BG}; }}
.toc .group-count {{ color: #9CA3AF; font-weight: 400; font-size: 9pt; margin-left: 4pt; }}
.toc ol, .toc ul {{ list-style: none; padding: 0; margin: 0; }}
.toc li {{
    display: flex;
    align-items: baseline;
    padding: 3pt 0;
    font-size: 9.5pt;
    line-height: 1.4;
}}
.toc li .name {{ color: #1F2937; }}
.toc li .dots {{
    flex: 1;
    border-bottom: 1px dotted #D1D5DB;
    margin: 0 6pt;
    transform: translateY(-3pt);
    min-width: 10pt;
}}
.toc li .page-num {{ color: #6B7280; font-variant-numeric: tabular-nums; font-size: 9pt; }}
.toc li .ep-method {{
    font-family: "SF Mono", monospace;
    font-size: 8pt;
    font-weight: 700;
    color: white;
    padding: 1pt 5pt;
    border-radius: 2pt;
    margin-right: 6pt;
    letter-spacing: 0.3pt;
}}

/* ─ overview page ─ */
.overview {{ page-break-after: always; }}
.overview h1 {{
    font-size: 24pt;
    margin: 0 0 12pt;
    padding-bottom: 8pt;
    border-bottom: 2px solid {BRAND_PRIMARY};
}}
.overview h3 {{
    font-size: 13pt;
    margin: 18pt 0 4pt;
    color: {BRAND_BG};
}}
.overview p {{ margin: 4pt 0 8pt; color: #374151; }}
.overview .meta-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8pt;
    margin: 12pt 0;
    padding: 12pt;
    background: #F9FAFB;
    border-left: 3px solid {BRAND_PRIMARY};
    border-radius: 4pt;
}}
.overview .meta-grid .label {{
    font-size: 8.5pt;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
}}
.overview .meta-grid .value {{ font-size: 10.5pt; color: #111827; font-weight: 500; }}

/* ─ endpoint ─ */
.endpoint {{
    margin: 14pt 0 22pt;
    padding: 12pt 14pt;
    border: 1px solid #E5E7EB;
    border-left: 3px solid {BRAND_PRIMARY};
    border-radius: 4pt;
    page-break-inside: avoid;
    background: #FAFBFC;
}}
.endpoint .ep-head {{
    display: flex;
    align-items: center;
    gap: 8pt;
    margin-bottom: 6pt;
    flex-wrap: wrap;
}}
.endpoint .method {{
    display: inline-block;
    color: white;
    font-family: "SF Mono", monospace;
    font-weight: 700;
    font-size: 8.5pt;
    padding: 2pt 7pt;
    border-radius: 3pt;
    letter-spacing: 0.5pt;
}}
.endpoint .path code {{
    background: transparent;
    font-size: 10pt;
    padding: 0;
    color: #111827;
    font-weight: 500;
}}
.endpoint .summary {{
    font-size: 11.5pt;
    font-weight: 600;
    color: {BRAND_BG};
    margin: 4pt 0 6pt;
}}
.endpoint .desc {{
    color: #4B5563;
    margin: 4pt 0 8pt;
    font-size: 10pt;
}}
.endpoint .security {{
    font-size: 9pt;
    color: #6B7280;
    margin: 6pt 0;
}}
.endpoint .deprecated {{
    color: #EF4444;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.5pt;
    padding: 2pt 6pt;
    background: #FEE2E2;
    border-radius: 3pt;
}}
.subsection {{
    font-size: 8.5pt;
    font-weight: 700;
    margin: 12pt 0 4pt;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.7pt;
}}

/* ─ tables ─ */
table.params {{
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    margin: 4pt 0 8pt;
    background: white;
    border: 1px solid #E5E7EB;
    border-radius: 3pt;
}}
table.params th {{
    text-align: left;
    background: #F3F4F6;
    padding: 5pt 8pt;
    border-bottom: 1px solid #D1D5DB;
    font-weight: 600;
    color: #374151;
    font-size: 8.5pt;
}}
table.params td {{
    padding: 5pt 8pt;
    border-bottom: 1px solid #F3F4F6;
    vertical-align: top;
    color: #374151;
}}
table.params tr:last-child td {{ border-bottom: none; }}

/* ─ sample response code block ─ */
pre.sample {{
    background: #0F172A;
    color: #E2E8F0;
    border: 1px solid #1E293B;
    border-radius: 4pt;
    padding: 8pt 10pt;
    font-family: "SF Mono", "Menlo", "Courier New", monospace;
    font-size: 8.5pt;
    line-height: 1.45;
    margin: 4pt 0 10pt;
    white-space: pre-wrap;
    word-break: break-word;
    page-break-inside: avoid;
}}
table.params td.param-name {{
    font-family: "SF Mono", monospace;
    color: #111827;
    font-weight: 500;
}}
table.params td.type {{
    color: #7C3AED;
    font-family: "SF Mono", monospace;
    font-size: 8.5pt;
}}
table.params td.req-yes {{ color: #EF4444; font-weight: 600; text-align: center; }}
table.params td.req-no {{ color: #9CA3AF; text-align: center; }}
.status-2xx {{ color: #10B981; font-weight: 700; font-family: "SF Mono", monospace; }}
.status-4xx {{ color: #F59E0B; font-weight: 700; font-family: "SF Mono", monospace; }}
.status-5xx {{ color: #EF4444; font-weight: 700; font-family: "SF Mono", monospace; }}
.status-default {{ color: #6B7280; font-weight: 600; font-family: "SF Mono", monospace; }}

/* ensure TOC entries are compact and predictable for page-number scanning */
.toc-link {{ text-decoration: none; color: inherit; display: flex; width: 100%; }}
"""


def render_html(spec: dict) -> str:
    info = spec.get("info", {})
    version = esc(info.get("version") or "1.0")
    title = esc(info.get("title") or "Duall Master API")
    description = info.get("description") or ""
    contact = info.get("contact") or {}
    license_ = info.get("license") or {}
    host = spec.get("host") or ""
    base_path = spec.get("basePath") or ""
    schemes = ", ".join(spec.get("schemes") or []) or "https"

    groups = group_operations(spec)

    # ─ cover (includes copyright notice at the bottom) ─
    cover = f"""
<section class="cover">
  <div class="cover-main">
    <img src="{logo_data_uri()}" alt="Duall Master"/>
    <h1>{title}</h1>
    <div class="accent">{L["cover_subtitle"]} · v{version}</div>
    <p>{L["cover_tag"]}</p>
    <p class="org">&copy; Duali Vietnam</p>
  </div>
  <div class="cover-copyright">
    <p>{esc(FRONT_COPYRIGHT)}</p>
  </div>
</section>
"""

    # ─ disclaimer page (copyright is now on the cover) ─
    disclaimer_paras = "".join(
        f"<p>{esc(p)}</p>" for p in FRONT_DISCLAIMER_PARAGRAPHS
    )
    contact_html = "".join(
        f'<div class="contact">{esc(line)}</div>' for line in FRONT_CONTACT_LINES
    )
    disclaimer_page = f"""
<section class="front-page">
  <div class="copyright-block">
    {disclaimer_paras}
    {contact_html}
  </div>
</section>
"""

    # ─ overview ─ (use Vietnamese overlay, not the spec's English description)
    server = f"{schemes}://{host}{base_path}" if host else base_path or "/api/v1"
    overview = f"""
<section class="overview">
  <h1>{L["overview"]}</h1>
  <p>{OVERVIEW_VI}</p>
  <div class="meta-grid">
    <div><div class="label">Base URL</div><div class="value"><code>{esc(server)}</code></div></div>
    <div><div class="label">Phiên bản</div><div class="value">v{version}</div></div>
    <div><div class="label">Liên hệ</div>
         <div class="value">{esc(contact.get("email", contact.get("name", "support@duali.com")))}</div></div>
    <div><div class="label">Giấy phép</div>
         <div class="value">{esc(license_.get("name", "Proprietary"))}</div></div>
  </div>

  <h3>{L["auth_section"]}</h3>
  <p>{L["auth_body"]}</p>

  <h3>{L["rate_section"]}</h3>
  <p>{L["rate_body"]}</p>

  <h3>{L["envelope_section"]}</h3>
  <p>{L["envelope_body"]}</p>
</section>
"""

    # ─ table of contents ─
    toc_parts = ['<section class="toc">', f"<h1>{L['toc']}</h1>"]
    # fixed entries
    toc_parts.append(
        f'<div class="group"><a class="toc-link" href="#overview-marker">'
        f'<span class="name">{L["overview"]}</span>'
        f"</a></div>"
    )
    for tag, ops in groups:
        vi = esc(tag_vi(tag))
        anchor = f"tag-{slugify(tag)}"
        toc_parts.append(
            f'<div class="group"><a class="toc-link" href="#{anchor}">'
            f'<span class="name">{vi} '
            f'<span class="group-count">· {len(ops)} endpoint</span></span>'
            f"</a></div>"
        )
        toc_parts.append("<ul>")
        for path, method, op in ops:
            method_up = method.upper()
            color = METHOD_COLORS.get(method_up, "#6B7280")
            key = f"{method_up} {path}"
            summary = esc(
                SUMMARY_VI.get(key) or op.get("summary") or f"{method_up} {path}"
            )
            op_id = op.get("operationId") or slugify(f"{method}-{path}")
            op_anchor = f"op-{slugify(op_id)}"
            toc_parts.append(
                f'<li><a class="toc-link" href="#{op_anchor}">'
                f'<span class="ep-method" style="background:{color}">{method_up}</span>'
                f'<span class="name">{summary} '
                f'<span class="ep-path"><code>{esc(path)}</code></span></span>'
                f"</a></li>"
            )
        toc_parts.append("</ul>")
    toc_parts.append("</section>")
    toc = "\n".join(toc_parts)

    # ─ sections ─
    body_parts = []
    for tag, ops in groups:
        anchor = f"tag-{slugify(tag)}"
        vi = esc(tag_vi(tag))
        en = esc(tag) if tag != tag_vi(tag) else ""
        body_parts.append(f'<section class="section-title" id="{anchor}">')
        body_parts.append(f"<h2>{vi}</h2>")
        if en:
            body_parts.append(f'<div class="en-name">{en}</div>')
        for path, method, op in ops:
            body_parts.append(render_operation(path, method, op))
        body_parts.append("</section>")
    sections = "\n".join(body_parts)

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<title>{title}</title>
<style>{CSS}</style>
</head>
<body>
{cover}
{disclaimer_page}
<section id="overview-marker"></section>
{overview}
{toc}
{sections}
</body>
</html>
"""


def main() -> int:
    if not LOGO_SRC.exists():
        print(f"error: logo not found at {LOGO_SRC}", file=sys.stderr)
        return 2

    spec = json.loads((DOCS / "swagger.json").read_text())
    html = render_html(spec)
    html_tmp = DOCS / ".api-reference.html"
    html_tmp.write_text(html)

    pdf_out = DOCS / "api-reference.pdf"

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            context = browser.new_context()
            page = context.new_page()
            page.goto(html_tmp.as_uri(), wait_until="load")
            page.emulate_media(media="print")
            page.pdf(
                path=str(pdf_out),
                print_background=True,
                prefer_css_page_size=True,
                display_header_footer=False,
            )
            context.close()
            browser.close()
    finally:
        html_tmp.unlink(missing_ok=True)

    size_kb = pdf_out.stat().st_size // 1024
    print(f"wrote {pdf_out.relative_to(REPO)} ({size_kb} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
