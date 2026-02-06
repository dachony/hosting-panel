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
    '50': '#f4f6fa', '100': '#e8ecf4', '200': '#cdd5e5', '300': '#a8b6d0',
    '400': '#7e93b8', '500': '#5f78a0', '600': '#4c6288', '700': '#3f5070',
    '800': '#354259', '900': '#2c3648', '950': '#1d2430',
  },
  indigo: {
    '50': '#f4f4f9', '100': '#e8e8f2', '200': '#cdcde3', '300': '#a9a8cd',
    '400': '#8683b5', '500': '#6c689d', '600': '#585485', '700': '#48446d',
    '800': '#3b3859', '900': '#312e48', '950': '#201e30',
  },
  violet: {
    '50': '#f6f4f9', '100': '#ece8f2', '200': '#d6cee3', '300': '#b8abcd',
    '400': '#9a89b5', '500': '#806d9d', '600': '#6a5885', '700': '#57476d',
    '800': '#483b59', '900': '#3b3148', '950': '#272030',
  },
  emerald: {
    '50': '#f2f7f5', '100': '#e2efe9', '200': '#c3ddd2', '300': '#97c3b1',
    '400': '#6da892', '500': '#4f8d78', '600': '#407362', '700': '#355e50',
    '800': '#2c4d42', '900': '#243f36', '950': '#182924',
  },
  amber: {
    '50': '#f9f6f0', '100': '#f2ebdb', '200': '#e3d4b4', '300': '#cfb785',
    '400': '#bb9a5e', '500': '#a38148', '600': '#896a3a', '700': '#6f5530',
    '800': '#5b4528', '900': '#4a3921', '950': '#312516',
  },
  rose: {
    '50': '#f9f3f4', '100': '#f2e3e6', '200': '#e3c5cb', '300': '#cd9da7',
    '400': '#b57884', '500': '#9d5d6a', '600': '#854c57', '700': '#6d3e47',
    '800': '#5a343b', '900': '#4a2b32', '950': '#301c21',
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
