# Create-Flow Patterns

How the DM3 Console handles "create a new X" flows. Pick one pattern per entity and stick to it — the user should feel a consistent system, not a patchwork.

## Decision Rule

| Pattern | When to use | Component |
|---|---|---|
| **Modal** (default) | Single-step form, ≤ ~8 fields, no external pickers that need > 80% viewport | `AppModal` size `sm`/`lg` |
| **Wizard modal** | Multi-step, but every step fits in modal (list pickers, schedule grids, checklists) | `WizardModal` size `xl`/`2xl`/`4xl` |
| **Full page** | Genuinely primary workspace: map/canvas editor, uploads > 100 MB, long-running async flow | dedicated route |
| **Drawer / Sheet** | Edit-in-context against a still-visible list — **not for create** | `Sheet` |

When in doubt → modal. Full-page requires a real reason.

## Canonical Example — Modal

```tsx
<AppModal
  open={open}
  onOpenChange={setOpen}
  title="New access point"
  size="lg"
  showCancelButton
  submitDisabled={!form.name.trim()}
  primaryAction={{
    label: 'Create',
    onClick: handleSubmit,
    'data-testid': 'access-point-button-submit',
  }}
>
  {/* form body */}
</AppModal>
```

## Canonical Example — Wizard

```tsx
<WizardModal
  open={open}
  onOpenChange={setOpen}
  title="New access group"
  size="xl"
  steps={[
    { id: 1, label: 'Info', icon: Shield },
    { id: 2, label: 'Access points', icon: DoorOpen },
    { id: 3, label: 'Users', icon: Users },
  ]}
  activeStep={step}
  footer={/* per-step buttons */}
>
  {step === 1 && <Step1 />}
  {step === 2 && <Step2 />}
  {step === 3 && <Step3 />}
</WizardModal>
```

## Create Button Convention

Every "add new X" trigger in a list toolbar should be consistent:

```tsx
<Button size="sm" onClick={() => setOpen(true)} data-testid="access-point-button-create">
  <Plus size={14} className="mr-1" />
  New access point
</Button>
```

- Variant: `default` (primary)
- Size: `sm`
- Icon: `Plus` from `lucide-react`, size 14
- Label: "New {singular entity}" — not "Add", not "Create New"
- `data-testid`: `{module}-button-create`

## What Not to Do

- ❌ Raw `<DialogContent>` outside `packages/ui` — always use `AppModal` / `WizardModal`.
- ❌ Full-page create for a form that would fit in a modal.
- ❌ Drawer for create.
- ❌ Per-field inline save on a create form — commit the whole form on submit.
- ❌ Navigating to `/new` routes — reserve `/new` or `/:id` for edit pages only (if needed at all).

## Edit vs. Create

Edit pages **may** live at a full route (`/access/zones/:id`) when there is meaningful context (related tabs, history, map). Create does not need that context and belongs in a modal.

## Reviewer Checklist

- [ ] No new full-page create route unless it qualifies under the rule above
- [ ] No raw `DialogContent` in app code
- [ ] Create button follows the convention (size, icon, label, testid)
- [ ] Multi-step flows use `WizardModal`, not hand-rolled stepper headers
