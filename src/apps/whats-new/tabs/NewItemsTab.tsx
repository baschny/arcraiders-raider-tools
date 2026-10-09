import { useMemo } from 'react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemGrid, TabIntro } from '../components';
import type { WhatsNewPageData } from '../hooks/useWhatsNewData';
import { FallenEmperorGuide } from './new-items/FallenEmperorGuide';
import { GroupSection } from './new-items/GroupSection';
import { HoverTile } from './new-items/HoverTile';
import { useHoverContext } from './new-items/useHoverContext';
import { buildNewItemsModel } from './new-items/model';
import { ResearchPointsExtras } from './new-items/ResearchPointsExtras';
import { UnlockCards } from './new-items/UnlockCards';

export interface NewItemsTabProps {
  data: WhatsNewPageData;
}

export function NewItemsTab({ data }: NewItemsTabProps) {
  const { t } = useLocale();
  const ctx = useHoverContext(data);
  const model = useMemo(() => buildNewItemsModel(data, ctx), [data, ctx]);
  return (
    <div className="wn-tab wn-tab-new-items">
      <TabIntro title={t('whatsNew.intro.new-items.title')} sentence={t('whatsNew.intro.new-items.sentence')} />
      {model.cards.length > 0 && (
        <GroupSection id="unlocks">
          <UnlockCards ctx={ctx} cards={model.cards} sources={model.sources} />
        </GroupSection>
      )}
      {model.groups.map((group) => (
        <GroupSection key={group.id} id={group.id}>
          {group.id === 'fallenEmperor' && <FallenEmperorGuide data={data} />}
          <ItemGrid>
            {group.entries.map((e) => (
              <HoverTile key={e.id} ctx={ctx} source={model.sources.get(e.id) ?? { id: e.id }} amount={e.amount} isBlueprint={e.isBlueprint} />
            ))}
          </ItemGrid>
          {group.id === 'researchPoints' && <ResearchPointsExtras ctx={ctx} model={model} />}
        </GroupSection>
      ))}
    </div>
  );
}
