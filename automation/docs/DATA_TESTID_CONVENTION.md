# Data-TestID Naming Convention — DM3

## Format

```
{module}-{element-type}-{name}
```

### Module Prefixes

| Module | Prefix | Example |
|--------|--------|---------|
| Login | `login` | `login-input-email` |
| System Admin | `sys` | `sys-card-companies` |
| Company | `company` | `company-input-name` |
| Dashboard | `dash` | `dash-stat-users` |
| Users | `user` | `user-button-add` |
| Device | `device` | `device-table-list` |
| Identity | `identity` | `identity-input-name` |
| Access | `access` | `access-rule-card` |
| Settings | `settings` | `settings-toggle-dark` |

### Element Types

| Type | Usage | Example |
|------|-------|---------|
| `input` | Text inputs, textareas | `login-input-email` |
| `button` | Buttons, icon buttons | `company-button-create` |
| `select` | Dropdowns, selects | `company-select-plan` |
| `table` | Data tables | `company-table-list` |
| `row` | Table rows | `company-row-{id}` |
| `card` | Stat/info cards | `sys-card-companies` |
| `modal` | Dialog/modal containers | `company-modal-create` |
| `link` | Navigation links | `sys-link-dashboard` |
| `badge` | Status badges | `company-badge-status` |
| `toggle` | Toggle switches | `settings-toggle-theme` |
| `tab` | Tab buttons | `device-tab-pending` |
| `form` | Form containers | `company-form-create` |
| `label` | Display text/labels | `dash-label-total` |
| `icon` | Icon buttons | `company-icon-edit` |

## Examples by Page

### Login Page
```
login-input-email
login-input-password
login-button-submit
login-button-show-password
login-select-company          (step 2: company selection)
login-button-company-{id}     (company option)
```

### System Dashboard
```
sys-card-companies
sys-card-users
sys-card-devices
sys-card-recent
sys-label-companies-total
sys-label-companies-active
sys-label-users-total
sys-table-recent-companies
sys-row-company-{id}
```

### Company List
```
company-button-create
company-input-search
company-select-status
company-table-list
company-row-{id}
company-badge-status-{id}
company-label-plan-{id}
```

### Company Detail
```
company-input-name
company-input-code
company-select-plan
company-input-email
company-input-phone
company-input-address
company-input-max-devices
company-input-max-users
company-button-save
company-button-suspend
company-button-back
```

### Company Create
```
company-form-create
company-input-name
company-input-code
company-input-email
company-select-plan
company-button-submit
company-modal-credentials     (shows generated admin credentials)
company-label-gen-email
company-label-gen-password
company-button-copy-password
```

## Rules

1. **Always lowercase**, kebab-case
2. **Module prefix is mandatory** — no generic `button-save`
3. **Dynamic IDs** use `{id}` suffix: `company-row-{uuid}`
4. **Shared components** (Modal, Toast) get module prefix from parent context
5. **Add `data-testid` to all interactive elements** — inputs, buttons, links, selects
6. **Add `data-testid` to key display elements** — stat cards, tables, status badges

## Frontend Implementation

```tsx
// ✅ Correct
<input data-testid="login-input-email" type="email" />
<button data-testid="company-button-create">Create</button>
<tr data-testid={`company-row-${company.id}`}>

// ❌ Wrong — missing module prefix
<input data-testid="input-email" />
<button data-testid="button-save">Save</button>
```

## Test Data Usage

```json
{
  "action": "fill_input",
  "data": {
    "name": "login-input-email",
    "value": "sysadmin@duali.com"
  }
}
```

In Python:
```python
page.locator('[data-testid="login-input-email"]').fill("sysadmin@duali.com")
```
