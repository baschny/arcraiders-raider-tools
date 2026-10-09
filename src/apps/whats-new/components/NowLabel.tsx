import { Sparkles } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';

/** Column label of the current state: "Frozen Trail" with the "new" sparkle. */
export function NowLabel() {
  const { t } = useLocale();
  return (
    <span className="wn-now-label">
      <Sparkles size={14} aria-hidden="true" />
      {t('whatsNew.common.now')}
    </span>
  );
}
