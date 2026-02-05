import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ZoomContextType {
  zoom: number;
  scale: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

const ZoomContext = createContext<ZoomContextType | undefined>(undefined);

const ZOOM_STEP = 5;
const ZOOM_MIN = 50;
const ZOOM_MAX = 120;
const ZOOM_DEFAULT = 100;
const BASE_SCALE = 1.08; // 100% zoom = 1.08x scale (smanjeno za 10%)
const STORAGE_KEY = 'app-zoom';

export function ZoomProvider({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : ZOOM_DEFAULT;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(zoom));
    // Reset html font-size to default - zoom will be applied via CSS variable
    document.documentElement.style.fontSize = '';
    document.documentElement.style.setProperty('--app-zoom', String(zoom / 100));
  }, [zoom]);

  const zoomIn = () => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
  };

  const zoomOut = () => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
  };

  const resetZoom = () => {
    setZoom(ZOOM_DEFAULT);
  };

  const scale = (zoom / 100) * BASE_SCALE;

  return (
    <ZoomContext.Provider value={{ zoom, scale, zoomIn, zoomOut, resetZoom }}>
      {children}
    </ZoomContext.Provider>
  );
}

export function useZoom() {
  const context = useContext(ZoomContext);
  if (context === undefined) {
    throw new Error('useZoom must be used within a ZoomProvider');
  }
  return context;
}
