import { useEffect, useCallback } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  questList?: string[];
  showMore?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  questList = [],
  showMore = 0,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t, tm } = useLocale();
  // Handle escape key
  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onCancel();
      }
    },
    [isOpen, onCancel]
  );

  // Handle enter key for confirm
  const handleEnter = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' && isOpen) {
        onConfirm();
      }
    },
    [isOpen, onConfirm]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('keydown', handleEnter);
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('keydown', handleEnter);
      };
    }
  }, [isOpen, handleEscape, handleEnter]);

  if (!isOpen) return null;

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header">
          <h2 className="confirm-dialog-title">{title}</h2>
        </div>

        <div className="confirm-dialog-content">
          <p className="confirm-dialog-message">{message}</p>

          {questList.length > 0 && (
            <div className="confirm-dialog-quest-list">
              {questList.map((questName, index) => (
                <div key={index} className="confirm-dialog-quest-item">
                  {questName}
                </div>
              ))}
              {showMore > 0 && (
                <div className="confirm-dialog-quest-more">
                  {tm('quests.dialogMore', { count: showMore })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="confirm-dialog-actions">
          <button
            className="confirm-dialog-button confirm-dialog-button-cancel"
            onClick={onCancel}
          >
            {t('quests.dialogCancel')}
          </button>
          <button
            className="confirm-dialog-button confirm-dialog-button-confirm"
            onClick={onConfirm}
            autoFocus
          >
            {t('quests.dialogConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
