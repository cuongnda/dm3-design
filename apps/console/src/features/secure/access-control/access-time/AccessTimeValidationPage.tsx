import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { PageHeader, Card, Button, Input, Badge, Select, SelectOption } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useValidateAccessTime } from '@/lib/hooks';
import { fetchPersons, type PersonDTO, type ValidateAccessResponseDTO } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export function AccessTimeValidationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [userId, setUserId] = useState('');
  const [requestedDate, setRequestedDate] = useState(new Date().toISOString().split('T')[0]);
  const [requestedTime, setRequestedTime] = useState(new Date().toTimeString().substring(0, 5));
  const [results, setResults] = useState<Array<{ result: ValidateAccessResponseDTO; userId: string; time: string }>>([]);

  const { data: personsData } = useQuery({
    queryKey: ['persons-for-validate'],
    queryFn: () => fetchPersons(1, 100),
  });
  const persons = personsData?.data ?? [];

  const validateMutation = useValidateAccessTime();

  const handleValidate = () => {
    if (!userId) return;
    const isoTime = `${requestedDate}T${requestedTime}:00`;
    validateMutation.mutate({ user_id: userId, requested_time: isoTime }, {
      onSuccess: (data) => {
        setResults([{ result: data, userId, time: isoTime }, ...results]);
      },
    });
  };

  const handleValidateNow = () => {
    const now = new Date();
    setRequestedDate(now.toISOString().split('T')[0]);
    setRequestedTime(now.toTimeString().substring(0, 5));
    if (!userId) return;
    const isoTime = now.toISOString();
    validateMutation.mutate({ user_id: userId, requested_time: isoTime }, {
      onSuccess: (data) => {
        setResults([{ result: data, userId, time: isoTime }, ...results]);
      },
    });
  };

  const presetTimes = [
    { label: '06:00', time: '06:00' },
    { label: '08:00', time: '08:00' },
    { label: '12:00', time: '12:00' },
    { label: '14:00', time: '14:00' },
    { label: '17:00', time: '17:00' },
    { label: '22:00', time: '22:00' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Access Time Validation">
        <Button size="sm" variant="outline" onClick={() => navigate('/secure/access-control/access-time')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4" /> Validation Test</h3>

          <div>
            <label className="text-xs font-medium text-muted-foreground">User *</label>
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-8 text-[12px]">
              <SelectOption value="">Select user...</SelectOption>
              {persons.map(p => (
                <SelectOption key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.employee_id || p.email})</SelectOption>
              ))}
            </Select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Time</label>
              <Input type="time" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} className="h-8 text-[12px]" />
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {presetTimes.map(pt => (
              <Button key={pt.label} variant="outline" size="sm" className="text-[11px] h-6 px-2" onClick={() => setRequestedTime(pt.time)}>
                {pt.label}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleValidate} disabled={!userId || validateMutation.isPending}>
              {validateMutation.isPending ? 'Checking...' : 'Validate'}
            </Button>
            <Button variant="outline" onClick={handleValidateNow} disabled={!userId}>
              <Play className="w-4 h-4 mr-1" /> Now
            </Button>
          </div>
        </Card>

        {/* Recent results quick view */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Recent Tests ({results.length})</h3>
          {results.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Run a test to see results</div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {results.slice(0, 10).map((r, i) => (
                <div key={i} className={cn("flex items-center justify-between p-2 rounded border", r.result.is_allowed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")}>
                  <div className="flex items-center gap-2">
                    {r.result.is_allowed ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                    <span className="text-xs">{new Date(r.time).toLocaleString('vi-VN')}</span>
                  </div>
                  <Badge variant={r.result.is_allowed ? 'default' : 'destructive'}>
                    {r.result.is_allowed ? 'Allowed' : 'Denied'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Full results */}
      {results.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Detailed Results</h3>
          <div className="space-y-3">
            {results.map((r, i) => (
              <div key={i} className={cn("border rounded-lg p-3", r.result.is_allowed ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50")}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {r.result.is_allowed ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                    <Badge variant={r.result.is_allowed ? 'default' : 'destructive'}>
                      {r.result.is_allowed ? 'ALLOWED' : 'DENIED'}
                    </Badge>
                    {r.result.template && <Badge variant="outline">{r.result.template.name}</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(r.time).toLocaleString('vi-VN')}</span>
                </div>
                <p className="text-sm">{r.result.reason}</p>
                {r.result.matched_slot && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Slot: {r.result.matched_slot.slot_name || 'Unnamed'} ({r.result.matched_slot.start_time} – {r.result.matched_slot.end_time})
                  </p>
                )}
                {r.result.next_allowed && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-amber-700">
                    <AlertTriangle className="w-3 h-3" />
                    Next: {new Date(r.result.next_allowed).toLocaleString('vi-VN')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}