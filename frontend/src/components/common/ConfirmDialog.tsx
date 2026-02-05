import { useTranslation } from 'react-i18next';
import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  isLoading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>

      <div className="flex justify-end space-x-3">
        <button
          onClick={onClose}
          className="btn btn-secondary"
          disabled={isLoading}
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="btn btn-danger"
          disabled={isLoading}
        >
          {isLoading ? t('common.loading') : confirmText || t('common.delete')}
        </button>
      </div>
    </Modal>
  );
}
