import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useZoom } from '../../context/ZoomContext';
import { api } from '../../api/client';
import { Menu, Sun, Moon, Monitor, LogOut, Globe, Plus, Minus } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { zoom, zoomIn, zoomOut, resetZoom } = useZoom();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  const { data: systemData } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api.get<{ settings: { systemName: string } }>('/api/settings/system'),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const systemName = systemData?.settings?.systemName ?? 'Hosting Dashboard';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeRef.current && !themeRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themeOptions = [
    { value: 'light' as const, label: t('settings.light'), icon: Sun },
    { value: 'dark' as const, label: t('settings.dark'), icon: Moon },
    { value: 'system' as const, label: t('settings.system'), icon: Monitor },
  ];

  const languages = [
    { code: 'sr', label: 'Srpski' },
    { code: 'en', label: 'English' },
  ];

  const CurrentThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-2 text-lg font-semibold text-primary-600 dark:text-primary-400">
          {systemName}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center space-x-2">
        {/* Zoom controls */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg">
          <button
            onClick={zoomOut}
            disabled={zoom <= 50}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Zoom out (−5%)"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={resetZoom}
            className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 min-w-[3rem]"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= 120}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Zoom in (+5%)"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Language selector */}
        <div ref={langRef} className="relative">
          <button
            onClick={() => setLangMenuOpen(!langMenuOpen)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Globe className="w-5 h-5" />
          </button>

          {langMenuOpen && (
            <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    i18n.changeLanguage(lang.code);
                    setLangMenuOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    i18n.language === lang.code ? 'text-primary-600 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme selector */}
        <div ref={themeRef} className="relative">
          <button
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <CurrentThemeIcon className="w-5 h-5" />
          </button>

          {themeMenuOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setTheme(option.value);
                    setThemeMenuOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    theme === option.value ? 'text-primary-600 font-medium' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <option.icon className="w-4 h-4 mr-2" />
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User info and logout */}
        <div className="flex items-center pl-2 border-l border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-700 dark:text-gray-300 mr-2">
            {user?.name}
          </span>
          <button
            onClick={logout}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            title={t('auth.logout')}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
