import { useTranslation } from 'react-i18next';
import { Building2, Shield, CreditCard, Calendar, Plus, ArrowRight } from 'lucide-react';
import { Button, Badge } from '@dm3/ui';
import type { User } from '../types';

interface UserAccessGroup {
  id: string;
  name: string;
  is_default: boolean;
  access_point_count: number;
}

interface Credential {
  id: string;
  type: string;
  status: string;
}

interface UserSummaryCardProps {
  user: User;
  userGroups: UserAccessGroup[];
  credentials: Credential[];
  loadingGroups?: boolean;
  loadingCreds?: boolean;
  onAssignAccessGroup: () => void;
  onGoToAccessTab: () => void;
  onGoToCredentialsTab: () => void;
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

export function UserSummaryCard({
  user,
  userGroups,
  credentials,
  loadingGroups,
  loadingCreds,
  onAssignAccessGroup,
  onGoToAccessTab,
  onGoToCredentialsTab,
}: UserSummaryCardProps) {
  const { t } = useTranslation('users');

  const activeCreds = credentials.filter((c) => c.status === 'active');
  const effective = formatDate(user.effective_date);
  const expires = formatDate(user.expired_date);
  const topGroups = userGroups.slice(0, 3);
  const extraGroups = userGroups.length - topGroups.length;

  return (
    <aside
      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-3"
      data-testid="user-summary-card"
    >
      {/* Department */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Building2 size={11} />
          {t('summary.department', 'Department')}
        </div>
        <div className="text-[13px] font-medium text-foreground">
          {user.department_name || (
            <span className="text-muted-foreground font-normal">
              {t('summary.noDepartment', 'No department')}
            </span>
          )}
        </div>
      </section>

      <div className="h-px bg-border/50" />

      {/* Access Groups */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Shield size={11} />
            {t('summary.accessGroups', 'Access Groups')}
            {userGroups.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-foreground">
                {userGroups.length}
              </span>
            )}
          </div>
        </div>

        {loadingGroups ? (
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        ) : userGroups.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {t('summary.noAccessGroups', 'No access groups assigned')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {topGroups.map((g) => (
              <Badge key={g.id} variant="secondary" className="text-[11px] font-normal">
                {g.name}
              </Badge>
            ))}
            {extraGroups > 0 && (
              <Badge variant="outline" className="text-[11px] font-normal">
                +{extraGroups} {t('summary.moreGroups', 'more')}
              </Badge>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={onAssignAccessGroup}
            className="h-7 w-full justify-start text-[12px]"
            data-testid="user-summary-assign-access-group"
          >
            <Plus size={13} className="mr-1.5" />
            {t('summary.assignAccessGroup', 'Assign Access Group')}
          </Button>
          {userGroups.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onGoToAccessTab}
              className="h-6 w-full justify-between text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t('summary.manageGroups', 'Manage groups')}
              <ArrowRight size={11} />
            </Button>
          )}
        </div>
      </section>

      <div className="h-px bg-border/50" />

      {/* Credentials */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <CreditCard size={11} />
          {t('summary.credentials', 'Credentials')}
        </div>
        {loadingCreds ? (
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        ) : credentials.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {t('summary.noCredentials', 'No credentials issued')}
          </p>
        ) : (
          <button
            type="button"
            onClick={onGoToCredentialsTab}
            className="group flex items-baseline gap-2 text-left"
          >
            <span className="text-[18px] font-semibold text-foreground tabular-nums group-hover:text-primary transition-colors">
              {activeCreds.length}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {t('summary.activeSuffix', 'active of {{total}}', { total: credentials.length })}
            </span>
          </button>
        )}
      </section>

      <div className="h-px bg-border/50" />

      {/* Validity */}
      <section className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Calendar size={11} />
          {t('summary.validity', 'Validity')}
        </div>
        {effective || expires ? (
          <div className="space-y-0.5 text-[12px]">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                {t('summary.validFrom', 'From')}
              </span>
              <span className="text-foreground tabular-nums">{effective || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                {t('summary.validTo', 'Until')}
              </span>
              <span className="text-foreground tabular-nums">
                {expires || t('summary.noExpiry', 'No expiry')}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            {t('summary.noValidity', 'No validity dates set')}
          </p>
        )}
      </section>
    </aside>
  );
}
