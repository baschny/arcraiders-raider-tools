import { useLocale } from '../../../shared/context/LocaleContext';
import { TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';

export interface AmplifiedTabProps {
  data: WhatsNewPageData;
}

export function AmplifiedTab({ data }: AmplifiedTabProps) {
  const { t } = useLocale();
  return (
    <div className="wn-tab wn-tab-amplified" data-has-whats-new={data.whatsNew ? 'true' : 'false'}>
      <TabIntro title={t('whatsNew.intro.amplified.title')} sentence={t('whatsNew.intro.amplified.sentence')} />
      <p className="wn-placeholder">{t('whatsNew.placeholder')}</p>
    </div>
  );
}
