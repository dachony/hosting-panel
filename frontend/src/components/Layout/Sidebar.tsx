import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { CompanyInfo } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useZoom } from '../../context/ZoomContext';
import {
  LayoutDashboard,
  Users,
  Globe,
  Settings,
  X,
  Building2,
  ScrollText,
  Mail,
  Activity,
  Sun,
  Moon,
  LogOut,
  Minus,
  Plus,
} from 'lucide-react';

const SIDEBAR_WIDTH = 256;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const { user, isSalesAdmin, isAdmin, logout } = useAuth();
  const { isDark, setTheme } = useTheme();
  const { zoom, zoomIn, zoomOut, resetZoom } = useZoom();

  const { data: companyData } = useQuery({
    queryKey: ['company-info'],
    queryFn: () => api.get<{ company: CompanyInfo | null }>('/api/company/info'),
  });

  const { data: systemData } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api.get<{ settings: { systemName: string } }>('/api/settings/system'),
    staleTime: 1000 * 60 * 5,
  });

  const company = companyData?.company;
  const systemName = systemData?.settings?.systemName ?? 'Hosting Panel';
  const isSr = i18n.language === 'sr';

  const navigation = [
    { name: t('nav.dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('nav.clients'), href: '/clients', icon: Users },
    { name: t('nav.domains'), href: '/domains', icon: Globe },
    ...(isSalesAdmin ? [{ name: t('nav.settings'), href: '/settings', icon: Settings }] : []),
    ...(isAdmin ? [
      { name: t('nav.auditLog'), href: '/audit', icon: ScrollText },
      { name: t('nav.emailLog'), href: '/emails', icon: Mail },
      { name: t('nav.systemStatus'), href: '/system', icon: Activity },
    ] : []),
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="relative flex items-center justify-center px-3 py-2 border-b border-gray-200 dark:border-gray-700 overflow-visible">
        <div className="flex flex-col items-center overflow-visible">
          {company?.logo ? (
            <img
              src={company.logo}
              alt={company.name || 'Logo'}
              className="w-32 h-32 object-contain -my-2"
            />
          ) : (
            <div className="w-20 h-20 rounded-lg bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
              <Building2 className="w-10 h-10 text-primary-600 dark:text-primary-400" />
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="lg:hidden absolute top-2 right-2 p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* System name */}
      <div className="text-sm font-semibold text-center text-gray-800 dark:text-gray-200 px-3 py-3">
        {systemName}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`
            }
          >
            <item.icon className="w-5 h-5 mr-3" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="mt-auto border-t border-gray-200 dark:border-gray-700 px-3 py-3 space-y-3">
        {/* Language toggle */}
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${!isSr ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'}`}>EN</span>
          <button
            onClick={() => i18n.changeLanguage(isSr ? 'en' : 'sr')}
            className="relative w-9 h-5 rounded-full bg-gray-300 dark:bg-gray-600 transition-colors cursor-pointer"
            aria-label="Toggle language"
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                isSr ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className={`text-xs font-medium ${isSr ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'}`}>RS</span>
        </div>

        {/* Theme toggle */}
        <div className="flex items-center justify-between">
          <Sun className={`w-4 h-4 ${!isDark ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`} />
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="relative w-9 h-5 rounded-full bg-gray-300 dark:bg-gray-600 transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                isDark ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <Moon className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
        </div>

        {/* Zoom controls */}
        <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
          <button
            onClick={zoomOut}
            disabled={zoom <= 50}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={resetZoom}
            className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 min-w-[3rem] text-center"
            title="Reset zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= 120}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* User info + logout */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center min-w-0">
            <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-primary-700 dark:text-primary-300">
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 truncate">
              {user?.name}
            </span>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
            title={t('auth.logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile sidebar backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 transform transition-transform lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <div
        className="hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col"
        style={{ width: `${SIDEBAR_WIDTH}px` }}
      >
        <div className="flex flex-col flex-1 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          {sidebarContent}
        </div>
      </div>
    </>
  );
}
