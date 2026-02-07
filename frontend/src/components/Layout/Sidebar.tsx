import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { CompanyInfo } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useZoom } from '../../context/ZoomContext';
import { useAppearance, AccentColor } from '../../context/AppearanceContext';
import Modal from '../common/Modal';
import toast from 'react-hot-toast';
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
  Settings as SettingsIcon,
  Eye,
  EyeOff,
  Shield,
  Mail as MailIcon,
  Copy,
  Loader2,
} from 'lucide-react';

const SIDEBAR_WIDTH = 256;

const ACCENT_COLORS: { id: AccentColor; labelKey: string; swatch: string }[] = [
  { id: 'blue', labelKey: 'appearance.blue', swatch: '#4c6288' },
  { id: 'indigo', labelKey: 'appearance.indigo', swatch: '#585485' },
  { id: 'violet', labelKey: 'appearance.violet', swatch: '#6a5885' },
  { id: 'emerald', labelKey: 'appearance.emerald', swatch: '#407362' },
  { id: 'amber', labelKey: 'appearance.amber', swatch: '#896a3a' },
  { id: 'rose', labelKey: 'appearance.rose', swatch: '#854c57' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const { user, isSalesAdmin, isAdmin, logout } = useAuth();
  const { isDark, setTheme } = useTheme();
  const { zoom, zoomIn, zoomOut, resetZoom } = useZoom();
  const { accent, setAccent, density, setDensity } = useAppearance();
  const queryClient = useQueryClient();

  // Account modal state
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<'profile' | 'password' | '2fa' | 'appearance'>('profile');

  // Profile form state
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [profileEmail, setProfileEmail] = useState('');

  // Password form state
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // 2FA state
  const [setup2FAModalOpen, setSetup2FAModalOpen] = useState(false);
  const [disable2FAModalOpen, setDisable2FAModalOpen] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [setup2FAMethod, setSetup2FAMethod] = useState<'email' | 'totp'>('email');
  const [setup2FAStep, setSetup2FAStep] = useState<'choose' | 'verify'>('choose');
  const [backupCodesToShow, setBackupCodesToShow] = useState<string[]>([]);

  const { data: companyData } = useQuery({
    queryKey: ['company-info'],
    queryFn: () => api.get<{ company: CompanyInfo | null }>('/api/company/info'),
  });

  const { data: systemData } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => api.get<{ settings: { systemName: string } }>('/api/settings/system'),
    staleTime: 1000 * 60 * 5,
  });

  // 2FA status query
  const { data: my2FAStatus, isLoading: my2FALoading, refetch: refetchMy2FA } = useQuery({
    queryKey: ['my-2fa-status'],
    queryFn: () => api.get<{ enabled: boolean; method: 'email' | 'totp' | null }>('/api/security/2fa/status'),
    enabled: accountModalOpen && accountTab === '2fa',
  });

  // Profile mutation
  const saveProfileMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; phone: string }) =>
      api.put('/api/auth/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
      toast.success(t('account.profileSaved'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Password mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post('/api/auth/change-password', data),
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success(t('account.passwordChanged'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // 2FA mutations
  const setupEmail2FAMutation = useMutation({
    mutationFn: () => api.post('/api/security/2fa/setup/email'),
    onSuccess: () => {
      setSetup2FAStep('verify');
      toast.success(t('settings.verificationCodeSent'));
    },
    onError: () => toast.error(t('settings.failedSendVerificationCode')),
  });

  const verifyEmail2FAMutation = useMutation({
    mutationFn: (code: string) => api.post<{ message: string; method: string }>('/api/security/2fa/verify/email', { code }),
    onSuccess: () => {
      refetchMy2FA();
      setSetup2FAModalOpen(false);
      resetSetup2FAState();
      toast.success(t('settings.email2faEnabled'));
    },
    onError: () => toast.error(t('settings.invalidVerificationCode')),
  });

  const setupTOTP2FAMutation = useMutation({
    mutationFn: () => api.post<{ secret: string; qrCode: string }>('/api/security/2fa/setup/totp'),
    onSuccess: (data) => {
      setTotpSetupData(data);
      setSetup2FAStep('verify');
    },
    onError: () => toast.error(t('settings.failedSetupTotp')),
  });

  const verifyTOTP2FAMutation = useMutation({
    mutationFn: (code: string) => api.post<{ message: string; method: string; backupCodes: string[] }>('/api/security/2fa/verify/totp', { code }),
    onSuccess: (data) => {
      refetchMy2FA();
      if (data.backupCodes) {
        setBackupCodesToShow(data.backupCodes);
      } else {
        setSetup2FAModalOpen(false);
        resetSetup2FAState();
      }
      toast.success(t('settings.authenticator2faEnabled'));
    },
    onError: () => toast.error(t('settings.invalidVerificationCode')),
  });

  const disable2FAMutation = useMutation({
    mutationFn: (password: string) => api.post('/api/security/2fa/disable', { password }),
    onSuccess: () => {
      refetchMy2FA();
      setDisable2FAModalOpen(false);
      setDisablePassword('');
      toast.success(t('settings.twoFaDisabledSuccess'));
    },
    onError: () => toast.error(t('settings.invalidPassword')),
  });

  const regenerateBackupCodesMutation = useMutation({
    mutationFn: () => api.post<{ backupCodes: string[] }>('/api/security/2fa/backup-codes/regenerate'),
    onSuccess: (data) => {
      setBackupCodesToShow(data.backupCodes);
      toast.success(t('settings.backupCodesGenerated'));
    },
    onError: () => toast.error(t('settings.failedRegenerateBackupCodes')),
  });

  const resetSetup2FAState = () => {
    setSetup2FAStep('choose');
    setSetup2FAMethod('email');
    setTotpSetupData(null);
    setVerificationCode('');
    setBackupCodesToShow([]);
  };

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

  const openAccountModal = () => {
    // Pre-fill profile form from current user
    const nameParts = user?.name?.split(' ') || ['', ''];
    setProfileForm({
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      phone: user?.phone || '',
    });
    setProfileEmail(user?.email || '');
    setAccountTab('profile');
    setAccountModalOpen(true);

    // Fetch fresh user data for profile
    api.get<{ user: { firstName?: string; lastName?: string; phone?: string; email?: string } }>('/api/auth/me').then((data) => {
      if (data.user) {
        setProfileForm({
          firstName: data.user.firstName || '',
          lastName: data.user.lastName || '',
          phone: data.user.phone || '',
        });
        setProfileEmail(data.user.email || '');
      }
    });
  };

  const handleSaveProfile = () => {
    saveProfileMutation.mutate(profileForm);
  };

  const handleChangePassword = () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t('account.passwordMismatch'));
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  const accountTabs = [
    { id: 'profile' as const, label: t('account.profile') },
    { id: 'password' as const, label: t('account.changePassword') },
    { id: '2fa' as const, label: '2FA' },
    { id: 'appearance' as const, label: t('account.appearance') },
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

      {/* Bottom controls - two columns */}
      <div className="mt-auto border-t border-gray-200 dark:border-gray-700 px-3 py-3">
        <div className="flex gap-3">
          {/* Left column: Language + Theme toggles */}
          <div className="w-1/2 space-y-2">
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
          </div>

          {/* Right column: Gear + Zoom */}
          <div className="w-1/2 flex flex-col items-center gap-2">
            {/* Gear icon */}
            <button
              onClick={openAccountModal}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title={t('account.title')}
            >
              <SettingsIcon className="w-5 h-5" />
            </button>

            {/* Zoom controls */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg">
              <button
                onClick={zoomOut}
                disabled={zoom <= 50}
                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Zoom out"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={resetZoom}
                className="px-1 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 min-w-[2.5rem] text-center"
                title="Reset zoom"
              >
                {zoom}%
              </button>
              <button
                onClick={zoomIn}
                disabled={zoom >= 120}
                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Zoom in"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
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

      {/* Account Modal */}
      <Modal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        title={t('account.title')}
        size="lg"
      >
        {/* Tab navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 -mt-1">
          {accountTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAccountTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                accountTab === tab.id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Profile tab */}
        {accountTab === 'profile' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('account.firstName')}</label>
                <input
                  type="text"
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">{t('account.lastName')}</label>
                <input
                  type="text"
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">{t('account.email')}</label>
              <div className="input bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed">
                {profileEmail}
              </div>
            </div>
            <div>
              <label className="label">{t('account.phone')}</label>
              <input
                type="text"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                className="input"
              />
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saveProfileMutation.isPending || !profileForm.firstName || !profileForm.lastName}
              className="btn btn-primary"
            >
              {saveProfileMutation.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        )}

        {/* Password tab */}
        {accountTab === 'password' && (
          <div className="space-y-4">
            <div>
              <label className="label">{t('account.currentPassword')}</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">{t('account.newPassword')}</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">{t('account.confirmPassword')}</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="input"
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={changePasswordMutation.isPending || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
              className="btn btn-primary"
            >
              {changePasswordMutation.isPending ? t('common.saving') : t('account.changePassword')}
            </button>
          </div>
        )}

        {/* 2FA tab */}
        {accountTab === '2fa' && (
          <div className="space-y-4">
            {my2FALoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      Status: {my2FAStatus?.enabled ? (
                        <span className="text-green-600 dark:text-green-400">{t('settings.twoFaEnabled')}</span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">{t('settings.twoFaDisabled')}</span>
                      )}
                    </div>
                    {my2FAStatus?.enabled && my2FAStatus.method && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {my2FAStatus.method === 'email' ? t('settings.twoFaEmailCode') : t('settings.twoFaAuthenticatorApp')}
                      </div>
                    )}
                  </div>

                  {my2FAStatus?.enabled ? (
                    <div className="flex gap-2">
                      {my2FAStatus.method === 'totp' && (
                        <button
                          onClick={() => regenerateBackupCodesMutation.mutate()}
                          disabled={regenerateBackupCodesMutation.isPending}
                          className="btn btn-secondary btn-sm"
                        >
                          {regenerateBackupCodesMutation.isPending ? t('settings.generating') : t('settings.regenerateBackupCodes')}
                        </button>
                      )}
                      <button
                        onClick={() => setDisable2FAModalOpen(true)}
                        className="btn btn-sm bg-red-600 hover:bg-red-700 text-white"
                      >
                        {t('settings.disable2fa')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        resetSetup2FAState();
                        setSetup2FAModalOpen(true);
                      }}
                      className="btn btn-primary btn-sm"
                    >
                      {t('settings.enable2fa')}
                    </button>
                  )}
                </div>

                {!my2FAStatus?.enabled && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('settings.twoFaDescription')}
                  </p>
                )}

                {/* Backup Codes Display (after regeneration) */}
                {backupCodesToShow.length > 0 && !setup2FAModalOpen && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      {t('settings.yourBackupCodes')}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      {t('settings.saveBackupCodesNote')}
                    </p>
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm mb-3">
                      {backupCodesToShow.map((code, index) => (
                        <div key={index} className="text-center py-1 text-gray-700 dark:text-gray-300">
                          {code}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(backupCodesToShow.join('\n'));
                            toast.success(t('auth.backupCodesCopied'));
                          } catch {
                            toast.error(t('common.clipboardFailed'));
                          }
                        }}
                        className="btn btn-secondary btn-sm flex items-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        {t('settings.copyCodes')}
                      </button>
                      <button
                        onClick={() => setBackupCodesToShow([])}
                        className="btn btn-primary btn-sm"
                      >
                        {t('settings.done')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Appearance tab */}
        {accountTab === 'appearance' && (
          <div className="space-y-4">
            {/* Accent Color */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t('account.accentColor')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {ACCENT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => setAccent(color.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-all ${
                      accent === color.id
                        ? 'border-gray-900 dark:border-white shadow-md'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color.swatch }}
                    />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {t(color.labelKey)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Density */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t('account.density')}
              </h4>
              <div className="flex gap-2">
                {(['comfy', 'compact'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDensity(d)}
                    className={`btn btn-sm ${
                      density === d ? 'btn-primary' : 'btn-secondary'
                    }`}
                  >
                    {t(`appearance.${d}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Setup 2FA Modal */}
      <Modal
        isOpen={setup2FAModalOpen}
        onClose={() => {
          setSetup2FAModalOpen(false);
          resetSetup2FAState();
        }}
        title={t('settings.enable2faTitle')}
      >
        {setup2FAStep === 'choose' ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('settings.choose2faMethod')}
            </p>

            <button
              onClick={() => {
                setSetup2FAMethod('email');
                setupEmail2FAMutation.mutate();
              }}
              disabled={setupEmail2FAMutation.isPending}
              className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-4 text-left"
            >
              <MailIcon className="w-8 h-8 text-primary-600" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{t('settings.twoFaEmailCode')}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{t('settings.emailCodeDesc')}</div>
              </div>
            </button>

            <button
              onClick={() => {
                setSetup2FAMethod('totp');
                setupTOTP2FAMutation.mutate();
              }}
              disabled={setupTOTP2FAMutation.isPending}
              className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-4 text-left"
            >
              <Shield className="w-8 h-8 text-primary-600" />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{t('settings.twoFaAuthenticatorApp')}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{t('settings.authenticatorAppDesc')}</div>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {setup2FAMethod === 'totp' && totpSetupData && (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('settings.scanQrCode')}
                </p>
                <div className="flex justify-center">
                  <img src={totpSetupData.qrCode} alt="QR Code" />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  {t('settings.orEnterManually')} <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{totpSetupData.secret}</code>
                </p>
              </>
            )}

            {setup2FAMethod === 'email' && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('settings.enterVerificationCodeEmail')}
              </p>
            )}

            <div>
              <label className="label">{t('settings.verificationCode')}</label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="input text-center tracking-widest text-lg"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSetup2FAStep('choose')}
                className="btn btn-secondary flex-1"
              >
                {t('common.back')}
              </button>
              <button
                onClick={() => {
                  if (setup2FAMethod === 'email') {
                    verifyEmail2FAMutation.mutate(verificationCode);
                  } else {
                    verifyTOTP2FAMutation.mutate(verificationCode);
                  }
                }}
                disabled={verifyEmail2FAMutation.isPending || verifyTOTP2FAMutation.isPending || !verificationCode}
                className="btn btn-primary flex-1"
              >
                {verifyEmail2FAMutation.isPending || verifyTOTP2FAMutation.isPending ? t('settings.verifying') : t('settings.verifyAndEnable')}
              </button>
            </div>
          </div>
        )}

        {/* Show backup codes after TOTP setup */}
        {backupCodesToShow.length > 0 && setup2FAModalOpen && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{t('settings.save2faBackupCodes')}</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('settings.backupCodesAccessNote')}
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodesToShow.map((code, index) => (
                  <div key={index} className="text-center py-1 text-gray-700 dark:text-gray-300">
                    {code}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(backupCodesToShow.join('\n'));
                    toast.success(t('auth.backupCodesCopied'));
                  } catch {
                    toast.error(t('common.clipboardFailed'));
                  }
                }}
                className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                {t('settings.copy')}
              </button>
              <button
                onClick={() => {
                  setSetup2FAModalOpen(false);
                  resetSetup2FAState();
                }}
                className="btn btn-primary flex-1"
              >
                {t('settings.done')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Disable 2FA Modal */}
      <Modal
        isOpen={disable2FAModalOpen}
        onClose={() => {
          setDisable2FAModalOpen(false);
          setDisablePassword('');
        }}
        title={t('settings.disable2faTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('settings.disable2faWarning')}
          </p>

          <div>
            <label className="label">{t('settings.password')}</label>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="input"
              placeholder={t('settings.enterYourPassword')}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setDisable2FAModalOpen(false);
                setDisablePassword('');
              }}
              className="btn btn-secondary flex-1"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => disable2FAMutation.mutate(disablePassword)}
              disabled={disable2FAMutation.isPending || !disablePassword}
              className="btn flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {disable2FAMutation.isPending ? t('settings.disabling') : t('settings.disable2fa')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
