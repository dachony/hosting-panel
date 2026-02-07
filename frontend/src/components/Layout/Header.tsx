import { Menu } from 'lucide-react';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  return (
    <button
      onClick={onMenuClick}
      className="fixed bottom-5 right-5 z-30 lg:hidden w-12 h-12 flex items-center justify-center rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 active:scale-95 transition-all"
      aria-label="Open menu"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}
