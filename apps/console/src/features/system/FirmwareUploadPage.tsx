import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, CheckCircle } from 'lucide-react';
import { uploadFirmware, fetchFirmwareDeviceTypes } from '@/lib/api';
import { Button, Input, Select, SelectOption, Label } from '@dm3/ui';

export function FirmwareUploadPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ id: string; checksum: string; size: number } | null>(null);
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    file: null as File | null,
    version: '',
    device_type: '',
    description: '',
  });

  useEffect(() => {
    fetchFirmwareDeviceTypes()
      .then((r) => setDeviceTypes(r.device_types))
      .catch(() => {});
  }, []);

  const setFile = useCallback((file: File | null) => {
    if (file && file.size > 100 * 1024 * 1024) {
      setError(t('firmware.fileTooLarge'));
      return;
    }
    setError('');
    setForm((f) => ({ ...f, file }));
  }, [t]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) setFile(file);
    },
    [setFile],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.file || !form.version || !form.device_type) {
      setError(t('firmware.fillRequired'));
      return;
    }

    setLoading(true);
    setError('');
    setProgress(0);

    try {
      const res = await uploadFirmware(form.file, form.version, form.device_type, form.description, setProgress);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="rounded-lg border border-success/30 bg-success/5 p-6 text-center">
          <CheckCircle size={48} className="mx-auto text-success mb-3" />
          <h2 className="text-[18px] font-semibold text-foreground mb-2">{t('firmware.uploadSuccess')}</h2>
          <div className="text-[13px] text-muted-foreground space-y-1">
            <p>
              <span className="font-medium">SHA-256:</span>{' '}
              <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{result.checksum}</code>
            </p>
            <p>
              <span className="font-medium">{t('firmware.table.size')}:</span>{' '}
              {(result.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
          <Button onClick={() => navigate('/system/firmware')} className="mt-4 bg-operate hover:bg-operate/90 text-white">
            {t('firmware.backToList')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/system/firmware')}
        className="mb-4 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={15} /> {t('firmware.backToList')}
      </Button>

      <h1 className="text-[20px] font-semibold text-foreground mb-6">{t('firmware.uploadTitle')}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* File drop zone */}
        <div>
          <Label>{t('firmware.form.file')}</Label>
          <div
            data-testid="upload-input-file"
            className={`mt-1 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-operate bg-operate/5' : 'border-border hover:border-muted-foreground'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={32} className="mx-auto text-muted-foreground/40 mb-2" />
            {form.file ? (
              <div>
                <p className="text-[13px] font-medium text-foreground">{form.file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(form.file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t('firmware.dropHere')}</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        {/* Version */}
        <div>
          <Label>{t('firmware.form.version')}</Label>
          <Input
            data-testid="upload-input-version"
            value={form.version}
            onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
            placeholder="e.g. 1.2.3"
            className="mt-1"
          />
        </div>

        {/* Device Type */}
        <div>
          <Label>{t('firmware.form.deviceType')}</Label>
          <Select
            data-testid="upload-select-device-type"
            value={form.device_type}
            onChange={(e) => setForm((f) => ({ ...f, device_type: e.target.value }))}
            className="mt-1"
          >
            <SelectOption value="">{t('firmware.selectDeviceType')}</SelectOption>
            {deviceTypes.map((dt) => (
              <SelectOption key={dt} value={dt}>
                {dt}
              </SelectOption>
            ))}
          </Select>
        </div>

        {/* Description */}
        <div>
          <Label>{t('firmware.form.description')}</Label>
          <textarea
            data-testid="upload-textarea-description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t('firmware.descriptionPlaceholder')}
            className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {/* Progress */}
        {loading && (
          <div className="space-y-1">
            <div className="flex justify-between text-[12px] text-muted-foreground">
              <span>{t('firmware.uploading')}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-operate transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-[13px] text-error bg-error/10 px-3 py-2 rounded">{error}</div>
        )}

        {/* Submit */}
        <Button
          data-testid="upload-button-submit"
          type="submit"
          disabled={loading || !form.file || !form.version || !form.device_type}
          className="w-full bg-operate hover:bg-operate/90 text-white"
        >
          {loading ? t('firmware.uploading') : t('firmware.upload')}
        </Button>
      </form>
    </div>
  );
}
