import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { ResearchSection } from '../ResearchSection';
import { buildResearchData } from '../research/data';

import researchJson from '../../../../../public/data/game/research.json';
import blueprintsJson from '../../../../../public/data/game/blueprints.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import itemsJson from '../../../../../public/data/game/items.json';

const domain = (structure: unknown) => ({ structure, text: {}, locale: 'en' }) as unknown as LoadedDomain<'research'>;

function fakeData(): WhatsNewPageData {
  const items = itemsJson.items as unknown as Record<string, { id: string; nameEn: string; icon: string }>;
  const catalogItems = Object.fromEntries(Object.values(items).map((i) => [i.id, { ...i, name: i.nameEn }]));
  return {
    catalog: { items: catalogItems, aliases: {} } as unknown as WhatsNewPageData['catalog'],
    research: domain(researchJson),
    blueprints: domain(blueprintsJson),
    benches: domain(benchesJson),
    whatsNew: null,
  } as unknown as WhatsNewPageData;
}

describe('ResearchSection', () => {
  const data = fakeData();

  it('derives study items, tracks and blueprint lists', () => {
    const rd = buildResearchData(data);
    expect(rd.study.map((s) => s.rp)).toEqual([50, 100, 150, 200, 1000]);
    expect(rd.amplifiedCount).toBe(15);
    expect(rd.amplifiedLevel).toBe(4);
    expect(rd.levels.map((l) => l.rooms)).toEqual([1, 2, 3, 4]);
    expect(rd.blueprintCount + rd.designCount + rd.amplifiedCount + rd.study.length).toBe(Object.keys(researchJson.research).length);
    expect(rd.findOnly.length).toBeGreaterThan(0);
    expect(rd.craftable.some((c) => c.isNew)).toBe(true);
  });

  it.each(['a', 'b'] as const)('renders variant %s', (variant) => {
    const out = renderToStaticMarkup(
      <LocaleProvider>
        <ResearchSection data={data} variant={variant} />
      </LocaleProvider>,
    );
    expect(out).toContain('id="research"');
    expect(out).toContain('Requires station level 4');
  });
});
