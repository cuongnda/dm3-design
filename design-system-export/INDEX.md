# DM3 Design System Export

Exported 59 files from the DM3 monorepo for sharing with an external design-system tool.

**Stack**: Vite + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui (new-york style, neutral base) + Radix UI + lucide-react + recharts.

**Design tokens** live in `apps/console/src/index.css` inside a Tailwind 4 `@theme inline` block (no separate `tailwind.config` file; Tailwind 4 uses the CSS-first config approach).

**Domain colors** (see `DomainIcon.tsx`):
- SECURE: `#3B82F6`
- MANAGE: `#8B5CF6`
- OPERATE: `#F59E0B`
- SMART: `#06B6D4`
- PLATFORM: `#6B7280`

## File index

- `package.json` — root workspace package.json — shows turborepo + workspaces setup
- `turbo.json` — Turborepo pipeline config
- `apps/console/package.json` — console app deps: React 19, Tailwind 4, shadcn/ui, Radix, lucide-react, recharts, date-fns
- `apps/console/components.json` — shadcn/ui config (new-york style, neutral base, lucide icons)
- `apps/console/vite.config.ts` — Vite config with Tailwind 4 plugin
- `apps/console/src/index.css` — GLOBAL design tokens: @theme inline block with all color/radius/font variables, dark mode, fonts
- `packages/ui/package.json` — @dm3/ui package deps
- `packages/ui/tsconfig.json` — TS config for UI package
- `packages/ui/src/index.ts` — Public barrel re-exports of all components
- `packages/ui/src/toast.tsx` — Toast provider + helpers (based on sonner)
- `packages/ui/src/lib/utils.ts` — cn() className merge helper
- `packages/ui/src/stores/breadcrumbStore.ts` — Zustand store for breadcrumb state (shared by layout)
- `packages/ui/src/components/layout/MainLayout.tsx` — Top-level app shell layout
- `packages/ui/src/components/layout/Sidebar.tsx` — Left sidebar navigation with domain grouping
- `packages/ui/src/components/layout/Topbar.tsx` — Top bar with breadcrumbs, search, notifications, user menu
- `packages/ui/src/components/layout/PageHeader.tsx` — Reusable page header with title/actions/tabs
- `packages/ui/src/components/ui/alert.tsx` — Alert primitive (variants: default, destructive)
- `packages/ui/src/components/ui/avatar.tsx` — Avatar (Radix)
- `packages/ui/src/components/ui/badge.tsx` — Badge with CVA variants
- `packages/ui/src/components/ui/button.tsx` — Button with CVA variants (default/destructive/outline/secondary/ghost/link + sizes)
- `packages/ui/src/components/ui/calendar.tsx` — Calendar date input
- `packages/ui/src/components/ui/card.tsx` — Card + header/content/footer subcomponents
- `packages/ui/src/components/ui/checkbox.tsx` — Checkbox (Radix)
- `packages/ui/src/components/ui/collapsible.tsx` — Collapsible (Radix)
- `packages/ui/src/components/ui/command.tsx` — Command palette (cmdk)
- `packages/ui/src/components/ui/date-picker.tsx` — Date picker
- `packages/ui/src/components/ui/date-range-picker.tsx` — Date range picker
- `packages/ui/src/components/ui/datetime-picker.tsx` — Datetime picker
- `packages/ui/src/components/ui/datetime-range-picker.tsx` — Datetime range picker
- `packages/ui/src/components/ui/dialog.tsx` — Modal dialog (Radix)
- `packages/ui/src/components/ui/dropdown-menu.tsx` — Dropdown menu (Radix)
- `packages/ui/src/components/ui/input.tsx` — Text input primitive
- `packages/ui/src/components/ui/label.tsx` — Form label (Radix)
- `packages/ui/src/components/ui/multiselect.tsx` — Multi-select input
- `packages/ui/src/components/ui/popover.tsx` — Popover (Radix)
- `packages/ui/src/components/ui/scroll-area.tsx` — Scroll area (Radix)
- `packages/ui/src/components/ui/select.tsx` — Select dropdown (Radix)
- `packages/ui/src/components/ui/separator.tsx` — Divider
- `packages/ui/src/components/ui/sheet.tsx` — Side sheet / drawer (Radix Dialog variant)
- `packages/ui/src/components/ui/table.tsx` — Table primitive (thead, tbody, tr, td, th)
- `packages/ui/src/components/ui/tabs.tsx` — Tabs (Radix)
- `packages/ui/src/components/ui/textarea.tsx` — Textarea input
- `packages/ui/src/components/ui/tooltip.tsx` — Tooltip (Radix)
- `packages/ui/src/components/common/AppModal.tsx` — Standard modal wrapper around Dialog
- `packages/ui/src/components/common/DataTable.tsx` — Generic DataTable with sort/filter/pagination
- `packages/ui/src/components/common/DataTableCard.tsx` — DataTable wrapped in a Card shell
- `packages/ui/src/components/common/DomainIcon.tsx` — Renders per-domain colored icon (SECURE/MANAGE/OPERATE/SMART/PLATFORM)
- `packages/ui/src/components/common/EventFeed.tsx` — Activity / event feed list
- `packages/ui/src/components/common/LanguageSwitcher.tsx` — Language switcher dropdown
- `packages/ui/src/components/common/NotificationPanel.tsx` — Notification drawer panel
- `packages/ui/src/components/common/PlaceholderPage.tsx` — Coming-soon placeholder page
- `packages/ui/src/components/common/SearchCommand.tsx` — Global search command palette
- `packages/ui/src/components/common/StatCard.tsx` — Dashboard stat card (value + label + trend)
- `packages/ui/src/components/common/StatusBadge.tsx` — Status badge with semantic colors
- `packages/ui/src/components/common/TablePaginationFooter.tsx` — Pagination footer for tables
- `packages/ui/src/components/charts/AreaChart.tsx` — Area chart wrapper (recharts)
- `packages/ui/src/components/charts/BarChart.tsx` — Bar chart wrapper (recharts)
- `packages/ui/src/components/charts/DonutChart.tsx` — Donut chart wrapper (recharts)
- `packages/ui/src/components/charts/Heatmap.tsx` — Heatmap visualization
