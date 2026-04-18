import { useState, useEffect } from 'react';
import { Check, Copy, Building2, Sparkles, Gauge, AlertCircle } from 'lucide-react';
import { createCompany, type CreateCompanyResponse, type CreateCompanyRequest } from '@/lib/api';
import { AppModal, Button, Input, Label, Select, SelectOption, WizardModal } from '@dm3/ui';

interface CreateCompanyModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: () => void;
}

type StepId = 'info' | 'plan' | 'limits';

const STEPS = [
    { id: 'info' as StepId, label: 'Company Info', icon: Building2 },
    { id: 'plan' as StepId, label: 'Plan & Contact', icon: Sparkles },
    { id: 'limits' as StepId, label: 'Limits', icon: Gauge },
];

const PLANS = ['trial', 'starter', 'professional', 'enterprise'];

const EMPTY_FORM: CreateCompanyRequest = {
    name: '',
    code: '',
    email: '',
    plan: 'starter',
    address: '',
    phone: '',
    max_devices: 50,
    max_users: 20,
};

export function CreateCompanyModal({ open, onOpenChange, onCreated }: CreateCompanyModalProps) {
    const [step, setStep] = useState<StepId>('info');
    const [form, setForm] = useState<CreateCompanyRequest>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<CreateCompanyResponse | null>(null);
    const [copied, setCopied] = useState(false);

    const set = (k: keyof CreateCompanyRequest, v: string | number) =>
        setForm((f) => ({ ...f, [k]: v }));

    useEffect(() => {
        if (!open) {
            setStep('info');
            setForm(EMPTY_FORM);
            setError('');
            setResult(null);
            setCopied(false);
            setSubmitting(false);
        }
    }, [open]);

    const infoValid = !!form.name.trim() && !!form.code.trim() && !!form.email.trim();
    const canProceedFromInfo = infoValid;

    const handleSubmit = async () => {
        if (!infoValid || submitting) return;
        setSubmitting(true);
        setError('');
        try {
            const res = await createCompany(form);
            if (!res || !res.company) throw new Error('Invalid response from server');
            setResult(res);
            onCreated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create company');
        } finally {
            setSubmitting(false);
        }
    };

    const copyCredentials = () => {
        if (!result?.credentials) return;
        navigator.clipboard.writeText(
            `Email: ${result.credentials.email}\nPassword: ${result.credentials.password}`
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Success view
    if (result?.company) {
        return (
            <AppModal
                open={open}
                onOpenChange={onOpenChange}
                title={
                    <span className="flex items-center gap-2 text-success">
                        <Check size={16} />
                        Company Created
                    </span>
                }
                description={`${result.company.name} has been set up successfully.`}
                size="md"
                primaryAction={{
                    label: 'Done',
                    onClick: () => onOpenChange(false),
                    'data-testid': 'create-button-done',
                }}
            >
                <div className="space-y-4">
                    {result.credentials ? (
                        <div className="bg-muted/20 border border-border rounded-md p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] uppercase tracking-wider text-operate font-medium">
                                    Admin Credentials
                                </span>
                                <Button variant="ghost" size="icon-xs" onClick={copyCredentials}>
                                    {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                                </Button>
                            </div>
                            <div className="space-y-1.5 text-[13px]">
                                <div>
                                    <span className="text-muted-foreground">Email:</span>{' '}
                                    <span data-testid="create-label-gen-email" className="text-foreground font-mono">
                                        {result.credentials.email}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Password:</span>{' '}
                                    <span data-testid="create-label-gen-password" className="text-foreground font-mono">
                                        {result.credentials.password}
                                    </span>
                                </div>
                            </div>
                            <p className="text-[11px] text-warning mt-3">
                                ⚠ Save these credentials — the password won't be shown again.
                            </p>
                        </div>
                    ) : (
                        <p className="text-[13px] text-muted-foreground">
                            Company created successfully. Admin credentials will be provided separately.
                        </p>
                    )}
                </div>
            </AppModal>
        );
    }

    const goNext = () => {
        if (step === 'info' && canProceedFromInfo) setStep('plan');
        else if (step === 'plan') setStep('limits');
    };
    const goBack = () => {
        if (step === 'limits') setStep('plan');
        else if (step === 'plan') setStep('info');
    };

    const footer = (
        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                data-testid="create-button-cancel"
            >
                Cancel
            </Button>
            <div className="flex items-center gap-2">
                {step !== 'info' && (
                    <Button variant="outline" size="sm" onClick={goBack} disabled={submitting} data-testid="create-button-back">
                        Back
                    </Button>
                )}
                {step !== 'limits' ? (
                    <Button
                        size="sm"
                        onClick={goNext}
                        disabled={step === 'info' && !canProceedFromInfo}
                        data-testid="create-button-next"
                    >
                        Next
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={!infoValid || submitting}
                        loading={submitting}
                        data-testid="create-button-submit"
                    >
                        {submitting ? 'Creating…' : 'Create Company'}
                    </Button>
                )}
            </div>
        </div>
    );

    return (
        <WizardModal
            open={open}
            onOpenChange={onOpenChange}
            title={
                <span className="flex items-center gap-2">
                    <Building2 size={16} className="text-primary" />
                    Create Company
                </span>
            }
            description="Provision a new tenant and generate admin credentials."
            size="lg"
            steps={STEPS}
            activeStep={step}
            footer={footer}
        >
            {error && (
                <div
                    data-testid="create-text-error"
                    className="mb-4 px-3 py-2 bg-error/10 border border-error/30 rounded-md text-error text-[13px] flex items-center gap-2"
                >
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {step === 'info' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Name *</Label>
                            <Input
                                data-testid="create-input-name"
                                required
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                placeholder="Acme Corp"
                                disabled={submitting}
                                autoFocus
                            />
                        </div>
                        <div>
                            <Label>Code *</Label>
                            <Input
                                data-testid="create-input-code"
                                required
                                value={form.code}
                                onChange={(e) => set('code', e.target.value.toUpperCase())}
                                placeholder="ACME"
                                disabled={submitting}
                            />
                        </div>
                    </div>
                    <div>
                        <Label>Admin Email *</Label>
                        <Input
                            data-testid="create-input-email"
                            required
                            type="email"
                            value={form.email}
                            onChange={(e) => set('email', e.target.value)}
                            placeholder="manager@acme.com"
                            disabled={submitting}
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                            A primary manager account will be created with this email.
                        </p>
                    </div>
                </div>
            )}

            {step === 'plan' && (
                <div className="space-y-4">
                    <div>
                        <Label>Plan</Label>
                        <Select
                            data-testid="create-select-plan"
                            value={form.plan}
                            onChange={(e) => set('plan', e.target.value)}
                            disabled={submitting}
                        >
                            {PLANS.map((p) => (
                                <SelectOption key={p} value={p}>
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                </SelectOption>
                            ))}
                        </Select>
                    </div>
                    <div>
                        <Label>Phone</Label>
                        <Input
                            data-testid="create-input-phone"
                            value={form.phone}
                            onChange={(e) => set('phone', e.target.value)}
                            placeholder="+84..."
                            disabled={submitting}
                        />
                    </div>
                    <div>
                        <Label>Address</Label>
                        <Input
                            data-testid="create-input-address"
                            value={form.address}
                            onChange={(e) => set('address', e.target.value)}
                            placeholder="123 Main St"
                            disabled={submitting}
                        />
                    </div>
                </div>
            )}

            {step === 'limits' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Max Devices</Label>
                            <Input
                                data-testid="create-input-maxDevices"
                                type="number"
                                value={form.max_devices}
                                onChange={(e) => set('max_devices', +e.target.value)}
                                disabled={submitting}
                            />
                        </div>
                        <div>
                            <Label>Max Users</Label>
                            <Input
                                data-testid="create-input-maxUsers"
                                type="number"
                                value={form.max_users}
                                onChange={(e) => set('max_users', +e.target.value)}
                                disabled={submitting}
                            />
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        These limits can be adjusted later from the company detail page.
                    </p>
                </div>
            )}
        </WizardModal>
    );
}
