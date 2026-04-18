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
import enDepartments from './locales/en/departments.json';
import enUsers from './locales/en/users.json';
import enZones from './locales/en/zones.json';
import enAccessPoints from './locales/en/accessPoints.json';
import enAccessGroups from './locales/en/accessGroups.json';
import enAccessTimes from './locales/en/accessTimes.json';
import enVehicles from './locales/en/vehicles.json';
import enMonitoring from './locales/en/monitoring.json';

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
import viDepartments from './locales/vi/departments.json';
import viUsers from './locales/vi/users.json';
import viZones from './locales/vi/zones.json';
import viAccessPoints from './locales/vi/accessPoints.json';
import viAccessGroups from './locales/vi/accessGroups.json';
import viAccessTimes from './locales/vi/accessTimes.json';
import viVehicles from './locales/vi/vehicles.json';
import viMonitoring from './locales/vi/monitoring.json';

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
        departments: enDepartments,
        users: enUsers,
        zones: enZones,
        accessPoints: enAccessPoints,
        accessGroups: enAccessGroups,
        accessTimes: enAccessTimes,
        vehicles: enVehicles,
        monitoring: enMonitoring,
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
        departments: viDepartments,
        users: viUsers,
        zones: viZones,
        accessPoints: viAccessPoints,
        accessGroups: viAccessGroups,
        accessTimes: viAccessTimes,
        vehicles: viVehicles,
        monitoring: viMonitoring,
      },
    },
    defaultNS: 'common',
    ns: ['common', 'auth', 'dashboard', 'secure', 'manage', 'operate', 'smart', 'devices', 'settings', 'system', 'departments', 'users', 'zones', 'accessPoints', 'accessGroups', 'accessTimes', 'vehicles', 'monitoring'],
    fallbackLng: 'en',
    supportedLngs: ['en', 'vi'],
    // Accept region tags like `vi-VN`/`en-US` and map them to base languages `vi`/`en`.
    nonExplicitSupportedLngs: true,
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
