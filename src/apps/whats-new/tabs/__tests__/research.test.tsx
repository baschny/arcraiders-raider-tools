import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { ResearchTab } from '../ResearchTab';
import { buildResearchData, groupByLevelAndPrice, sortByRarityThenName } from '../research/data';
import { RARITIES } from '../../../../shared/gamedata/types';

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

  it('groups researchable lists by level, then by ascending RP price', () => {
    const rd = buildResearchData(data);
    for (const offers of [
      rd.craftable.map((c) => ({ offerId: c.offerId, item: c.unlocks, rp: c.rp, level: c.level, inputs: c.inputs })),
      rd.designs,
    ]) {
      const groups = groupByLevelAndPrice(offers);
      expect(groups.map((g) => g.level)).toEqual([...groups.map((g) => g.level)].sort((a, b) => a - b));
      let total = 0;
      for (const g of groups) {
        const prices = g.prices.map((p) => p.rp);
        expect(prices).toEqual([...prices].sort((a, b) => a - b));
        expect(new Set(prices).size).toBe(prices.length);
        for (const p of g.prices) {
          expect(p.offers.length).toBeGreaterThan(0);
          expect(p.offers.every((o) => o.level === g.level && o.rp === p.rp)).toBe(true);
          total += p.offers.length;
        }
      }
      expect(total).toBe(offers.length);
    }
  });

  it('sorts the find-only lists by rarity, then name', () => {
    const rd = buildResearchData(data);
    for (const list of [rd.findOnly, rd.findOnlyDesigns]) {
      const sorted = sortByRarityThenName(list);
      expect(sorted.length).toBe(list.length);
      const rank = (r?: string) => (RARITIES.indexOf(r as never) < 0 ? RARITIES.length : RARITIES.indexOf(r as never));
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1];
        const b = sorted[i];
        expect(rank(a.rarity)).toBeLessThanOrEqual(rank(b.rarity));
        if (rank(a.rarity) === rank(b.rarity)) expect(a.name.localeCompare(b.name)).toBeLessThanOrEqual(0);
      }
    }
  });

  it('renders the layout, tracks and the level and price groups', () => {
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
    expect(out).toContain('Build at the Outpost');
    expect(out).toContain('Research Station level 2');
    expect(out).toContain('wn-needs--compact');
    expect(out).toContain('Needs station level 4');
    for (const label of ['Blueprints you can research', 'Blueprints you must find', 'Designs you can research', 'Designs you can only find']) {
      expect(out).toContain(label);
    }
    expect(out).toContain('wn-research__level-heading');
    expect(out).toContain('wn-research__price-heading');
    expect(out).not.toContain('RP · Level');
  });
});
