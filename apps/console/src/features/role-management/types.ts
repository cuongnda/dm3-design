export type {
    RbacRoleDTO as Role,
    RbacRoleWriteRequest as RoleWriteRequest,
    RbacPermissionDTO as Permission,
    RbacAssignmentDTO as Assignment,
    RbacAssignmentCreateRequest as AssignmentCreateRequest,
    RbacEligibleAccountDTO as EligibleAccount,
} from '@/lib/api';

// NOTE: The backend catalog supports 'site' scope for future multi-site deployments,
// but DM3 currently models one company per tenant — no Site entity is exposed in the
// UI yet. Keep 'site' out of ScopeType/SCOPE_TYPES until sites are modeled so users
// can't create unassignable grants. Re-add here when Site CRUD ships.
export type ScopeType = 'company' | 'department' | 'zone' | 'self';

export const SCOPE_TYPES: readonly ScopeType[] = ['company', 'department', 'zone', 'self'] as const;
