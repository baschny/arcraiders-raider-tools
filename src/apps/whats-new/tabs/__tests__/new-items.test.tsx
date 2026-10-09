import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain, WhatsNewUse } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { PURPOSE_ORDER, buildPurposeGroups, purposeOfUse, selectionKey, type PurposeContext } from '../new-items/groups';
import { newItemSources, oldItemSources } from '../new-items/sources';
import { NewItemsTab } from '../NewItemsTab';
import { OldItemsTab } from '../OldItemsTab';

import itemsJson from '../../../../../public/data/game/items.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import tradesJson from '../../../../../public/data/game/trades.json';
import blueprintsJson from '../../../../../public/data/game/blueprints.json';
import whatsNewJson from '../../../../../public/data/game/whats-new.json';

const domain = (structure: unknown) => ({ structure, text: {}, locale: 'en' }) as unknown as LoadedDomain<'benches'>;

function fakeData(): WhatsNewPageData {
  const items = itemsJson.items as unknown as Record<string, { id: string; nameEn: string; icon: string; rarity?: string }>;
  const catalogItems = Object.fromEntries(Object.values(items).map((i) => [i.id, { ...i, name: i.nameEn }]));
  return {
    catalog: { items: catalogItems, aliases: {} } as unknown as WhatsNewPageData['catalog'],
    benches: domain(benchesJson),
    trades: domain(tradesJson),
    blueprints: domain(blueprintsJson),
    whatsNew: whatsNewJson,
  } as unknown as WhatsNewPageData;
}

const ctx: PurposeContext = { isAmplified: (slug) => slug.includes('amplified') };
const use = (system: WhatsNewUse['system'], target: WhatsNewUse['target'], amount = 1): WhatsNewUse => ({ system, target, amount });

describe('purposeOfUse', () => {
  it('maps systems to purposes', () => {
    expect(purposeOfUse(use('outpostRoom', 'chalet_room'), ctx)).toBe('outpost');
    expect(purposeOfUse(use('researchStation', { bench: 'research_station', level: 2 }), ctx)).toBe('researchStation');
    expect(purposeOfUse(use('benchUpgrade', { bench: 'research_station', level: 4 }), ctx)).toBe('researchStation');
    expect(purposeOfUse(use('benchUpgrade', { bench: 'weapon_bench', level: 4 }), ctx)).toBe('gunsmith4');
    expect(purposeOfUse(use('benchUpgrade', { stashSlots: 304 }), ctx)).toBeNull();
    expect(purposeOfUse(use('amplifyPerk', 'x_amplified_y'), ctx)).toBe('amplified');
    expect(purposeOfUse(use('repair', 'canto_amplified'), ctx)).toBe('amplified');
    expect(purposeOfUse(use('repair', 'grapple_hook'), ctx)).toBe('crafting');
    expect(purposeOfUse(use('research', 'bp'), ctx)).toBe('researchBlueprints');
    expect(purposeOfUse(use('fieldCraft', 'x'), ctx)).toBe('crafting');
    expect(purposeOfUse(use('project', 'p'), ctx)).toBe('quests');
    expect(purposeOfUse(use('trade', 'x'), ctx)).toBe('trades');
  });
});

describe('buildPurposeGroups', () => {
  it('puts an item in every group it has a use in, in spec order, hiding empty groups', () => {
    const groups = buildPurposeGroups(
      [
        { id: 'a', uses: [use('craft', 'x'), use('outpostFurniture', 'f'), use('outpostRoom', 'r')] },
        { id: 'b', uses: [use('craft', 'y')] },
      ],
      ctx,
    );
    expect(groups.map((g) => g.id)).toEqual(['outpost', 'furniture', 'crafting']);
    expect(groups[2].entries.map((e) => e.source.id)).toEqual(['a', 'b']);
    expect(groups[0].entries[0].uses).toHaveLength(1);
  });

  it('adds study items to Research Points and unused items to No use yet only when asked', () => {
    const sources = [{ id: 's', group: 'study' }, { id: 'n', uses: [] }, { id: 'q', uses: [use('benchUpgrade', { stashSlots: 1 })] }];
    expect(buildPurposeGroups(sources, ctx).map((g) => g.id)).toEqual(['researchPoints']);
    const withNoUse = buildPurposeGroups(sources, ctx, { includeNoUse: true });
    expect(withNoUse.map((g) => g.id)).toEqual(['researchPoints', 'noUse']);
    expect(withNoUse[1].entries.map((e) => e.source.id)).toEqual(['n', 'q']);
  });

  it('sorts items inside a group with the compare function', () => {
    const groups = buildPurposeGroups([{ id: 'b', uses: [use('craft', 'x')] }, { id: 'a', uses: [use('craft', 'x')] }], ctx, {
      compare: (x, y) => x.id.localeCompare(y.id),
    });
    expect(groups[0].entries.map((e) => e.source.id)).toEqual(['a', 'b']);
  });

  it('builds the real 2.0 groups', () => {
    const data = fakeData();
    const groups = buildPurposeGroups(newItemSources(data), { isAmplified: (s) => s.includes('amplified') }, { includeNoUse: true });
    const ids = groups.map((g) => g.id);
    expect(ids).toEqual(PURPOSE_ORDER.filter((id) => ids.includes(id)));
    expect(ids).toContain('noUse');
    expect(ids).toContain('researchPoints');
    const old = buildPurposeGroups(oldItemSources(data), { isAmplified: (s) => s.includes('amplified') });
    expect(old.map((g) => g.id)).not.toContain('noUse');
    expect(old.length).toBeGreaterThan(0);
  });

  it('builds selection keys per group and item', () => {
    expect(selectionKey('crafting', 'x')).toBe('crafting:x');
  });
});

describe('tabs', () => {
  it('render group headers and item tiles', () => {
    const data = fakeData();
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <NewItemsTab data={data} />
        <OldItemsTab data={data} />
      </LocaleProvider>,
    );
    expect(html).toContain('Expanding the Outpost');
    expect(html).toContain('No use yet');
    expect(html).not.toContain('Keep');
  });
});
