import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useZoom } from '../../context/ZoomContext';

const SIDEBAR_WIDTH = 256;

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const { scale } = useZoom();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    setIsLargeScreen(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const sidebarWidth = isLargeScreen ? SIDEBAR_WIDTH : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div style={{ paddingLeft: `${sidebarWidth}px` }}>
        <Header onMenuClick={() => setSidebarOpen(true)} />

        <main
          className="p-4 lg:p-8 origin-top-left"
          style={{
            transform: `scale(${scale})`,
            width: `${100 / scale}%`,
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
