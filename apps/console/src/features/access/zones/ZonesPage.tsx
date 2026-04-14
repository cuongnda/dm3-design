import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Edit, MapPin, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import {
  AppModal,
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@dm3/ui';
import { useZones } from './hooks/useZones';
import type { Zone } from './types';

interface ZoneTreeNode {
  zone: Zone;
  children: ZoneTreeNode[];
  level: number;
}

function buildZoneTree(zones: Zone[]): ZoneTreeNode[] {
  const nodeMap = new Map<string, ZoneTreeNode>();
  const roots: ZoneTreeNode[] = [];

  const sortedZones = [...zones].sort((a, b) => a.name.localeCompare(b.name));
  for (const zone of sortedZones) {
    nodeMap.set(zone.id, { zone, children: [], level: 0 });
  }

  for (const zone of sortedZones) {
    const node = nodeMap.get(zone.id);
    if (!node) continue;
    if (zone.parent_id && nodeMap.has(zone.parent_id)) {
      const parent = nodeMap.get(zone.parent_id)!;
      node.level = parent.level + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function filterZoneTree(nodes: ZoneTreeNode[], query: string): ZoneTreeNode[] {
  if (!query.trim()) return nodes;
  const q = query.trim().toLowerCase();

  return nodes
    .map((node) => {
      const matches = [
        node.zone.name,
        node.zone.description,
        node.zone.building,
        node.zone.floor,
        node.zone.timezone,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));

      const children = filterZoneTree(node.children, q);
      if (!matches && children.length === 0) return null;
      return { ...node, children };
    })
    .filter((node): node is ZoneTreeNode => Boolean(node));
}

function flattenTree(nodes: ZoneTreeNode[]): ZoneTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

export function ZonesPage() {
  const { t } = useTranslation('zones');
  const navigate = useNavigate();
  const { zones, loading, pagination, deleteZone } = useZones();

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [zoneToDelete, setZoneToDelete] = useState<Zone | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const zoneTree = useMemo(() => buildZoneTree(zones), [zones]);
  const visibleTree = useMemo(() => filterZoneTree(zoneTree, search), [zoneTree, search]);
  const visibleNodes = useMemo(() => flattenTree(visibleTree), [visibleTree]);
  const zoneMap = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones]);

  const toggleExpanded = (zoneId: string) => {
    setExpanded((prev) => ({ ...prev, [zoneId]: !prev[zoneId] }));
  };

  const openCreate = () => navigate('/access/zones/new');
  const openEdit = (zone: Zone) => navigate(`/access/zones/${zone.id}/edit`);

  const openDelete = (zone: Zone) => {
    setZoneToDelete(zone);
    setDeleteError(null);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!zoneToDelete) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const ok = await deleteZone(zoneToDelete.id);
      if (ok) {
        setShowDeleteDialog(false);
        setZoneToDelete(null);
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('deleteFailed', 'Delete failed'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const renderNode = (node: ZoneTreeNode) => {
    const isExpanded = expanded[node.zone.id] ?? true;
    const hasChildren = node.children.length > 0;
    const parentName = node.zone.parent_id ? zoneMap.get(node.zone.parent_id)?.name : undefined;

    return (
      <div key={node.zone.id} className="space-y-2">
        <div
          className="group rounded-xl border border-border/60 bg-card/70 p-3 transition hover:border-primary/40 hover:bg-card"
          style={{ marginLeft: `${node.level * 20}px` }}
          data-testid={`zones-tree-node-${node.zone.id}`}
        >
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="mt-1 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground disabled:opacity-40"
              onClick={() => toggleExpanded(node.zone.id)}
              disabled={!hasChildren}
              data-testid={`zones-tree-toggle-${node.zone.id}`}
            >
              {hasChildren ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <MapPin size={12} />}
            </button>

            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => navigate(`/access/zones/${node.zone.id}`)}
              data-testid={`zones-tree-open-${node.zone.id}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{node.zone.name}</span>
                <Badge variant="secondary">{node.zone.access_point_count} {t('summary.accessPoints', 'APs')}</Badge>
                {node.zone.map_image_url ? <Badge variant="default">{t('badges.mapReady', 'Map ready')}</Badge> : <Badge variant="outline">{t('badges.noMap', 'No map')}</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{node.zone.building || '—'} / {node.zone.floor || '—'}</span>
                <span>{node.zone.timezone || '—'}</span>
                {parentName ? <span>{t('parentLabel', 'Parent')}: {parentName}</span> : null}
              </div>
              {node.zone.description ? <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{node.zone.description}</p> : null}
            </button>

            <div onClick={(event) => event.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid={`zones-row-menu-${node.zone.id}`}>
                    <MoreHorizontal size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/access/zones/${node.zone.id}`)}>
                    {t('actions.openDetail', 'Open detail')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openEdit(node.zone)}>
                    <Edit size={14} className="mr-2" />
                    {t('actions.edit', 'Edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openDelete(node.zone)} className="text-destructive">
                    <Trash2 size={14} className="mr-2" />
                    {t('actions.delete', 'Delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {hasChildren && isExpanded ? node.children.map(renderNode) : null}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Zones')}</h1>
          <p className="text-[13px] text-muted-foreground">{t('description', 'Manage spatial zones, indoor maps, and access point layouts')}</p>
        </div>
        <Button size="sm" onClick={openCreate} data-testid="zones-button-add">
          <Plus size={14} className="mr-1.5" />
          {t('addZone', 'Add Zone')}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder', 'Search zones...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="zones-input-search"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{visibleNodes.length} {t('summary.visible', 'visible')}</Badge>
          <Badge variant="outline">{pagination.total || zones.length} {t('summary.total', 'total')}</Badge>
        </div>
      </div>

      <Card className="min-h-0 flex-1 overflow-auto border-border/60 bg-card/70 p-4" data-testid="zones-tree-card">
        {loading ? (
          <div className="flex justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /></div>
        ) : visibleTree.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">
            {search ? t('noResults', 'No zones match your search') : t('empty', 'No zones yet. Add the first one.')}
          </div>
        ) : (
          <div className="space-y-2">{visibleTree.map(renderNode)}</div>
        )}
      </Card>

      <AppModal open={showDeleteDialog} onOpenChange={(open) => { if (!open) { setShowDeleteDialog(false); setZoneToDelete(null); setDeleteError(null); } }} title={<span className="flex items-center gap-2 text-destructive"><Trash2 size={16} />{t('deleteZone', 'Delete Zone')}</span>} size="xs" style={{ maxWidth: '22rem' }} showCancelButton cancelLabel={t('cancel', 'Cancel')} cancelDisabled={deleteLoading} errorMessage={deleteError ?? undefined} primaryAction={{ label: deleteLoading ? t('deleting', 'Deleting...') : t('delete', 'Delete'), variant: 'destructive', onClick: handleDeleteConfirm, loading: deleteLoading, disabled: deleteLoading }}>
        <p className="text-[13px] text-muted-foreground">{t('deleteConfirm', 'Are you sure you want to delete')} <span className="font-medium text-foreground">"{zoneToDelete?.name}"</span>?</p>
      </AppModal>
    </div>
  );
}
