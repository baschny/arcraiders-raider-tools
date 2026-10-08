import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain, WhatsNewNewItem, WhatsNewUse } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { NewItemsSection } from '../NewItemsSection';
import { NewUsesSection } from '../NewUsesSection';
import { capList, collapseRows, filterNewItems, groupBySystem, sortByImpact, sortNewItems } from '../shared/uses';

import itemsJson from '../../../../../public/data/game/items.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import tradesJson from '../../../../../public/data/game/trades.json';
import whatsNewJson from '../../../../../public/data/game/whats-new.json';

const domain = (structure: unknown) => ({ structure, text: {}, locale: 'en' }) as unknown as LoadedDomain<'benches'>;

function fakeData(): WhatsNewPageData {
  const items = itemsJson.items as unknown as Record<string, { id: string; nameEn: string; icon: string; rarity?: string }>;
  const catalogItems = Object.fromEntries(Object.values(items).map((i) => [i.id, { ...i, name: i.nameEn }]));
  return {
    catalog: { items: catalogItems, aliases: {} } as unknown as WhatsNewPageData['catalog'],
    benches: domain(benchesJson),
    trades: domain(tradesJson),
    whatsNew: whatsNewJson,
  } as unknown as WhatsNewPageData;
}

const use = (system: WhatsNewUse['system'], target: string, amount = 1, via?: string): WhatsNewUse => ({ system, target, amount, via });

describe('shared use helpers', () => {
  const info = (id: string) => ({ name: id, rarity: { a: 'rare', b: 'epic', c: 'rare' }[id] });
  const item = (id: string, verdict: WhatsNewNewItem['verdict']): WhatsNewNewItem => ({ id, group: 'material', verdict });

  it('sorts new items by verdict, rarity desc, name', () => {
    const sorted = sortNewItems([item('a', 'sell'), item('c', 'keep'), item('b', 'keep'), item('d', 'quest')], info);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('filters by verdict and group', () => {
    const list = [item('a', 'keep'), { ...item('b', 'sell'), group: 'key' as const }];
    expect(filterNewItems(list, 'sell', 'all').map((i) => i.id)).toEqual(['b']);
    expect(filterNewItems(list, 'all', 'key')).toHaveLength(1);
    expect(filterNewItems(list, 'keep', 'key')).toHaveLength(0);
  });

  it('groups by system order and collapses duplicate targets', () => {
    const uses = [use('craft', 'x'), use('outpostRoom', 'r', 2), use('craft', 'x'), use('craft', 'y')];
    expect(groupBySystem(uses).map((g) => g.system)).toEqual(['outpostRoom', 'craft']);
    const rows = collapseRows(groupBySystem(uses)[1].uses);
    expect(rows).toHaveLength(1);
    expect(rows[0].targets).toEqual(['x', 'y']);
    expect(capList([1, 2, 3], 2)).toEqual({ shown: [1, 2], more: 1 });
  });

  it('sorts existing items by impact then rarity', () => {
    const sorted = sortByImpact(
      [{ id: 'a', gained: [use('craft', 'x')] }, { id: 'b', gained: [use('craft', 'x')] }, { id: 'c', gained: [use('craft', 'x'), use('craft', 'y')] }],
      info,
    );
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('sections render', () => {
  const data = fakeData();
  const render = (el: React.ReactElement) => renderToStaticMarkup(<LocaleProvider>{el}</LocaleProvider>);

  it('renders the new items grid', () => {
    const out = render(<NewItemsSection data={data} variant="a" />);
    expect(out).toContain('id="new-items"');
    expect(out).toContain('wn-new-items__tile');
  });

  it('renders the old items list', () => {
    const out = render(<NewUsesSection data={data} variant="a" />);
    expect(out).toContain('id="new-uses"');
    expect(out).toContain('wn-new-uses__chip--gain');
  });
});
