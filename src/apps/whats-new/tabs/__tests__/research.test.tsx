import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { ResearchTab } from '../ResearchTab';
import { buildResearchData } from '../research/data';

import researchJson from '../../../../../public/data/game/research.json';
import blueprintsJson from '../../../../../public/data/game/blueprints.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import outpostJson from '../../../../../public/data/game/outpost.json';
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
    outpost: domain(outpostJson),
    whatsNew: null,
  } as unknown as WhatsNewPageData;
}

describe('ResearchTab', () => {
  const data = fakeData();

  it('derives designs as furniture and the find-only lists', () => {
    const rd = buildResearchData(data);
    expect(rd.study.map((s) => s.rp)).toEqual([50, 100, 150, 200, 1000]);
    expect(rd.designs.length).toBe(rd.designCount);
    // every outpost design is listed once; a few researched pieces (aviary table) have no design item
    expect(rd.designs.length + rd.findOnlyDesigns.length).toBeGreaterThanOrEqual(Object.keys(outpostJson.designs).length);
    expect(rd.designs.some((d) => d.item.id === 'battered_aviary_table')).toBe(true);
    expect(rd.findOnlyDesigns.length).toBeGreaterThan(0);
    expect(rd.designs.every((d) => !d.item.id.endsWith('_design'))).toBe(true);
    expect(rd.findOnly.length).toBeGreaterThan(0);
  });

  it('renders the layout, tracks and the researchable blueprint tiles', () => {
    const out = renderToStaticMarkup(
      <LocaleProvider>
        <MemoryRouter>
          <ResearchTab data={data} />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(out).toContain('wn-tab-research');
    expect(out).not.toContain('data-has-whats-new');
    expect(out).toContain('wn-tile--112');
    expect(out).toContain('50 RP');
    expect(out).toContain('Build');
    expect(out).toContain('Needs station level 4');
    expect(out).toContain('Blueprints you can research');
    expect(out).toContain('RP · Level 2');
  });
});
