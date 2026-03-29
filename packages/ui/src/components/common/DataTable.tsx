import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';

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
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'text-left px-3 py-2 text-[11px] font-medium uppercase tracking-[0.05em] text-[#64748B] bg-[#111827] border-b border-[#1E293B] sticky top-0',
                  col.sortable && 'cursor-pointer select-none hover:text-[#94A3B8]'
                )}
                onClick={() => col.sortable && toggleSort(col.key)}
              >
                <span className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    sortCol === col.key ? (
                      sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                    ) : (
                      <ChevronsUpDown size={12} className="opacity-40" />
                    )
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'border-b border-[#1E293B] hover:bg-[#1a2235] transition-colors',
                onRowClick && 'cursor-pointer',
                rowClassName?.(row)
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2.5 text-[13px]">
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-3 mt-2">
          <span className="text-[12px] text-[#64748B]">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 bg-[#1E293B] border border-[#334155] rounded text-[#94A3B8] text-[12px] disabled:opacity-40"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  'px-2.5 py-1 rounded text-[12px] border',
                  p === page
                    ? 'bg-[#2563EB] text-white border-[#2563EB]'
                    : 'bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC]'
                )}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 bg-[#1E293B] border border-[#334155] rounded text-[#94A3B8] text-[12px] disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
