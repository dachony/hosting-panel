import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import srTranslation from './locales/sr.json';
import enTranslation from './locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      sr: { translation: srTranslation },
      en: { translation: enTranslation },
    },
    fallbackLng: 'sr',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
