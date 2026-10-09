import { useLocale } from '../../../shared/context/LocaleContext';
import { TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';

export interface CraftingTabProps {
  data: WhatsNewPageData;
}

export function CraftingTab({ data }: CraftingTabProps) {
  const { t } = useLocale();
  return (
    <div className="wn-tab wn-tab-crafting" data-has-whats-new={data.whatsNew ? 'true' : 'false'}>
      <TabIntro title={t('whatsNew.intro.crafting.title')} sentence={t('whatsNew.intro.crafting.sentence')} />
      <p className="wn-placeholder">{t('whatsNew.placeholder')}</p>
    </div>
  );
}
