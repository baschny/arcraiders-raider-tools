import { useLocale } from '../../../shared/context/LocaleContext';
import { TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';

export interface NewItemsTabProps {
  data: WhatsNewPageData;
}

export function NewItemsTab({ data }: NewItemsTabProps) {
  const { t } = useLocale();
  return (
    <div className="wn-tab wn-tab-new-items" data-has-whats-new={data.whatsNew ? 'true' : 'false'}>
      <TabIntro title={t('whatsNew.intro.new-items.title')} sentence={t('whatsNew.intro.new-items.sentence')} />
      <p className="wn-placeholder">{t('whatsNew.placeholder')}</p>
    </div>
  );
}
