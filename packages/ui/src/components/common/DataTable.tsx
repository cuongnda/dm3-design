import { useMemo, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react"

import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table"

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  pageSize?: number;
}

type SortDir = 'asc' | 'desc' | null;

export function DataTable<T>({ columns, data, rowKey, onRowClick, rowClassName, pageSize = 15 }: DataTableProps<T>) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sortCol || !sortDir) return data;
    const col = columns.find((c) => c.key === sortCol);
    if (!col) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol];
      const bv = (b as Record<string, unknown>)[sortCol];
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortCol, sortDir, columns]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: string) => {
    if (sortCol !== key) { setSortCol(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortCol(null); setSortDir(null); }
  };

  return (
    <div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
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
                    {col.sortable && (
                      sortCol === col.key ? (
                        sortDir === "asc" ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-40" />
                      )
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No data
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row)
                  )}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className="px-3 py-2.5 text-[13px]">
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between px-1 py-1">
          <span className="text-muted-foreground px-2 text-[12px]">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
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
      )}
    </div>
  );
}
