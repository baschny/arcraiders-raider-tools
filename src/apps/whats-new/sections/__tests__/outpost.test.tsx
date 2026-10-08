import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { OutpostSection } from '../OutpostSection';
import { buildExpansionTiers, celesteTrades, pickFurnitureExamples } from '../outpost/data';

import outpostJson from '../../../../../public/data/game/outpost.json';
import blueprintsJson from '../../../../../public/data/game/blueprints.json';
import tradesJson from '../../../../../public/data/game/trades.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import benchesText from '../../../../../public/data/game/benches.text.en.json';
import itemsJson from '../../../../../public/data/game/items.json';

const domain = (structure: unknown, text: unknown = {}) => ({ structure, text, locale: 'en' }) as unknown as LoadedDomain<'outpost'>;

function fakeData(): WhatsNewPageData {
  const items = itemsJson.items as unknown as Record<string, { id: string; nameEn: string; icon: string; rarity?: string }>;
  const catalogItems = Object.fromEntries(Object.values(items).map((i) => [i.id, { ...i, name: i.nameEn }]));
  return {
    catalog: { items: catalogItems, aliases: {} } as unknown as WhatsNewPageData['catalog'],
    outpost: domain(outpostJson),
    blueprints: domain(blueprintsJson),
    trades: domain(tradesJson),
    benches: domain(benchesJson, benchesText),
    whatsNew: null,
  } as unknown as WhatsNewPageData;
}

describe('OutpostSection', () => {
  const data = fakeData();

  it('derives three expansion tiers with costs and unlocks', () => {
    const tiers = buildExpansionTiers(data);
    expect(tiers.map((t) => t.tier)).toEqual([1, 2, 3]);
    expect(tiers[2].rooms.at(-1)?.special).toBe(true);
    expect(tiers[2].unlocks.some((u) => u.benchId === 'weapon_bench' && u.level === 4)).toBe(true);
  });

  it('picks six furniture examples and Celeste trades', () => {
    expect(pickFurnitureExamples(data)).toHaveLength(6);
    expect(celesteTrades(data).map((t) => t.cost.quantity)).toEqual([3, 3, 20]);
  });

  it.each(['a', 'b'] as const)('renders variant %s', (variant) => {
    const out = renderToStaticMarkup(
      <LocaleProvider>
        <OutpostSection data={data} variant={variant} />
      </LocaleProvider>,
    );
    expect(out).toContain('id="outpost"');
    expect(out).toContain('/images/trader/celeste.png');
    if (variant === 'b') expect(out).toContain('Expand Outpost');
  });
});
