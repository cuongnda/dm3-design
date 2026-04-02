import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { me as fetchMe, updatePreferredLanguage } from '@dm3/api-client';

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'vi', label: 'VI' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.split('-')[0] ?? 'en';
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = async (code: string) => {
    const next = (code === 'vi' ? 'vi' : 'en') as 'en' | 'vi';
    const prev = (current === 'vi' ? 'vi' : 'en') as 'en' | 'vi';

    if (isSaving || prev === next) return;

    // Optimistic UI update
    i18n.changeLanguage(next);
    localStorage.setItem('dm3-lang', next);

    const token = localStorage.getItem('dm3-token');
    if (!token) return; // Not logged in (e.g. login page)

    try {
      setIsSaving(true);
      await updatePreferredLanguage(next);

      // Sync language from backend response
      const updated = await fetchMe();
      const serverLang = (updated.preferred_language ?? '').split('-')[0]?.toLowerCase();
      const normalized = serverLang === 'vi' ? 'vi' : 'en';
      i18n.changeLanguage(normalized);
      localStorage.setItem('dm3-lang', normalized);
    } catch {
      // Revert UI if backend update fails
      i18n.changeLanguage(prev);
      localStorage.setItem('dm3-lang', prev);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <span className="flex items-center gap-1">
      {LANGUAGES.map((lang, idx) => (
        <span key={lang.code} className="flex items-center gap-1">
          {idx > 0 && <span className="text-[#334155]">|</span>}
          <button
            onClick={() => handleChange(lang.code)}
            disabled={isSaving}
            className={
              current === lang.code
                ? 'text-[#F8FAFC] font-medium disabled:opacity-60'
                : 'text-[#64748B] hover:text-[#94A3B8] transition-colors disabled:opacity-60'
            }
          >
            {lang.label}
          </button>
        </span>
      ))}
    </span>
  );
}
