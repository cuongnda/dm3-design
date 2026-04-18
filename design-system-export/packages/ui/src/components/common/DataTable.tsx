import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Inbox } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { Checkbox } from "../ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table"
import type { BulkAction } from "./DataTableCard"

export interface DataTableSelectionProps {
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  /** Rendered in a toolbar when `selectedIds.length > 0` */
  bulkActions?: BulkAction[]
  /**
   * Header checkbox scope:
   * - `page` — only ids on the current rendered page (default; good for server-paginated data)
   * - `all` — all rows in `data` after client sort
   */
  selectAllScope?: "page" | "all"
  /**
   * When true, clicking the row (outside interactive cells) toggles selection.
   * Defaults to true.
   */
  selectOnRowClick?: boolean
}

export interface Column<T> {
  key: string
  header: string
  width?: string
  sortable?: boolean
  render?: (row: T) => ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  onRowDoubleClick?: (row: T) => void
  rowClassName?: (row: T) => string
  pageSize?: number
  /**
   * When false, every row in `data` is shown and internal pagination controls are hidden.
   * Use with parent-driven paging (pass one page of `data` at a time).
   */
  paginate?: boolean
  /** Drop outer card border/radius; use inside `DataTableCard` or another shell. */
  embedded?: boolean
  /** Sticky header for scrollable parents (e.g. card body). */
  stickyHeader?: boolean
  selection?: DataTableSelectionProps
  /**
   * Controlled sort state for server-side sorting.
   * When provided, DataTable shows sort icons but does NOT sort locally.
   */
  sortState?: { col: string | null; dir: "asc" | "desc" | null }
  /** Called when the user clicks a sortable column header (server-side sort mode). */
  onSortChange?: (col: string | null, dir: "asc" | "desc" | null) => void
  /** Show skeleton loading rows instead of data */
  loading?: boolean
  /** Number of skeleton rows to show when loading */
  skeletonRows?: number
  /** Custom empty state message */
  emptyMessage?: string
  /** Custom empty state icon */
  emptyIcon?: ReactNode
  "data-testid"?: string
  rowTestId?: (row: T) => string
}

