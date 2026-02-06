import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';

interface DateInputProps {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** Compact variant for inline/toolbar usage */
  size?: 'default' | 'sm';
  className?: string;
}

function formatDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}.${month}.${year}`;
}

export default function DateInput({
  name,
  value,
  onChange,
  required = false,
  size = 'default',
  className = '',
}: DateInputProps) {
  const isSmall = size === 'sm';
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    try {
      inputRef.current?.showPicker();
    } catch {
      inputRef.current?.focus();
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Visible styled display */}
      <div
        onClick={handleClick}
        className={`input w-full cursor-pointer select-none
          bg-white dark:bg-gray-800
          border-gray-300 dark:border-gray-600
          ${value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}
          ${isSmall ? 'pr-8 text-xs py-1 px-1.5' : 'pr-12 text-base py-3'}`}
      >
        {formatDisplay(value) || 'dd.mm.yyyy'}
      </div>
      {/* Hidden native date input */}
      <input
        ref={inputRef}
        type="date"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        onClick={handleClick}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <CalendarDays
        className={`absolute top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none
        ${isSmall ? 'right-1.5 w-3.5 h-3.5' : 'right-3 w-5 h-5'}`}
      />
    </div>
  );
}
