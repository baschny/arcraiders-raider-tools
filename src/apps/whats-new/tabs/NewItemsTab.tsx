import { useMemo, useState } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';
import { PurposeGroups } from './new-items/PurposeGroups';
import { newItemSources } from './new-items/sources';

export interface NewItemsTabProps {
  data: WhatsNewPageData;
}

export function NewItemsTab({ data }: NewItemsTabProps) {
  const { t } = useLocale();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const sources = useMemo(() => newItemSources(data), [data]);
  return (
    <div className="wn-tab wn-tab-new-items">
      <TabIntro title={t('whatsNew.intro.new-items.title')} sentence={t('whatsNew.intro.new-items.sentence')} />
      <PurposeGroups data={data} sources={sources} mode="new" selectedKey={selectedKey} onSelectedKeyChange={setSelectedKey} />
    </div>
  );
}
