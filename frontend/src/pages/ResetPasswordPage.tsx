import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import toast from 'react-hot-toast';

interface Branding {
  systemName: string;
  logo: string | null;
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Branding state
  const [branding, setBranding] = useState<Branding>({ systemName: 'Hosting Panel', logo: null });

  useEffect(() => {
    fetch('/api/public/branding')
      .then(res => res.json())
      .then(data => setBranding(data))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Lozinke se ne poklapaju');
      return;
    }

    if (password.length < 6) {
      toast.error('Lozinka mora imati najmanje 6 karaktera');
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/api/auth/reset-password', { token, password });
      setSuccess(true);
      toast.success('Lozinka je uspešno promenjena');
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      toast.error('Link za reset je istekao ili nije validan');
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
              Neispravan link
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Link za reset lozinke nije validan ili je istekao.
            </p>
            <Link
              to="/forgot-password"
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              Zatraži novi link
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
          <p className="text-gray-600 dark:text-gray-400 mt-2">Nova lozinka</p>
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
                Lozinka je promenjena
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Bićete preusmereni na stranicu za prijavu...
              </p>
              <Link
                to="/login"
                className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Prijavi se odmah
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Nova lozinka</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                  minLength={6}
                  placeholder="Minimum 6 karaktera"
                />
              </div>

              <div>
                <label className="label">Potvrdi lozinku</label>
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
                {isLoading ? 'Promena...' : 'Promeni lozinku'}
              </button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Nazad na prijavu
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
