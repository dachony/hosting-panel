import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setOnUnauthorized } from '../api/client';
import { User, AuthResponse } from '../types';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const THROTTLE_INTERVAL = 60 * 1000; // 60 seconds

export type UserRole = 'superadmin' | 'admin' | 'salesadmin' | 'sales';

interface TwoFactorPending {
  sessionToken: string;
  method: 'email' | 'totp';
  hasEmailFallback: boolean;
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
  needsSetup: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verify2FA: (sessionToken: string, code: string, useBackupCode?: boolean, method?: 'email' | 'totp') => Promise<void>;
  setup2FA: (setupToken: string, method: 'email' | 'totp') => Promise<{ secret?: string; qrCode?: string }>;
  verify2FASetup: (setupToken: string, code: string, method: 'email' | 'totp') => Promise<{ backupCodes?: string[] }>;
  resend2FACode: (sessionToken: string) => Promise<void>;
  sendEmailFallback: (sessionToken: string) => Promise<void>;
  completeSetup: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  // Role checks
  isSuperAdmin: boolean;  // Can do everything
  isAdmin: boolean;       // superadmin or admin - can manage content
  isSalesAdmin: boolean;  // superadmin, admin, or salesadmin - can view/add packages
  canWriteData: boolean;       // superadmin, admin, or salesadmin - can create/edit data
  isSales: boolean;            // role === 'sales' (read-only + PDF upload + extend)
  canManageSystem: boolean;    // Only superadmin
  canManageContent: boolean;   // superadmin or admin
  canEditPackages: boolean;    // superadmin or admin (not salesadmin)
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Register soft redirect callback for 401 responses
  const handleUnauthorized = useCallback(() => {
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setOnUnauthorized(handleUnauthorized);
    return () => setOnUnauthorized(null);
  }, [handleUnauthorized]);

  useEffect(() => {
    const init = async () => {
      try {
        // Check if setup is needed
        const setupRes = await fetch('/api/auth/setup-status');
        const setupData = await setupRes.json();
        if (setupData.needsSetup) {
          setNeedsSetup(true);
          setIsLoading(false);
          return;
        }
      } catch {
        // If setup-status fails, continue normally
      }

      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');

      if (storedUser && token) {
        setUser(JSON.parse(storedUser));
        try {
          const { user } = await api.get<{ user: User }>('/api/auth/me');
          setUser(user);
          localStorage.setItem('user', JSON.stringify(user));
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      }

      setIsLoading(false);
    };

    init();
  }, []);

  // Inactivity auto-logout
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        api.post('/api/auth/logout', {}).catch(() => {});
        logout();
      }, INACTIVITY_TIMEOUT);
    };

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < THROTTLE_INTERVAL) return;
      lastActivityRef.current = now;
      resetTimer();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach(e => window.addEventListener(e, handleActivity));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [user]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const response = await api.post<AuthResponse & {
      requires2FA?: boolean;
      requires2FASetup?: boolean;
      method?: 'email' | 'totp';
      hasEmailFallback?: boolean;
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
          hasEmailFallback: response.hasEmailFallback || false,
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

  const verify2FA = async (sessionToken: string, code: string, useBackupCode = false, method?: 'email' | 'totp') => {
    const response = await api.post<AuthResponse>('/api/auth/login/verify-2fa', {
      sessionToken,
      code,
      useBackupCode,
      method,
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

  const sendEmailFallback = async (sessionToken: string) => {
    await api.post('/api/auth/login/send-email-fallback', { sessionToken });
  };

  const completeSetup = (token: string, setupUser: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(setupUser));
    setUser(setupUser);
    setNeedsSetup(false);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    queryClient.clear();
  };

  // Role helpers
  const role = user?.role as UserRole | undefined;
  const isSuperAdmin = role === 'superadmin';
  const isAdmin = role === 'superadmin' || role === 'admin';
  const isSalesAdmin = role === 'superadmin' || role === 'admin' || role === 'salesadmin';
  const canWriteData = isSalesAdmin; // superadmin || admin || salesadmin
  const isSales = role === 'sales';

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        needsSetup,
        login,
        verify2FA,
        setup2FA,
        verify2FASetup,
        resend2FACode,
        sendEmailFallback,
        completeSetup,
        logout,
        isAuthenticated: !!user,
        isSuperAdmin,
        isAdmin,
        isSalesAdmin,
        canWriteData,
        isSales,
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
