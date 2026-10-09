import { useLocale } from '../../../shared/context/LocaleContext';
import { TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';

export interface ResearchTabProps {
  data: WhatsNewPageData;
}

export function ResearchTab({ data }: ResearchTabProps) {
  const { t } = useLocale();
  return (
    <div className="wn-tab wn-tab-research" data-has-whats-new={data.whatsNew ? 'true' : 'false'}>
      <TabIntro title={t('whatsNew.intro.research.title')} sentence={t('whatsNew.intro.research.sentence')} />
      <p className="wn-placeholder">{t('whatsNew.placeholder')}</p>
    </div>
  );
}
