import { useLocale } from '../../../shared/context/LocaleContext';
import { TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';

export interface ChangesTabProps {
  data: WhatsNewPageData;
}

export function ChangesTab({ data }: ChangesTabProps) {
  const { t } = useLocale();
  return (
    <div className="wn-tab wn-tab-changes" data-has-whats-new={data.whatsNew ? 'true' : 'false'}>
      <TabIntro title={t('whatsNew.intro.changes.title')} sentence={t('whatsNew.intro.changes.sentence')} />
      <p className="wn-placeholder">{t('whatsNew.placeholder')}</p>
    </div>
  );
}
