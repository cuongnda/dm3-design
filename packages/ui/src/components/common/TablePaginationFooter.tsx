import { ArrowDownUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Select } from '../ui/select';
import { cn } from '../../lib/utils';

export type SortColumnOption = { value: string; label: string };

export type TablePaginationFooterProps = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  loading?: boolean;
  className?: string;
  'data-testid'?: string;
  /** If provided, shows a "Sort by" select in the footer */
  sortColumns?: SortColumnOption[];
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc' | null;
  onSortChange?: (col: string | null, dir: 'asc' | 'desc' | null) => void;
};

function visiblePages(current: number, total: number, maxButtons: number): number[] {
  if (total <= 0) return [];
  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  let start = Math.max(1, current - Math.floor(maxButtons / 2));
  let end = start + maxButtons - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - maxButtons + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function TablePaginationFooter({
  page,
  pageSize,
  total,
  totalPages,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  loading = false,
  className,
  'data-testid': testId = 'table-pagination-footer',
  sortColumns,
  sortBy,
  sortDir,
  onSortChange,
}: TablePaginationFooterProps) {
  if (total <= 0) {
    return null;
  }

  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const pages = visiblePages(safePage, safeTotalPages, 5);

  return (
    <div
      data-testid={testId}
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[12px] text-muted-foreground">
          Page {safePage} of {safeTotalPages} · {total} total
        </p>
        {onPageSizeChange ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground whitespace-nowrap">Per page</span>
            <Select
              className="w-18 shrink-0 [&_button]:h-8 [&_button]:px-2 [&_button]:text-xs"
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
              disabled={loading}
              options={pageSizeOptions.map((n) => ({
                value: String(n),
                label: String(n),
              }))}
              data-testid={`${testId}-page-size`}
            />
          </div>
        ) : null}
        {sortColumns && onSortChange ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground whitespace-nowrap">Sort</span>
            <Select
              className="w-32 shrink-0 [&_button]:h-8 [&_button]:px-2 [&_button]:text-xs"
              value={sortBy ?? ''}
              placeholder="Default"
              onValueChange={(v) => onSortChange(v || null, v ? (sortDir ?? 'asc') : null)}
              disabled={loading}
              options={sortColumns}
            />
            {sortBy && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => onSortChange(sortBy, sortDir === 'asc' ? 'desc' : 'asc')}
                disabled={loading}
                title={sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
              >
                {sortDir === 'desc' ? <ArrowDownUp size={13} /> : <ArrowUpDown size={13} />}
              </Button>
            )}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1 || loading}
          data-testid={`${testId}-prev`}
        >
          <ChevronLeft size={14} />
        </Button>
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === safePage ? 'default' : 'outline'}
            size="sm"
            className="w-8 px-0"
            onClick={() => onPageChange(p)}
            disabled={loading}
            data-testid={`${testId}-page-${p}`}
          >
            {p}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
          disabled={safePage === safeTotalPages || loading}
          data-testid={`${testId}-next`}
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
