import { X } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';

export interface DetailPanelProps {
  /** Accessible name; usually the selected item's name. */
  title: string;
  onClose: () => void;
  /** Shown as heading when true (default false: the content brings its own heading). */
  showTitle?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Full-width panel with a close button. Inside an `ItemGrid` it spans every column
 * (`grid-column: 1 / -1`) and is inserted below the row of the selected tile.
 */
export function DetailPanel({ title, onClose, showTitle = false, children, className }: DetailPanelProps) {
  const { t } = useLocale();
  return (
    <div className={['wn-detail', className ?? ''].filter(Boolean).join(' ')} role="region" aria-label={title}>
      <div className="wn-detail__bar">
        {showTitle && <h4 className="wn-detail__title">{title}</h4>}
        <button type="button" className="wn-detail__close" onClick={onClose} aria-label={t('whatsNew.common.close')}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="wn-detail__body">{children}</div>
    </div>
  );
}
