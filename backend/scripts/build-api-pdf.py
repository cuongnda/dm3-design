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
            desc = esc(p.get("description") or "").replace("\n", "<br>")
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
        desc = esc(resp.get("description") or "")
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
    summary = esc(op.get("summary") or f"{method_up} {path}")
    description = esc(op.get("description") or "")
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

/* ─ cover ─ (fits inside the default @page margins — we accept a small frame) */
.cover {{
    page-break-after: always;
    min-height: 250mm;
    background: {BRAND_BG};
    color: #F8FAFC;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 30mm 18mm;
    border-radius: 4pt;
}}
.cover img {{ width: 160px; height: auto; margin-bottom: 28pt; }}
.cover h1 {{
    color: white;
    font-size: 36pt;
    margin: 0 0 12pt;
    font-weight: 700;
    letter-spacing: -0.02em;
}}
.cover .accent {{ color: {BRAND_PRIMARY}; font-weight: 600; font-size: 13pt; margin: 4pt 0 20pt; }}
.cover p {{ margin: 4pt 0; font-size: 11pt; opacity: 0.85; }}
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

    # ─ cover ─
    cover = f"""
<section class="cover">
  <img src="{logo_data_uri()}" alt="Duall Master"/>
  <h1>{title}</h1>
  <div class="accent">{L["cover_subtitle"]} · v{version}</div>
  <p>{L["cover_tag"]}</p>
  <p>&copy; Duali Vietnam</p>
</section>
"""

    # ─ front matter: standard Duali copyright + disclaimer ─
    logo_uri = logo_data_uri()
    copyright_page = f"""
<section class="front-page">
  <div class="copyright-block">
    <p>{esc(FRONT_COPYRIGHT)}</p>
  </div>
  <div class="logo-mark"><img src="{logo_uri}" alt="DUALi"/></div>
</section>
"""
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

    # ─ overview ─
    server = f"{schemes}://{host}{base_path}" if host else base_path or "/api/v1"
    overview = f"""
<section class="overview">
  <h1>{L["overview"]}</h1>
  <p>{esc(description)}</p>
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
            summary = esc(op.get("summary") or f"{method_up} {path}")
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
{copyright_page}
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