type SortDir = "asc" | "desc" | null

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i} className="px-3 py-3">
          <div
            className={cn(
              "h-4 rounded bg-muted/60 animate-pulse",
              i === 0 ? "w-2/3" : i === cols - 1 ? "w-8" : "w-1/2"
            )}
          />
        </TableCell>
      ))}
    </TableRow>
  )
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  onRowDoubleClick,
  rowClassName,
  pageSize = 15,
  paginate = true,
  embedded = false,
  stickyHeader = false,
  selection,
  sortState,
  onSortChange,
  loading = false,
  skeletonRows = 5,
  emptyMessage,
  emptyIcon,
  "data-testid": testId,
  rowTestId,
}: DataTableProps<T>) {
  const { t } = useTranslation('common')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)

  const isServerSort = Boolean(onSortChange)
  const activeSortCol = isServerSort ? (sortState?.col ?? null) : sortCol
  const activeSortDir = isServerSort ? (sortState?.dir ?? null) : sortDir

  const sorted = useMemo(() => {
    if (isServerSort) return data
    if (!sortCol || !sortDir) return data
    const col = columns.find((c) => c.key === sortCol)
    if (!col) return data
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol]
      const bv = (b as Record<string, unknown>)[sortCol]
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""))
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [data, sortCol, sortDir, columns, isServerSort])

  const totalPages = Math.ceil(sorted.length / pageSize) || 1
  const safePage = paginate ? Math.min(Math.max(1, page), totalPages) : 1
  const paged = paginate ? sorted.slice((safePage - 1) * pageSize, safePage * pageSize) : sorted

  const selectScope = selection?.selectAllScope ?? "page"
  const scopeRows = selectScope === "all" ? sorted : paged
  const scopeIds = scopeRows.map((r) => rowKey(r))

  const selectedSet = useMemo(
    () => new Set(selection?.selectedIds ?? []),
    [selection?.selectedIds]
  )

  const toggleSort = (key: string) => {
    if (isServerSort) {
      const nextCol = activeSortCol !== key ? key : activeSortDir === "asc" ? key : null
      const nextDir: "asc" | "desc" | null =
        activeSortCol !== key ? "asc" : activeSortDir === "asc" ? "desc" : null
      onSortChange!(nextDir === null ? null : nextCol, nextDir)
      return
    }
    if (sortCol !== key) {
      setSortCol(key)
      setSortDir("asc")
    } else if (sortDir === "asc") setSortDir("desc")
    else {
      setSortCol(null)
      setSortDir(null)
    }
  }

  const toggleRowId = (id: string) => {
    if (!selection) return
    const next =
      selectedSet.has(id)
        ? selection.selectedIds.filter((x) => x !== id)
        : [...selection.selectedIds, id]
    selection.onSelectedIdsChange(next)
  }

  const toggleScopeAll = () => {
    if (!selection) return
    const allSelected =
      scopeIds.length > 0 && scopeIds.every((id) => selectedSet.has(id))
    if (allSelected) {
      selection.onSelectedIdsChange(
        selection.selectedIds.filter((id) => !scopeIds.includes(id))
      )
    } else {
      selection.onSelectedIdsChange([...new Set([...selection.selectedIds, ...scopeIds])])
    }
  }

  const allScopeSelected =
    scopeIds.length > 0 && scopeIds.every((id) => selectedSet.has(id))
  const someScopeSelected =
    scopeIds.some((id) => selectedSet.has(id)) && !allScopeSelected

  const showBulkBar = Boolean(selection) && Boolean(selection!.bulkActions?.length)
  const hasSelection = (selection?.selectedIds.length ?? 0) > 0

  const colCount = columns.length + (selection ? 1 : 0)

  const handleRowClick = (row: T) => {
    if (selection && (selection.selectOnRowClick ?? true)) toggleRowId(rowKey(row))
    onRowClick?.(row)
  }

  return (
    <div className={cn(!embedded && "space-y-2")}>
      <div
        data-testid={testId}
        className={cn(
          !embedded && "overflow-hidden rounded-lg border border-border bg-card"
        )}
      >
        {showBulkBar && (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted px-3 py-2">
            <span className={cn("text-[12px] font-medium", hasSelection ? "text-foreground" : "text-muted-foreground")}>
              {t('table.selected', { count: selection!.selectedIds.length })}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {selection!.bulkActions!.map((action, i) => (
                <Button
                  key={i}
                  type="button"
                  size={action.size ?? "sm"}
                  variant={action.variant ?? "outline"}
                  className={action.className}
                  onClick={action.onClick}
                  disabled={!hasSelection || action.disabled}
                  aria-label={action["aria-label"]}
                >
                  {action.icon}
                  {action.label ?? null}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Table noWrapper={embedded}>
          <TableHeader
            className={cn(
              stickyHeader
                ? "sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]"
                : "bg-muted/20"
            )}
          >
            <TableRow className="hover:bg-transparent border-b border-border/60">
              {selection ? (
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={allScopeSelected}
                    indeterminate={someScopeSelected}
                    onCheckedChange={toggleScopeAll}
                    aria-label={t('table.selectAll')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableHead>
              ) : null}
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/80",
                    col.sortable && "cursor-pointer select-none hover:text-foreground transition-colors"
                  )}
                  onClick={() => col.sortable && toggleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable &&
                      (activeSortCol === col.key ? (
                        activeSortDir === "asc" ? (
                          <ChevronUp size={11} className="text-primary" />
                        ) : (
                          <ChevronDown size={11} className="text-primary" />
                        )
                      ) : (
                        <ChevronsUpDown size={11} className="opacity-30" />
                      ))}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <SkeletonRow key={i} cols={colCount} />
              ))
            ) : paged.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
                    {emptyIcon ?? <Inbox size={32} strokeWidth={1.2} />}
                    <span className="text-[13px]">{emptyMessage ?? t('table.noData')}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row) => {
                const id = rowKey(row)
                const isSel = selectedSet.has(id)
                return (
                  <TableRow
                    key={id}
                    data-testid={rowTestId?.(row)}
                    data-state={isSel ? "selected" : undefined}
                    onClick={() => handleRowClick(row)}
                    onDoubleClick={() => onRowDoubleClick?.(row)}
                    className={cn(
                      "border-b border-border/40 transition-colors last:border-0",
                      (onRowClick || selection?.selectOnRowClick) && "cursor-pointer",
                      isSel
                        ? "bg-primary/8 hover:bg-primary/10"
                        : "hover:bg-muted/30",
                      rowClassName?.(row)
                    )}
                  >
                    {selection ? (
                      <TableCell
                        className="px-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggleRowId(id)}
                          aria-label={t('table.selectRow')}
                        />
                      </TableCell>
                    ) : null}
                    {columns.map((col) => (
                      <TableCell key={col.key} className="px-3 py-2.5 text-[13px]">
                        {col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.key] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      {paginate && totalPages > 1 ? (
        <div className="mt-2 flex items-center justify-between px-1 py-1">
          <span className="px-2 text-[12px] text-muted-foreground">
            {t('table.pagination', {
              from: (safePage - 1) * pageSize + 1,
              to: Math.min(safePage * pageSize, sorted.length),
              total: sorted.length,
            })}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              aria-label={t('table.prevPage')}
            >
              <ChevronLeft className="size-3.5" />
            </Button>

            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <Button
                key={p}
                type="button"
                variant={p === safePage ? "default" : "ghost"}
                size="xs"
                className="min-w-7"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}

            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
              aria-label={t('table.nextPage')}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
