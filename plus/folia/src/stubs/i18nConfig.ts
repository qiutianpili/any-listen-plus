// folia-al: replaces Folia's i18n bootstrap. zh-CN only; the 330 KB dictionary is loaded as a lazy
// chunk right after mount so the first frame does not wait for it (mode labels have fallbacks).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',
    resources: { 'zh-CN': { translation: {} } },
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false, bindI18nStore: 'added' },
  });
}

let loading: Promise<void> | null = null;
export const loadFoliaLocale = () => {
  if (!loading) {
    loading = import('../../folia-src/i18n/locales/zh-CN.ts').then((m) => {
      i18n.addResourceBundle('zh-CN', 'translation', (m as { default: Record<string, unknown> }).default, true, true);
    }).catch((e) => { console.warn('[folia] locale load failed', e); });
  }
  return loading;
};

export type AppLanguagePreference = 'system' | 'en' | 'zh-CN' | 'in';
export const APP_LANGUAGE_STORAGE_KEY = 'folia_app_language';
export const readStoredAppLanguagePreference = (): AppLanguagePreference => 'zh-CN';
export const resolveAppLanguage = () => 'zh-CN';
export const applyAppLanguagePreference = () => {};
export default i18n;
