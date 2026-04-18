import { useState, useEffect } from 'react';
import { Check, Copy, Building2, AlertCircle, Shield, UserPlus, AlertTriangle } from 'lucide-react';
import { createUserAccount, type CreateUserAccountResponse, type CreateUserAccountRequest } from '@/lib/api-users';
import { fetchCompanies, type CompanyDTO } from '@/lib/api';
import { AppModal, Button, Input, Label, Select, SelectOption, type SelectRichOption as Option } from '@dm3/ui';

interface CreateUserAccountModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: () => void;
}

const EMPTY_FORM: CreateUserAccountRequest = {
    email: '',
    name: '',
    role: 'viewer',
    company_id: '',
    send_email: false,
};

export function CreateUserAccountModal({ open, onOpenChange, onCreated }: CreateUserAccountModalProps) {
    const [companies, setCompanies] = useState<CompanyDTO[]>([]);
    const [loadingCompanies, setLoadingCompanies] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<CreateUserAccountResponse | null>(null);
    const [copied, setCopied] = useState(false);
    const [form, setForm] = useState<CreateUserAccountRequest>(EMPTY_FORM);

    const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

    useEffect(() => {
        if (!open) {
            setForm(EMPTY_FORM);
            setError('');
            setResult(null);
            setCopied(false);
            setSubmitting(false);
            return;
        }
        setLoadingCompanies(true);
        fetchCompanies()
            .then(setCompanies)
            .catch((err) => setError('Failed to load companies: ' + err.message))
            .finally(() => setLoadingCompanies(false));
    }, [open]);

    const companyOptions: Option[] = [
        {
            value: '',
            label: 'No Company (System Admin only)',
            icon: <Shield size={14} className="text-error" />,
        },
        ...companies.map(company => ({
            value: company.id,
            label: company.name,
            description: `(${company.code})`,
            icon: <Building2 size={14} className="text-muted-foreground" />,
        })),
    ];

    const canSubmit = !!form.email && !!form.name && !submitting;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        const finalForm = { ...form };
        if (!finalForm.company_id) finalForm.role = 'system_admin';

        setSubmitting(true);
        setError('');
        try {
            const res = await createUserAccount(finalForm);
            setResult(res);
            onCreated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create user account');
        } finally {
            setSubmitting(false);
        }
    };

    const copyCredentials = () => {
        if (!result) return;
        navigator.clipboard.writeText(`Email: ${result.user.email}\nPassword: ${result.password}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (result) {
        return (
            <AppModal
                open={open}
                onOpenChange={onOpenChange}
                title={
                    <span className="flex items-center gap-2 text-success">
                        <Check size={16} />
                        User Account Created
                    </span>
                }
                description={`${result.user.name} (${result.user.email}) has been created.`}
                size="md"
                primaryAction={{
                    label: 'Done',
                    onClick: () => onOpenChange(false),
                    'data-testid': 'create-button-done',
                }}
            >
                <div className="space-y-4">
                    <div className="bg-muted/20 border border-border rounded-md p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] uppercase tracking-wider text-operate font-medium">
                                Login Credentials
                            </span>
                            <Button variant="ghost" size="icon-xs" onClick={copyCredentials}>
                                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                            </Button>
                        </div>
                        <div className="space-y-1.5 text-[13px]">
                            <div>
                                <span className="text-muted-foreground">Email:</span>{' '}
                                <span data-testid="create-label-gen-email" className="text-foreground font-mono">
                                    {result.user.email}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Password:</span>{' '}
                                <span data-testid="create-label-gen-password" className="text-foreground font-mono">
                                    {result.password}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Role:</span>{' '}
                                <span className="text-foreground">
                                    {result.user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                            </div>
                        </div>
                        <p className="text-[11px] text-warning mt-3 inline-flex items-center gap-1">
                            <AlertTriangle size={11} /> Save these credentials — the password won't be shown again.
                        </p>
                    </div>
                </div>
            </AppModal>
        );
    }

    return (
        <AppModal
            open={open}
            onOpenChange={onOpenChange}
            title={
                <span className="flex items-center gap-2">
                    <UserPlus size={16} className="text-primary" />
                    Create User Account
                </span>
            }
            description="Provision a new login. A temporary password will be generated."
            size="lg"
            showCancelButton
            cancelLabel="Cancel"
            cancelDisabled={submitting}
            errorMessage={error || undefined}
            submitDisabled={!canSubmit}
            primaryAction={{
                label: submitting ? 'Creating…' : 'Create User Account',
                onClick: handleSubmit,
                loading: submitting,
                'data-testid': 'create-button-submit',
            }}
        >
            <div className="space-y-5">
                {error && (
                    <div data-testid="create-text-error" className="px-3 py-2 bg-error/10 border border-error/30 rounded-md text-error text-[13px] flex items-center gap-2">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Name *</Label>
                        <Input
                            data-testid="create-input-name"
                            required
                            value={form.name}
                            onChange={(e) => set('name', e.target.value)}
                            placeholder="John Doe"
                            disabled={submitting}
                            autoFocus
                        />
                    </div>
                    <div>
                        <Label>Email *</Label>
                        <Input
                            data-testid="create-input-email"
                            required
                            type="email"
                            value={form.email}
                            onChange={(e) => set('email', e.target.value)}
                            placeholder="john@company.com"
                            disabled={submitting}
                        />
                    </div>
                </div>

                <div>
                    <Label>Company</Label>
                    {loadingCompanies ? (
                        <div className="h-9 px-3 bg-input border border-border rounded-md text-[13px] text-muted-foreground flex items-center">
                            Loading companies...
                        </div>
                    ) : (
                        <Select
                            options={companyOptions}
                            value={form.company_id || ''}
                            placeholder="Select a company or leave empty for system admin"
                            searchPlaceholder="Search companies..."
                            onValueChange={(value) => set('company_id', value)}
                            disabled={submitting}
                        />
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Leave empty to create a system admin account
                    </p>
                </div>

                <div>
                    <Label>Role</Label>
                    <Select
                        data-testid="create-select-role"
                        value={form.role}
                        onChange={(e) => set('role', e.target.value)}
                        disabled={!form.company_id || submitting}
                        className="w-full"
                    >
                        <SelectOption value="viewer">Viewer</SelectOption>
                        <SelectOption value="operator">Operator</SelectOption>
                        <SelectOption value="manager">Manager</SelectOption>
                        <SelectOption value="primary_manager">Primary Manager</SelectOption>
                    </Select>
                    {!form.company_id && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                            System admin role will be assigned automatically
                        </p>
                    )}
                </div>
            </div>
        </AppModal>
    );
}
