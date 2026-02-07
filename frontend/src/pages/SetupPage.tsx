import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

interface Branding {
  systemName: string;
  logo: string | null;
}

export default function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { completeSetup } = useAuth();

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

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, phone, password }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Setup failed');
      }

      const data = await res.json();
      completeSetup(data.token, data.user);
      navigate('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.errorSaving'));
    } finally {
      setIsLoading(false);
    }
  };

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
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {t('setup.subtitle')}
          </p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t('setup.title')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{t('setup.firstName')}</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">{t('setup.lastName')}</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">{t('setup.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">{t('setup.phone')}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">{t('setup.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                minLength={minLength}
                required
                placeholder={t('auth.minCharacters', { count: minLength })}
              />
            </div>

            <div>
              <label className="label">{t('setup.confirmPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                minLength={minLength}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('setup.createAccount')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
