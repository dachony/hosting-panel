import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/client';
import { User, AuthResponse } from '../types';

export type UserRole = 'superadmin' | 'admin' | 'salesadmin' | 'sales';

interface TwoFactorPending {
  sessionToken: string;
  method: 'email' | 'totp';
}

interface TwoFactorSetupPending {
  setupToken: string;
  availableMethods: ('email' | 'totp')[];
}

interface LoginResult {
  success: boolean;
  requires2FA?: TwoFactorPending;
  requires2FASetup?: TwoFactorSetupPending;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verify2FA: (sessionToken: string, code: string, useBackupCode?: boolean) => Promise<void>;
  setup2FA: (setupToken: string, method: 'email' | 'totp') => Promise<{ secret?: string; qrCode?: string }>;
  verify2FASetup: (setupToken: string, code: string, method: 'email' | 'totp') => Promise<{ backupCodes?: string[] }>;
  resend2FACode: (sessionToken: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  // Role checks
  isSuperAdmin: boolean;  // Can do everything
  isAdmin: boolean;       // superadmin or admin - can manage content
  isSalesAdmin: boolean;  // superadmin, admin, or salesadmin - can view/add packages
  canManageSystem: boolean;    // Only superadmin
  canManageContent: boolean;   // superadmin or admin
  canEditPackages: boolean;    // superadmin or admin (not salesadmin)
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
      // Verify token is still valid
      api.get<{ user: User }>('/api/auth/me')
        .then(({ user }) => {
          setUser(user);
          localStorage.setItem('user', JSON.stringify(user));
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const response = await api.post<AuthResponse & {
      requires2FA?: boolean;
      requires2FASetup?: boolean;
      method?: 'email' | 'totp';
      sessionToken?: string;
      setupToken?: string;
      availableMethods?: ('email' | 'totp')[];
    }>('/api/auth/login', { email, password });

    // Check if 2FA verification is needed
    if (response.requires2FA && response.sessionToken && response.method) {
      return {
        success: false,
        requires2FA: {
          sessionToken: response.sessionToken,
          method: response.method,
        },
      };
    }

    // Check if 2FA setup is required
    if (response.requires2FASetup && response.setupToken) {
      return {
        success: false,
        requires2FASetup: {
          setupToken: response.setupToken,
          availableMethods: response.availableMethods || ['email', 'totp'],
        },
      };
    }

    // Normal login success
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    setUser(response.user);
    return { success: true };
  };

  const verify2FA = async (sessionToken: string, code: string, useBackupCode = false) => {
    const response = await api.post<AuthResponse>('/api/auth/login/verify-2fa', {
      sessionToken,
      code,
      useBackupCode,
    });
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    setUser(response.user);
  };

  const setup2FA = async (setupToken: string, method: 'email' | 'totp') => {
    const response = await api.post<{ secret?: string; qrCode?: string; message?: string }>('/api/auth/login/setup-2fa', {
      setupToken,
      method,
    });
    return response;
  };

  const verify2FASetup = async (setupToken: string, code: string, method: 'email' | 'totp') => {
    const response = await api.post<AuthResponse & { backupCodes?: string[] }>('/api/auth/login/verify-2fa-setup', {
      setupToken,
      code,
      method,
    });
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    setUser(response.user);
    return { backupCodes: response.backupCodes };
  };

  const resend2FACode = async (sessionToken: string) => {
    await api.post('/api/auth/login/resend-2fa', { sessionToken });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  // Role helpers
  const role = user?.role as UserRole | undefined;
  const isSuperAdmin = role === 'superadmin';
  const isAdmin = role === 'superadmin' || role === 'admin';
  const isSalesAdmin = role === 'superadmin' || role === 'admin' || role === 'salesadmin';

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        verify2FA,
        setup2FA,
        verify2FASetup,
        resend2FACode,
        logout,
        isAuthenticated: !!user,
        isSuperAdmin,
        isAdmin,
        isSalesAdmin,
        canManageSystem: isSuperAdmin,
        canManageContent: isAdmin,
        canEditPackages: isAdmin, // salesadmin can add but not edit/delete
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
