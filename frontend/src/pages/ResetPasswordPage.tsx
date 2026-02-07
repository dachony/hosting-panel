import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import toast from 'react-hot-toast';

interface Branding {
  systemName: string;
  logo: string | null;
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Branding & password policy state
  const [branding, setBranding] = useState<Branding>({ systemName: 'Hosting Panel', logo: null });
  const [minLength, setMinLength] = useState(6);

  useEffect(() => {
    fetch('/api/public/branding')
      .then(res => res.json())
      .then(data => setBranding(data))
      .catch((e) => console.warn('Failed to load branding', e));
    fetch('/api/public/password-policy')
      .then(res => res.json())
      .then(data => setMinLength(data.minLength || 6))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error(t('auth.passwordsDoNotMatch'));
      return;
    }

    if (password.length < minLength) {
      toast.error(t('auth.passwordMinLength', { count: minLength }));
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/api/auth/reset-password', { token, password });
      setSuccess(true);
      toast.success(t('auth.passwordSuccessfullyChanged'));
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      toast.error(t('auth.resetLinkExpired'));
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            {branding.logo && (
              <img
                src={branding.logo}
                alt={branding.systemName}
                className="h-16 mx-auto mb-4 object-contain"
              />
            )}
            <h1 className="text-3xl font-bold text-primary-600">{branding.systemName}</h1>
          </div>
          <div className="card text-center">
            <div className="text-red-600 dark:text-red-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              {t('auth.invalidLink')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t('auth.resetLinkInvalid')}
            </p>
            <Link
              to="/forgot-password"
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              {t('auth.requestNewLink')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          {branding.logo && (
            <img
              src={branding.logo}
              alt={branding.systemName}
              className="h-16 mx-auto mb-4 object-contain"
            />
          )}
          <h1 className="text-3xl font-bold text-primary-600">{branding.systemName}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t('auth.newPassword')}</p>
        </div>

        <div className="card">
          {success ? (
            <div className="text-center py-4">
              <div className="text-green-600 dark:text-green-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t('auth.passwordChanged')}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t('auth.redirectToLogin')}
              </p>
              <Link
                to="/login"
                className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                {t('auth.loginNow')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">{t('auth.newPassword')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                  minLength={minLength}
                  placeholder={t('auth.minCharacters', { count: minLength })}
                />
              </div>

              <div>
                <label className="label">{t('auth.confirmPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={isLoading}
              >
                {isLoading ? t('auth.changing') : t('auth.changePassword')}
              </button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {t('auth.backToLogin')}
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
