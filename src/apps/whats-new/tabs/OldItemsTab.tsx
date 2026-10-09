import { useLocale } from '../../../shared/context/LocaleContext';
import { TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';

export interface OldItemsTabProps {
  data: WhatsNewPageData;
}

export function OldItemsTab({ data }: OldItemsTabProps) {
  const { t } = useLocale();
  return (
    <div className="wn-tab wn-tab-old-items" data-has-whats-new={data.whatsNew ? 'true' : 'false'}>
      <TabIntro title={t('whatsNew.intro.old-items.title')} sentence={t('whatsNew.intro.old-items.sentence')} />
      <p className="wn-placeholder">{t('whatsNew.placeholder')}</p>
    </div>
  );
}
