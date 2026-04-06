import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react"

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
   * Defaults to false so tables with `onRowClick` keep one behavior; enable for multi-select lists.
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
}

type SortDir = "asc" | "desc" | null

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  rowClassName,
  pageSize = 15,
  paginate = true,
  embedded = false,
  stickyHeader = false,
  selection,
  sortState,
  onSortChange,
}: DataTableProps<T>) {
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
  const paged = paginate ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted

  const selectScope = selection?.selectAllScope ?? "page"
  const scopeRows = selectScope === "all" ? sorted : paged
  const scopeIds = scopeRows.map((r) => rowKey(r))

  const selectedSet = useMemo(
    () => new Set(selection?.selectedIds ?? []),
    [selection?.selectedIds]
  )

  useEffect(() => {
    if (!paginate) return
    if (page > totalPages) setPage(Math.max(1, totalPages))
  }, [paginate, page, totalPages])

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

  const showBulkBar =
    Boolean(selection) &&
    (selection!.selectedIds?.length ?? 0) > 0 &&
    Boolean(selection!.bulkActions?.length)

  const colCount = columns.length + (selection ? 1 : 0)

  const handleRowClick = (row: T) => {
    if (selection?.selectOnRowClick) toggleRowId(rowKey(row))
    onRowClick?.(row)
  }

  return (
    <div className={cn(!embedded && "space-y-2")}>
      <div
        className={cn(
          !embedded && "overflow-hidden rounded-lg border border-border bg-card"
        )}
      >
        {showBulkBar ? (
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-[13px] font-medium text-foreground">
              {selection!.selectedIds.length} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {selection!.bulkActions!.map((action, i) => (
                <Button
                  key={i}
                  type="button"
                  size={action.size ?? "sm"}
                  variant={action.variant ?? "outline"}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action["aria-label"]}
                >
                  {action.icon}
                  {action.label ?? null}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <Table noWrapper={embedded}>
          <TableHeader
            className={cn(
              stickyHeader
                ? "sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]"
                : "bg-muted/30"
            )}
          >
            <TableRow className="hover:bg-transparent">
              {selection ? (
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={allScopeSelected}
                    indeterminate={someScopeSelected}
                    onCheckedChange={toggleScopeAll}
                    aria-label="Select all"
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableHead>
              ) : null}
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground",
                    col.sortable && "cursor-pointer select-none hover:text-foreground"
                  )}
                  onClick={() => col.sortable && toggleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable &&
                      (activeSortCol === col.key ? (
                        activeSortDir === "asc" ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-40" />
                      ))}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="h-24 text-center text-muted-foreground"
                >
                  No data
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row) => {
                const id = rowKey(row)
                const isSel = selectedSet.has(id)
                return (
                  <TableRow
                    key={id}
                    data-state={isSel ? "selected" : undefined}
                    onClick={() => handleRowClick(row)}
                    className={cn(
                      "transition-colors",
                      (onRowClick || selection?.selectOnRowClick) && "cursor-pointer",
                      isSel && "bg-primary/5",
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
                          aria-label="Select row"
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

      {paginate && totalPages > 1 ? (
        <div className="mt-2 flex items-center justify-between px-1 py-1">
          <span className="px-2 text-[12px] text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)}{" "}
            of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>

            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <Button
                key={p}
                type="button"
                variant={p === page ? "default" : "outline"}
                size="xs"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            ))}

            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
