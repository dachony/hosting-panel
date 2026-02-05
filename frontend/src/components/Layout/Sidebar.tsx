import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { CompanyInfo } from '../../types';
import { useAuth } from '../../context/AuthContext';
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
} from 'lucide-react';

const SIDEBAR_WIDTH = 256;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { isSalesAdmin, isAdmin } = useAuth();

  const { data: companyData } = useQuery({
    queryKey: ['company-info'],
    queryFn: () => api.get<{ company: CompanyInfo | null }>('/api/company/info'),
  });

  const company = companyData?.company;

  // Build navigation based on role
  // Sales: only Dashboard, Clients, Domains
  // SalesAdmin+: add Settings (limited)
  // Admin+: add Audit Log, Email Log, System Status
  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Clients', href: '/clients', icon: Users },
    { name: 'Domains', href: '/domains', icon: Globe },
    // Settings visible to salesadmin and above
    ...(isSalesAdmin ? [{ name: 'Settings', href: '/settings', icon: Settings }] : []),
    // Admin features
    ...(isAdmin ? [
      { name: 'Audit Log', href: '/audit', icon: ScrollText },
      { name: 'Email Log', href: '/emails', icon: Mail },
      { name: 'System Status', href: '/system', icon: Activity },
    ] : []),
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
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

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
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
