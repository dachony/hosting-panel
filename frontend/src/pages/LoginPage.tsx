import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Mail, Smartphone, KeyRound, ArrowLeft, Loader2, Copy, CheckCircle } from 'lucide-react';

interface Branding {
  systemName: string;
  logo: string | null;
}

type LoginStep = 'credentials' | 'verify2fa' | 'setup2fa' | 'verify-setup' | 'backup-codes';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, verify2FA, setup2FA, verify2FASetup, resend2FACode, sendEmailFallback } = useAuth();

  // Branding state
  const [branding, setBranding] = useState<Branding>({ systemName: 'Hosting Panel', logo: null });

  useEffect(() => {
    fetch('/api/public/branding')
      .then(res => res.json())
      .then(data => setBranding(data))
      .catch((e) => console.warn('Failed to load branding', e));
  }, []);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  // 2FA state
  const [step, setStep] = useState<LoginStep>('credentials');
  const [sessionToken, setSessionToken] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [twoFactorMethod, setTwoFactorMethod] = useState<'email' | 'totp'>('email');
  const [hasEmailFallback, setHasEmailFallback] = useState(false);
  const [activeVerifyMethod, setActiveVerifyMethod] = useState<'email' | 'totp'>('totp');
  const [availableMethods, setAvailableMethods] = useState<('email' | 'totp')[]>(['email', 'totp']);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrCode, setTotpQrCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        navigate('/');
      } else if (result.requires2FA) {
        setSessionToken(result.requires2FA.sessionToken);
        setTwoFactorMethod(result.requires2FA.method);
        setActiveVerifyMethod(result.requires2FA.method);
        setHasEmailFallback(result.requires2FA.hasEmailFallback);
        setStep('verify2fa');
        if (result.requires2FA.method === 'email') {
          toast.success(t('auth.verificationCodeSentToEmail'));
        }
      } else if (result.requires2FASetup) {
        setSetupToken(result.requires2FASetup.setupToken);
        setAvailableMethods(result.requires2FASetup.availableMethods);
        setStep('setup2fa');
      }
    } catch {
      toast.error(t('auth.invalidCredentials'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await verify2FA(sessionToken, verificationCode, useBackupCode, activeVerifyMethod);
      navigate('/');
    } catch {
      toast.error(t('auth.invalidVerificationCode'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmailFallback = async () => {
    setIsResending(true);
    try {
      await sendEmailFallback(sessionToken);
      setActiveVerifyMethod('email');
      setVerificationCode('');
      toast.success(t('auth.verificationCodeSentToEmail'));
    } catch {
      toast.error(t('auth.failedToResendCode'));
    } finally {
      setIsResending(false);
    }
  };

  const handleResendCode = async () => {
    setIsResending(true);
    try {
      await resend2FACode(sessionToken);
      toast.success(t('auth.newCodeSent'));
    } catch {
      toast.error(t('auth.failedToResendCode'));
    } finally {
      setIsResending(false);
    }
  };

  const handleSetup2FA = async (method: 'email' | 'totp') => {
    setIsLoading(true);
    setTwoFactorMethod(method);

    try {
      const result = await setup2FA(setupToken, method);

      if (method === 'totp' && result.secret && result.qrCode) {
        setTotpSecret(result.secret);
        setTotpQrCode(result.qrCode);
      } else if (method === 'email') {
        toast.success(t('auth.verificationCodeSentToEmail'));
      }

      setStep('verify-setup');
    } catch {
      toast.error(t('auth.failedToSetup2fa'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await verify2FASetup(setupToken, verificationCode, twoFactorMethod);

      if (result.backupCodes && result.backupCodes.length > 0) {
        setBackupCodes(result.backupCodes);
        setStep('backup-codes');
      } else {
        navigate('/');
      }
    } catch {
      toast.error(t('auth.invalidVerificationCode'));
    } finally {
      setIsLoading(false);
    }
  };

  const copyBackupCodes = async () => {
    try {
      const codesText = backupCodes.join('\n');
      await navigator.clipboard.writeText(codesText);
      setCopiedCodes(true);
      toast.success(t('auth.backupCodesCopied'));
      setTimeout(() => setCopiedCodes(false), 2000);
    } catch {
      toast.error(t('common.clipboardFailed'));
    }
  };

  const handleBackupCodesComplete = () => {
    navigate('/');
  };

  const resetToCredentials = () => {
    setStep('credentials');
    setSessionToken('');
    setSetupToken('');
    setVerificationCode('');
    setUseBackupCode(false);
    setTotpSecret('');
    setTotpQrCode('');
    setHasEmailFallback(false);
    setActiveVerifyMethod('totp');
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
            {step === 'credentials' && t('auth.login')}
            {step === 'verify2fa' && t('auth.twoFactorAuth')}
            {step === 'setup2fa' && t('auth.setup2fa')}
            {step === 'verify-setup' && t('auth.verify2faSetup')}
            {step === 'backup-codes' && t('auth.saveBackupCodes')}
          </p>
        </div>

        <div className="card">
          {/* Step 1: Credentials */}
          {step === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label className="label">{t('auth.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">{t('auth.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  {t('auth.forgotPassword')}
                </Link>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('auth.loginButton')}
              </button>
            </form>
          )}

          {/* Step 2a: Verify existing 2FA */}
          {step === 'verify2fa' && (
            <form onSubmit={handleVerify2FA} className="space-y-4">
              <div className="text-center mb-4">
                {activeVerifyMethod === 'email' ? (
                  <>
                    <Mail className="w-12 h-12 mx-auto text-primary-600 mb-2" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('auth.enterVerificationCodeEmail')}
                    </p>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-12 h-12 mx-auto text-primary-600 mb-2" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('auth.enterCodeFromApp')}
                    </p>
                  </>
                )}
              </div>

              <div>
                <label className="label">{useBackupCode ? t('auth.backupCode') : t('auth.verificationCode')}</label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="input text-center tracking-widest text-lg"
                  placeholder={useBackupCode ? 'XXXXXXXX' : '000000'}
                  maxLength={useBackupCode ? 8 : 6}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('auth.verify')}
              </button>

              <div className="flex flex-col gap-2 text-sm">
                {/* Email fallback / switch buttons */}
                {hasEmailFallback && activeVerifyMethod === 'totp' && (
                  <button
                    type="button"
                    onClick={handleSendEmailFallback}
                    disabled={isResending}
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    {isResending ? t('common.sending') : t('auth.sendCodeToEmail')}
                  </button>
                )}

                {hasEmailFallback && activeVerifyMethod === 'email' && (
                  <button
                    type="button"
                    onClick={() => { setActiveVerifyMethod('totp'); setVerificationCode(''); }}
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    {t('auth.useAuthenticatorInstead')}
                  </button>
                )}

                {/* Resend button: only for email method */}
                <div className="flex justify-between items-center">
                  {activeVerifyMethod === 'email' && (
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={isResending}
                      className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
                    >
                      {isResending ? t('common.sending') : t('auth.resendCode')}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setUseBackupCode(!useBackupCode)}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 ml-auto"
                  >
                    {useBackupCode ? t('auth.useVerificationCode') : t('auth.useBackupCode')}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={resetToCredentials}
                className="flex items-center justify-center gap-2 w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('auth.backToLogin')}
              </button>
            </form>
          )}

          {/* Step 2b: Setup 2FA - Choose method */}
          {step === 'setup2fa' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <KeyRound className="w-12 h-12 mx-auto text-amber-500 mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('auth.twoFactorRequired')}
                </p>
              </div>

              <div className="space-y-3">
                {availableMethods.includes('email') && (
                  <button
                    onClick={() => handleSetup2FA('email')}
                    disabled={isLoading}
                    className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-4"
                  >
                    <Mail className="w-8 h-8 text-primary-600" />
                    <div className="text-left">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{t('auth.emailCode')}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{t('auth.emailCodeDesc')}</div>
                    </div>
                  </button>
                )}

                {availableMethods.includes('totp') && (
                  <button
                    onClick={() => handleSetup2FA('totp')}
                    disabled={isLoading}
                    className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-4"
                  >
                    <Smartphone className="w-8 h-8 text-primary-600" />
                    <div className="text-left">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{t('auth.authenticatorApp')}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{t('auth.authenticatorAppDesc')}</div>
                    </div>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={resetToCredentials}
                className="flex items-center justify-center gap-2 w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 mt-4"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('auth.backToLogin')}
              </button>
            </div>
          )}

          {/* Step 3: Verify 2FA Setup */}
          {step === 'verify-setup' && (
            <form onSubmit={handleVerifySetup} className="space-y-4">
              {twoFactorMethod === 'totp' && totpQrCode && (
                <div className="text-center mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {t('auth.scanQrCode')}
                  </p>
                  <img src={totpQrCode} alt="QR Code" className="mx-auto mb-4" />
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t('auth.enterCodeManually')} <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{totpSecret}</code>
                  </div>
                </div>
              )}

              {twoFactorMethod === 'email' && (
                <div className="text-center mb-4">
                  <Mail className="w-12 h-12 mx-auto text-primary-600 mb-2" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('auth.enterVerificationCodeEmail')}
                  </p>
                </div>
              )}

              <div>
                <label className="label">{t('auth.verificationCode')}</label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="input text-center tracking-widest text-lg"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('auth.verifyAndEnable2fa')}
              </button>

              <button
                type="button"
                onClick={() => setStep('setup2fa')}
                className="flex items-center justify-center gap-2 w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('auth.chooseDifferentMethod')}
              </button>
            </form>
          )}

          {/* Step 4: Backup Codes */}
          {step === 'backup-codes' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('auth.twoFaEnabled')}
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {backupCodes.map((code, index) => (
                    <div key={index} className="text-center py-1">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={copyBackupCodes}
                className="btn btn-secondary w-full flex items-center justify-center gap-2"
              >
                {copiedCodes ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedCodes ? t('auth.copied') : t('auth.copyBackupCodes')}
              </button>

              <button
                type="button"
                onClick={handleBackupCodesComplete}
                className="btn btn-primary w-full"
              >
                {t('auth.continueToDashboard')}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
