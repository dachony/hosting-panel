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
      // showPicker() may throw if already open or unsupported
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="date"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        onClick={handleClick}
        className={`input w-full cursor-pointer appearance-none
          bg-white dark:bg-gray-800
          border-gray-300 dark:border-gray-600
          text-gray-900 dark:text-gray-100
          [color-scheme:light] dark:[color-scheme:dark]
          [&::-webkit-calendar-picker-indicator]:hidden
          [&::-webkit-inner-spin-button]:hidden
          ${isSmall ? 'pr-8 text-xs py-1 px-1.5' : 'pr-12 text-base py-3'}`}
      />
      <CalendarDays
        onClick={handleClick}
        className={`absolute top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer
        ${isSmall ? 'right-1.5 w-3.5 h-3.5' : 'right-3 w-5 h-5'}`}
      />
    </div>
  );
}
