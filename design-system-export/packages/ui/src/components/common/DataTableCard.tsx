import { useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { TablePaginationFooter, type TablePaginationFooterProps } from './TablePaginationFooter';
import { Button } from '../ui/button';
import { AppModal } from './AppModal';
import { Trash2, X } from 'lucide-react';

// Kept for DataTable to import
export type BulkAction = {
  label?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  className?: string;
  icon?: ReactNode;
  disabled?: boolean;
  size?: ComponentProps<typeof Button>['size'];
  'aria-label'?: string;
};

export type DataTableCardProps = {
  title: ReactNode;
  /** Pagination bar inside the card footer; omit or pass `false` to hide. */
  pagination?: TablePaginationFooterProps | false | null;
  children: ReactNode;
  className?: string;
  /** Number of currently selected rows. When > 0 the title bar switches to selection mode. */
  selectedCount?: number;
  /** Called when confirmed delete. Receives the count for display. */
  onBulkDelete?: () => Promise<void> | void;
  /** Called when the user clicks the X to clear the selection. */
  onClearSelection?: () => void;
  /** Label shown in the confirm dialog, e.g. "5 users". Defaults to "{count} items". */
  bulkDeleteLabel?: string;
};

/**
 * Card shell: title row, scrollable body (table + sticky header live here), optional pagination footer.
 * When `selectedCount > 0` the title bar switches to a bulk-action bar with a trash icon.
 */
export function DataTableCard({
  title,
  pagination,
  children,
  className,
  selectedCount = 0,
  onBulkDelete,
  onClearSelection,
  bulkDeleteLabel,
}: DataTableCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const paginationProps = pagination === false || pagination == null ? null : pagination;
  const hasSelection = selectedCount > 0;
  const label = bulkDeleteLabel ?? `${selectedCount} items`;

  const handleConfirm = async () => {
    if (!onBulkDelete) return;
    setDeleting(true);
    try {
      await onBulkDelete();
      setConfirmOpen(false);
      onClearSelection?.();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm',
          className
        )}
      >
        <div className="shrink-0 border-b border-border px-4 py-3">
          {hasSelection ? (
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-foreground">
                {selectedCount} selected
              </span>
              <div className="flex items-center gap-1">
                {onBulkDelete && (
                  <Button
                    size="sm"
                    onClick={() => setConfirmOpen(true)}
                    className="gap-1.5 border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  >
                    <Trash2 size={13} />
                    Delete {selectedCount}
                  </Button>
                )}
                {onClearSelection && (
                  <button
                    onClick={onClearSelection}
                    className="flex items-center px-1 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            title
          )}
        </div>
        <div className="min-h-0 min-w-0 flex-1 basis-0 overflow-y-auto overflow-x-auto overscroll-contain">
          {children}
        </div>
        {paginationProps ? <TablePaginationFooter {...paginationProps} /> : null}
      </div>

      <AppModal
        open={confirmOpen}
        onOpenChange={(open) => { if (!open && !deleting) setConfirmOpen(false); }}
        size="xs"
        style={{ maxWidth: '22rem' }}
        title={
          <span className="flex items-center gap-2 text-destructive">
            <Trash2 size={16} />
            Delete {label}
          </span>
        }
        showCancelButton
        cancelLabel="Cancel"
        cancelDisabled={deleting}
        primaryAction={{
          label: deleting ? 'Deleting...' : `Delete ${label}`,
          variant: 'outline',
          className: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
          onClick: handleConfirm,
          loading: deleting,
          disabled: deleting,
        }}
      >
        <p className="text-[13px] text-muted-foreground">
          Are you sure you want to delete{' '}
          <span className="font-medium text-foreground">{label}</span>? This action cannot be undone.
        </p>
      </AppModal>
    </>
  );
}
