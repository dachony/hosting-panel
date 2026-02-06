import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import Layout from './components/Layout/Layout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import DomainsPage from './pages/HostingPage';
import DomainDetailPage from './pages/DomainDetailPage';
import SettingsPage from './pages/SettingsPage';
import AuditLogPage from './pages/AuditLogPage';
import EmailLogPage from './pages/EmailLogPage';
import SystemStatusPage from './pages/SystemStatusPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, needsSetup } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, needsSetup } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}

function SetupRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, needsSetup } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!needsSetup) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route path="/setup" element={<SetupRoute><SetupPage /></SetupRoute>} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:id" element={<ClientDetailPage />} />
        <Route path="domains" element={<DomainsPage />} />
        <Route path="domains/:id" element={<DomainDetailPage />} />
        <Route path="packages" element={<Navigate to="/settings" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="emails" element={<EmailLogPage />} />
        <Route path="system" element={<SystemStatusPage />} />
        {/* Redirect old routes */}
        <Route path="hosting" element={<Navigate to="/domains" replace />} />
        <Route path="mail-packages" element={<Navigate to="/settings" replace />} />
        <Route path="mail-hosting" element={<Navigate to="/domains" replace />} />
        <Route path="templates" element={<Navigate to="/settings" replace />} />
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}
