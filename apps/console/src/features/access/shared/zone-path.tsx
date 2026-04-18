import { ChevronRight } from 'lucide-react';

export interface ZoneRef {
    id: string;
    name: string;
    parent_id?: string | null;
}

export function buildZonePathMap(zones: ZoneRef[]): Map<string, string> {
    const byId = new Map(zones.map((z) => [z.id, z]));
    const paths = new Map<string, string>();
    const inProgress = new Set<string>();
    const resolve = (id: string): string => {
        const cached = paths.get(id);
        if (cached !== undefined) return cached;
        if (inProgress.has(id)) return '';
        inProgress.add(id);
        const z = byId.get(id);
        if (!z) {
            inProgress.delete(id);
            return '';
        }
        const parentPath = z.parent_id ? resolve(z.parent_id) : '';
        const full = parentPath ? `${parentPath} / ${z.name}` : z.name;
        paths.set(id, full);
        inProgress.delete(id);
        return full;
    };
    zones.forEach((z) => resolve(z.id));
    return paths;
}

export function ZonePathLabel({ path }: { path: string }) {
    const segments = path.split(' / ').filter(Boolean);
    if (segments.length === 0) {
        return <span className="text-muted-foreground/60">—</span>;
    }
    const leaf = segments[segments.length - 1];
    const ancestors = segments.slice(0, -1);
    return (
        <span
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"
            title={path}
        >
            {ancestors.map((seg, i) => (
                <span key={`${seg}-${i}`} className="inline-flex items-center gap-1">
                    <span className="truncate max-w-[120px]">{seg}</span>
                    <ChevronRight size={10} className="text-muted-foreground/50 shrink-0" />
                </span>
            ))}
            <span className="font-medium text-foreground">{leaf}</span>
        </span>
    );
}
