import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type AccentColor = 'blue' | 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose';
export type Density = 'comfy' | 'compact';

interface AppearanceContextType {
  accent: AccentColor;
  setAccent: (color: AccentColor) => void;
  density: Density;
  setDensity: (density: Density) => void;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

const ACCENT_KEY = 'app-accent';
const DENSITY_KEY = 'app-density';

const ACCENT_PALETTES: Record<AccentColor, Record<string, string>> = {
  blue: {
    '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd',
    '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8',
    '800': '#1e40af', '900': '#1e3a8a', '950': '#172554',
  },
  indigo: {
    '50': '#eef2ff', '100': '#e0e7ff', '200': '#c7d2fe', '300': '#a5b4fc',
    '400': '#818cf8', '500': '#6366f1', '600': '#4f46e5', '700': '#4338ca',
    '800': '#3730a3', '900': '#312e81', '950': '#1e1b4b',
  },
  violet: {
    '50': '#f5f3ff', '100': '#ede9fe', '200': '#ddd6fe', '300': '#c4b5fd',
    '400': '#a78bfa', '500': '#8b5cf6', '600': '#7c3aed', '700': '#6d28d9',
    '800': '#5b21b6', '900': '#4c1d95', '950': '#2e1065',
  },
  emerald: {
    '50': '#ecfdf5', '100': '#d1fae5', '200': '#a7f3d0', '300': '#6ee7b7',
    '400': '#34d399', '500': '#10b981', '600': '#059669', '700': '#047857',
    '800': '#065f46', '900': '#064e3b', '950': '#022c22',
  },
  amber: {
    '50': '#fffbeb', '100': '#fef3c7', '200': '#fde68a', '300': '#fcd34d',
    '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309',
    '800': '#92400e', '900': '#78350f', '950': '#451a03',
  },
  rose: {
    '50': '#fff1f2', '100': '#ffe4e6', '200': '#fecdd3', '300': '#fda4af',
    '400': '#fb7185', '500': '#f43f5e', '600': '#e11d48', '700': '#be123c',
    '800': '#9f1239', '900': '#881337', '950': '#4c0519',
  },
};

function applyAccentColors(accent: AccentColor) {
  const root = document.documentElement;
  const palette = ACCENT_PALETTES[accent];
  for (const [shade, value] of Object.entries(palette)) {
    root.style.setProperty(`--color-primary-${shade}`, value);
  }
}

function applyDensity(density: Density) {
  const root = document.documentElement;
  if (density === 'compact') {
    root.classList.add('compact-mode');
  } else {
    root.classList.remove('compact-mode');
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentColor>(() => {
    const stored = localStorage.getItem(ACCENT_KEY) as AccentColor;
    return stored && stored in ACCENT_PALETTES ? stored : 'blue';
  });

  const [density, setDensityState] = useState<Density>(() => {
    const stored = localStorage.getItem(DENSITY_KEY) as Density;
    return stored === 'compact' ? 'compact' : 'comfy';
  });

  useEffect(() => {
    applyAccentColors(accent);
  }, [accent]);

  useEffect(() => {
    applyDensity(density);
  }, [density]);

  const setAccent = (color: AccentColor) => {
    localStorage.setItem(ACCENT_KEY, color);
    setAccentState(color);
  };

  const setDensity = (d: Density) => {
    localStorage.setItem(DENSITY_KEY, d);
    setDensityState(d);
  };

  return (
    <AppearanceContext.Provider value={{ accent, setAccent, density, setDensity }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (context === undefined) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
  }
  return context;
}
