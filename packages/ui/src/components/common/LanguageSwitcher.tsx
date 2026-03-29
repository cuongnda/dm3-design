import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'vi', label: 'VI' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.split('-')[0] ?? 'en';

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <span className="flex items-center gap-1">
      {LANGUAGES.map((lang, idx) => (
        <span key={lang.code} className="flex items-center gap-1">
          {idx > 0 && <span className="text-[#334155]">|</span>}
          <button
            onClick={() => handleChange(lang.code)}
            className={
              current === lang.code
                ? 'text-[#F8FAFC] font-medium'
                : 'text-[#64748B] hover:text-[#94A3B8] transition-colors'
            }
          >
            {lang.label}
          </button>
        </span>
      ))}
    </span>
  );
}
