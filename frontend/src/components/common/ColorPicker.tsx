import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  showOpacity?: boolean;
}

// Predefined color palette with shades
const colorPalette = [
  // Grays
  ['#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a', '#000000'],
  // Red
  ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a'],
  // Orange
  ['#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407'],
  // Yellow
  ['#fefce8', '#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12', '#422006'],
  // Green
  ['#f0fdf4', '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#052e16'],
  // Teal
  ['#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59', '#134e4a', '#042f2e'],
  // Blue
  ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
  // Indigo
  ['#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'],
  // Purple
  ['#faf5ff', '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87', '#3b0764'],
  // Pink
  ['#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843', '#500724'],
];

function hexToRgba(hex: string, opacity: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return hex;
}

function parseColor(color: string): { hex: string; opacity: number } {
  // Check if it's rgba
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
    const opacity = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
    return { hex: `#${r}${g}${b}`, opacity };
  }
  // It's hex
  return { hex: color, opacity: 1 };
}

export default function ColorPicker({ value, onChange, showOpacity = true }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { hex, opacity: initialOpacity } = parseColor(value);
  const [selectedColor, setSelectedColor] = useState(hex);
  const [opacity, setOpacity] = useState(initialOpacity);
  const [customColor, setCustomColor] = useState(hex);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const { hex: newHex, opacity: newOpacity } = parseColor(value);
    setSelectedColor(newHex);
    setOpacity(newOpacity);
    setCustomColor(newHex);
  }, [value]);

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 400; // approximate height
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      let top = rect.bottom + 4;
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        top = rect.top - dropdownHeight - 4;
      }

      setPosition({
        top: Math.max(8, top),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
      });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    setCustomColor(color);
    if (showOpacity && opacity < 1) {
      onChange(hexToRgba(color, opacity));
    } else {
      onChange(color);
    }
  };

  const handleOpacityChange = (newOpacity: number) => {
    setOpacity(newOpacity);
    if (newOpacity < 1) {
      onChange(hexToRgba(selectedColor, newOpacity));
    } else {
      onChange(selectedColor);
    }
  };

  const handleCustomColorChange = (color: string) => {
    setCustomColor(color);
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      setSelectedColor(color);
      if (showOpacity && opacity < 1) {
        onChange(hexToRgba(color, opacity));
      } else {
        onChange(color);
      }
    }
  };

  const displayColor = showOpacity && opacity < 1 ? hexToRgba(selectedColor, opacity) : selectedColor;

  const dropdown = isOpen ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed p-3 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700"
      style={{
        top: position.top,
        left: position.left,
        zIndex: 99999,
        width: 288,
      }}
    >
      {/* Color grid */}
      <div className="space-y-1 mb-3">
        {colorPalette.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-0.5">
            {row.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleColorSelect(color)}
                className={`w-5 h-5 rounded-sm border transition-transform hover:scale-110 ${
                  selectedColor.toLowerCase() === color.toLowerCase()
                    ? 'border-gray-900 dark:border-white ring-1 ring-gray-900 dark:ring-white'
                    : 'border-gray-200 dark:border-gray-600'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Custom color input */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="color"
          value={selectedColor}
          onChange={(e) => handleColorSelect(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border-0 p-0"
        />
        <input
          type="text"
          value={customColor}
          onChange={(e) => handleCustomColorChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-2 py-1.5 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Opacity slider */}
      {showOpacity && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500 dark:text-gray-400">Opacity</label>
            <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{Math.round(opacity * 100)}%</span>
          </div>
          <div className="relative">
            <div
              className="h-6 rounded"
              style={{
                backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                backgroundSize: '8px 8px',
                backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
              }}
            >
              <div
                className="h-full rounded"
                style={{
                  background: `linear-gradient(to right, transparent, ${selectedColor})`,
                }}
              />
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={opacity * 100}
              onChange={(e) => handleOpacityChange(parseInt(e.target.value) / 100)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-gray-400 rounded-full shadow pointer-events-none"
              style={{ left: `calc(${opacity * 100}% - 8px)` }}
            />
          </div>
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <div
          className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 overflow-hidden"
          style={{
            backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
            backgroundSize: '6px 6px',
            backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
          }}
        >
          <div className="w-full h-full" style={{ backgroundColor: displayColor }} />
        </div>
        <span className="text-xs text-gray-600 dark:text-gray-400 font-mono min-w-[60px]">
          {showOpacity && opacity < 1 ? `${selectedColor} ${Math.round(opacity * 100)}%` : selectedColor}
        </span>
      </button>
      {dropdown}
    </div>
  );
}
