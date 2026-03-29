import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enDashboard from './locales/en/dashboard.json';
import enSecure from './locales/en/secure.json';
import enManage from './locales/en/manage.json';
import enOperate from './locales/en/operate.json';
import enSmart from './locales/en/smart.json';
import enDevices from './locales/en/devices.json';
import enSettings from './locales/en/settings.json';
import enSystem from './locales/en/system.json';

import viCommon from './locales/vi/common.json';
import viAuth from './locales/vi/auth.json';
import viDashboard from './locales/vi/dashboard.json';
import viSecure from './locales/vi/secure.json';
import viManage from './locales/vi/manage.json';
import viOperate from './locales/vi/operate.json';
import viSmart from './locales/vi/smart.json';
import viDevices from './locales/vi/devices.json';
import viSettings from './locales/vi/settings.json';
import viSystem from './locales/vi/system.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        auth: enAuth,
        dashboard: enDashboard,
        secure: enSecure,
        manage: enManage,
        operate: enOperate,
        smart: enSmart,
        devices: enDevices,
        settings: enSettings,
        system: enSystem,
      },
      vi: {
        common: viCommon,
        auth: viAuth,
        dashboard: viDashboard,
        secure: viSecure,
        manage: viManage,
        operate: viOperate,
        smart: viSmart,
        devices: viDevices,
        settings: viSettings,
        system: viSystem,
      },
    },
    defaultNS: 'common',
    ns: ['common', 'auth', 'dashboard', 'secure', 'manage', 'operate', 'smart', 'devices', 'settings', 'system'],
    fallbackLng: 'en',
    supportedLngs: ['en', 'vi'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'dm3-lang',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
