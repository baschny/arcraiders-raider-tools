import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain, WhatsNewChanges } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { ChangesSection } from '../ChangesSection';
import { anvilTier, buildAnvilRows, buildStashTiers, groupRecycling, orderTraders } from '../changes/data';

import whatsNewJson from '../../../../../public/data/game/whats-new.json';
import tradesJson from '../../../../../public/data/game/trades.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import benchesText from '../../../../../public/data/game/benches.text.en.json';
import itemsJson from '../../../../../public/data/game/items.json';

const domain = (structure: unknown, text: unknown = {}) => ({ structure, text, locale: 'en' }) as unknown as LoadedDomain<'trades'>;
const changes = (whatsNewJson as unknown as { versions: Record<string, { changes: WhatsNewChanges }> }).versions['frozen-trail'].changes;

function fakeData(): WhatsNewPageData {
  const items = itemsJson.items as unknown as Record<string, { id: string; nameEn: string; icon: string; rarity?: string }>;
  const catalogItems = Object.fromEntries(Object.values(items).map((i) => [i.id, { ...i, name: i.nameEn }]));
  return {
    catalog: { items: catalogItems, aliases: {} } as unknown as WhatsNewPageData['catalog'],
    trades: domain(tradesJson),
    benches: domain(benchesJson, benchesText),
    whatsNew: whatsNewJson,
  } as unknown as WhatsNewPageData;
}

describe('changes helpers', () => {
  it('detects Anvil tiers only', () => {
    expect(anvilTier('anvil_iii')).toBe(3);
    expect(anvilTier('anvil_splitter')).toBeNull();
  });

  it('collapses the Anvil chain into craft, upgrade and repair rows', () => {
    const rows = buildAnvilRows(changes);
    expect(rows.map((r) => `${r.kind}${r.fromTier ?? ''}-${r.tier}`)).toEqual([
      'craft-1', 'upgrade1-2', 'upgrade2-3', 'upgrade3-4', 'repair-1', 'repair-2', 'repair-3', 'repair-4',
    ]);
  });

  it('keeps Anvil tiers out of the plain recycling rows and detects non-uniform patterns', () => {
    const g = groupRecycling(changes);
    expect(g.anvil.map((a) => a.tier)).toEqual([1, 2, 3, 4]);
    expect(g.anvilUniform).toBe(false);
    expect(g.rows.map((r) => r.id)).toContain('anvil_splitter');
    expect(g.rows).toHaveLength(6);
    const same = { recycling: [1, 2].map((n) => ({ id: `anvil_${'i'.repeat(n)}`, before: [{ itemId: 'a', quantity: 1 }], after: [{ itemId: 'b', quantity: 1 }] })) };
    expect(groupRecycling(same).anvilUniform).toBe(true);
  });

  it('orders traders Celeste first', () => {
    const ordered = orderTraders(changes.traders).map((t) => t.npc);
    expect(ordered).toEqual(['celeste', 'shani', 'tian_wen', 'apollo', 'lance']);
  });

  it('marks stash tiers without a before as new', () => {
    const tiers = buildStashTiers(changes);
    expect(tiers).toHaveLength(11);
    expect(tiers.at(-1)?.isNew).toBe(true);
    expect(tiers[0].from).toBe(64);
  });
});

describe('ChangesSection', () => {
  it.each(['a', 'b'] as const)('renders variant %s', (variant) => {
    const out = renderToStaticMarkup(
      <LocaleProvider>
        <ChangesSection data={fakeData()} variant={variant} />
      </LocaleProvider>,
    );
    expect(out).toContain('id="changes"');
    expect(out).toContain('/images/trader/celeste.png');
    expect(out).toContain('wn-changes__tier--new');
    expect(out.indexOf('data-trader="celeste"')).toBeLessThan(out.indexOf('data-trader="shani"'));
  });
});
