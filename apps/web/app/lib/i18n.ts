'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      appName: 'Fieldguide',
      saved: 'Saved',
      community: 'Community',
      settings: 'Settings',
      profile: 'Profile',
      admin: 'Admin',
      help: 'Help',
      logout: 'Logout',
      refresh: 'Refresh',
      top: 'Top',
      askAi: 'Ask AI',
      save: 'Save',
      share: 'Share',
      comment: 'Comment',
      viewMore: 'View More',
      viewLess: 'View Less'
    }
  },
  bg: {
    translation: {
      appName: 'Fieldguide',
      saved: 'Запазени',
      community: 'Общност',
      settings: 'Настройки',
      profile: 'Профил',
      admin: 'Админ',
      help: 'Помощ',
      logout: 'Изход',
      refresh: 'Опресни',
      top: 'Горе',
      askAi: 'Попитай ИИ',
      save: 'Запази',
      share: 'Сподели',
      comment: 'Коментар',
      viewMore: 'Още',
      viewLess: 'По-малко'
    }
  }
};

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });
}

export default i18n;
