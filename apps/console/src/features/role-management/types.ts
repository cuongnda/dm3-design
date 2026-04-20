export type {
    RbacRoleDTO as Role,
    RbacRoleWriteRequest as RoleWriteRequest,
    RbacPermissionDTO as Permission,
    RbacAssignmentDTO as Assignment,
    RbacAssignmentCreateRequest as AssignmentCreateRequest,
    RbacEligibleAccountDTO as EligibleAccount,
} from '@/lib/api';

export type ScopeType = 'company' | 'site' | 'department' | 'zone' | 'self';

export const SCOPE_TYPES: readonly ScopeType[] = ['company', 'site', 'department', 'zone', 'self'] as const;
