import { useLocale } from '../../../shared/context/LocaleContext';
import { TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';

export interface OutpostTabProps {
  data: WhatsNewPageData;
}

export function OutpostTab({ data }: OutpostTabProps) {
  const { t } = useLocale();
  return (
    <div className="wn-tab wn-tab-outpost" data-has-whats-new={data.whatsNew ? 'true' : 'false'}>
      <TabIntro title={t('whatsNew.intro.outpost.title')} sentence={t('whatsNew.intro.outpost.sentence')} />
      <p className="wn-placeholder">{t('whatsNew.placeholder')}</p>
    </div>
  );
}
