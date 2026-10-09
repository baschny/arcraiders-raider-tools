import { useMemo } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';
import { PurposeGroups } from './new-items/PurposeGroups';
import { oldItemSources } from './new-items/sources';

export interface OldItemsTabProps {
  data: WhatsNewPageData;
}

export function OldItemsTab({ data }: OldItemsTabProps) {
  const { t } = useLocale();
  const sources = useMemo(() => oldItemSources(data), [data]);
  return (
    <div className="wn-tab wn-tab-old-items">
      <TabIntro title={t('whatsNew.intro.old-items.title')} sentence={t('whatsNew.intro.old-items.sentence')} />
      <PurposeGroups data={data} sources={sources} />
    </div>
  );
}
