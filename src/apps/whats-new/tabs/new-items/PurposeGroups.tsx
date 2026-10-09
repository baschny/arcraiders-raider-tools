import { useMemo } from 'react';
import { ItemGrid } from '../../components';
import { toItemRef, type WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { GroupSection } from './GroupSection';
import { buildPurposeGroups, type PurposeSource } from './groups';
import { HoverTile } from './HoverTile';
import { useHoverContext } from './useHoverContext';
import { rarityRank } from './uses';

export interface PurposeGroupsProps {
  data: WhatsNewPageData;
  sources: readonly PurposeSource[];
}

/** The round-2 purpose groups of the Old items tab: a header band and hover-card tiles per group. */
export function PurposeGroups({ data, sources }: PurposeGroupsProps) {
  const ctx = useHoverContext(data);
  const groups = useMemo(
    () =>
      buildPurposeGroups(
        sources,
        { isAmplified: (slug) => slug.includes('amplified') },
        {
          compare: (a, b) => {
            const ia = toItemRef(data.catalog, a.id);
            const ib = toItemRef(data.catalog, b.id);
            return rarityRank(ib.rarity) - rarityRank(ia.rarity) || ia.name.localeCompare(ib.name);
          },
        },
      ),
    [sources, data.catalog],
  );

  return (
    <>
      {groups.map((group) => (
        <GroupSection key={group.id} id={group.id}>
          <ItemGrid>
            {group.entries.map((e) => (
              <HoverTile key={e.source.id} ctx={ctx} source={{ id: e.source.id, uses: e.source.uses, lost: e.source.lost }} />
            ))}
          </ItemGrid>
        </GroupSection>
      ))}
    </>
  );
}
