import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, UserPlus, UserMinus, Search, User, Mail, Building2, Check } from 'lucide-react';
import {
    AppModal,
    Button,
    Input,
    Badge,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@dm3/ui';
import type { Department, DepartmentUser } from '../types';

interface UserAssignModalProps {
    isOpen: boolean;
    onClose: () => void;
    department: Department | null;
}

interface AvailableUser {
    id: string;
    user_code: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    position?: string;
    department_name?: string;
    status: string;
}

export function UserAssignModal({ isOpen, onClose, department }: UserAssignModalProps) {
    const { t } = useTranslation('departments');

    const [loading, setLoading] = useState(false);
    const [currentUsers, setCurrentUsers] = useState<DepartmentUser[]>([]);
    const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'current' | 'assign'>('current');

    const getAuthHeaders = () => {
        const token = localStorage.getItem('dm3-token');
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
    };

    const showToast = (options: { title: string; description: string; variant?: 'default' | 'destructive' }) => {
        console.log('Toast:', options.title, options.description);
    };

    const fetchCurrentUsers = async () => {
        if (!department) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/v1/identity/departments/${department.id}/users`, {
                headers: getAuthHeaders(),
            });
            if (!response.ok) throw new Error('Failed to fetch current users');
            const data = await response.json();
            setCurrentUsers(data.users || []);
        } catch (err) {
            console.error('Error fetching current users:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchAvailableUsers = async () => {
        if (!department) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/v1/identity/departments/${department.id}/available-users`, {
                headers: getAuthHeaders(),
            });
            if (!response.ok) throw new Error('Failed to fetch available users');
            const data = await response.json();
            setAvailableUsers(data.users || []);
        } catch (err) {
            console.error('Error fetching available users:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignUsers = async () => {
        if (!department || selectedUsers.length === 0) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/v1/identity/departments/${department.id}/users`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ user_ids: selectedUsers }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to assign users');
            }
            showToast({ title: 'Success', description: `${selectedUsers.length} users assigned successfully` });
            setSelectedUsers([]);
            await fetchCurrentUsers();
            await fetchAvailableUsers();
            setActiveTab('current');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to assign users';
            showToast({ title: 'Error', description: message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveUser = async (userId: string) => {
        if (!department) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/v1/identity/departments/${department.id}/users/${userId}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to remove user');
            }
            showToast({ title: 'Success', description: 'User removed from department' });
            await fetchCurrentUsers();
            await fetchAvailableUsers();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to remove user';
            showToast({ title: 'Error', description: message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const filteredAvailableUsers = availableUsers.filter(
        (user) =>
            user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.user_code.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const filteredCurrentUsers = currentUsers.filter(
        (user) =>
            user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.user_code.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    useEffect(() => {
        if (isOpen && department) {
            fetchCurrentUsers();
            fetchAvailableUsers();
            setSelectedUsers([]);
            setSearchTerm('');
            setActiveTab('current');
        }
    }, [isOpen, department]);

    if (!department) return null;

    return (
        <AppModal
            open={isOpen}
            onOpenChange={onClose}
            title={
                <span className="flex items-center gap-2">
                    <Users size={16} />
                    {t('assign.title', { name: department.name })}
                </span>
            }
            size="2xl"
            showCancelButton
            cancelLabel={t('close')}
        >
            <Tabs
                value={activeTab}
                onValueChange={(v) => {
                    setActiveTab(v as 'current' | 'assign');
                    setSearchTerm('');
                }}
                className="flex flex-col flex-1 min-h-0"
            >
                {/* Toolbar */}
                <div className="flex items-center gap-2 shrink-0 mb-3">
                    <div className="relative flex-1">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder={t('assign.searchPlaceholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-8 text-[13px]"
                        />
                    </div>
                    <TabsList className="shrink-0">
                        <TabsTrigger value="current" className="text-[12px] px-3">
                            <Users size={13} className="mr-1.5" />
                            {t('assign.currentTab')} ({currentUsers.length})
                        </TabsTrigger>
                        <TabsTrigger value="assign" className="text-[12px] px-3">
                            <UserPlus size={13} className="mr-1.5" />
                            {selectedUsers.length > 0 ? t('assign.assignTab') + ` (${selectedUsers.length})` : t('assign.assignTab')}
                        </TabsTrigger>
                    </TabsList>
                    {activeTab === 'assign' && selectedUsers.length > 0 && (
                        <Button size="sm" onClick={handleAssignUsers} disabled={loading} className="shrink-0">
                            <Check size={13} className="mr-1.5" />
                            {t('assign.assignBtn', { count: selectedUsers.length })}
                        </Button>
                    )}
                </div>

                {/* Current Users Tab */}
                <TabsContent value="current" className="flex-1 overflow-auto min-h-0 mt-0">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                        </div>
                    ) : filteredCurrentUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Users size={36} className="text-muted-foreground/40 mb-3" />
                            <p className="text-[13px] font-medium text-foreground">
                                {currentUsers.length === 0 ? t('assign.noUsersInDept') : t('assign.noUsersMatch')}
                            </p>
                            <p className="text-[12px] text-muted-foreground mt-1">
                                {currentUsers.length === 0 ? t('assign.switchToAssign') : t('assign.tryDifferentSearch')}
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[11px]">{t('assign.colUser')}</TableHead>
                                    <TableHead className="text-[11px]">{t('assign.colEmail')}</TableHead>
                                    <TableHead className="text-[11px]">{t('assign.colPosition')}</TableHead>
                                    <TableHead className="text-[11px]">{t('assign.colStatus')}</TableHead>
                                    <TableHead className="w-20 text-[11px]" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredCurrentUsers.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                                    <User size={12} className="text-primary" />
                                                </div>
                                                <div>
                                                    <div className="text-[13px] font-medium">
                                                        {user.first_name} {user.last_name}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">#{user.user_code}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-[13px]">
                                            <div className="flex items-center gap-1.5">
                                                <Mail size={12} className="shrink-0 text-muted-foreground" />
                                                {user.email}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-[13px]">{user.position || '—'}</TableCell>
                                        <TableCell>
                                            <Badge variant={user.status === 'active' ? 'default' : 'secondary'} className="text-[11px]">
                                                {user.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-[12px] text-destructive hover:text-destructive"
                                                onClick={() => handleRemoveUser(user.id)}
                                                disabled={loading}
                                            >
                                                <UserMinus size={13} className="mr-1" />
                                                {t('assign.removeBtn')}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </TabsContent>

                {/* Assign Users Tab */}
                <TabsContent value="assign" className="flex-1 overflow-auto min-h-0 mt-0">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                        </div>
                    ) : filteredAvailableUsers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <UserPlus size={36} className="text-muted-foreground/40 mb-3" />
                            <p className="text-[13px] font-medium text-foreground">
                                {availableUsers.length === 0 ? t('assign.noUsersAvailable') : t('assign.noUsersMatch')}
                            </p>
                            <p className="text-[12px] text-muted-foreground mt-1">
                                {availableUsers.length === 0 ? t('assign.allAssigned') : t('assign.tryDifferentSearch')}
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 cursor-pointer"
                                            checked={selectedUsers.length === filteredAvailableUsers.length && filteredAvailableUsers.length > 0}
                                            onChange={(e) => {
                                                setSelectedUsers(e.target.checked ? filteredAvailableUsers.map((u) => u.id) : []);
                                            }}
                                        />
                                    </TableHead>
                                    <TableHead className="text-[11px]">{t('assign.colUser')}</TableHead>
                                    <TableHead className="text-[11px]">{t('assign.colEmail')}</TableHead>
                                    <TableHead className="text-[11px]">{t('assign.colDepartment')}</TableHead>
                                    <TableHead className="text-[11px]">{t('assign.colPosition')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAvailableUsers.map((user) => (
                                    <TableRow
                                        key={user.id}
                                        className="cursor-pointer"
                                        onClick={() => {
                                            setSelectedUsers((prev) =>
                                                prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id],
                                            );
                                        }}
                                    >
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 cursor-pointer"
                                                checked={selectedUsers.includes(user.id)}
                                                onChange={(e) => {
                                                    setSelectedUsers((prev) =>
                                                        e.target.checked ? [...prev, user.id] : prev.filter((id) => id !== user.id),
                                                    );
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                                    <User size={12} className="text-primary" />
                                                </div>
                                                <div>
                                                    <div className="text-[13px] font-medium">
                                                        {user.first_name} {user.last_name}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">#{user.user_code}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-[13px]">
                                            <div className="flex items-center gap-1.5">
                                                <Mail size={12} className="shrink-0 text-muted-foreground" />
                                                {user.email}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {user.department_name ? (
                                                <Badge variant="outline" className="text-[11px]">
                                                    <Building2 size={11} className="mr-1" />
                                                    {user.department_name}
                                                </Badge>
                                            ) : (
                                                <span className="text-[12px] text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-[13px]">{user.position || '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </TabsContent>
            </Tabs>
        </AppModal>
    );
}
