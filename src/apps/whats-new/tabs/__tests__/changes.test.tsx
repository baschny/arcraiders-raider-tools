import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { WhatsNewChanges } from '../../../../shared/gamedata/types';
import type { ItemRef } from '../../components';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { ChangesTab } from '../ChangesTab';
import { buildRecipeRows, buildStashRows, priceText } from '../changes/build';

const refOf = (slug: string): ItemRef => ({ id: slug, name: slug.replace(/_/g, ' ') });
const fmt = (n: number) => n.toLocaleString('en-US');

const changes: WhatsNewChanges = {
  recipes: [
    { result: 'snap_hook', bench: { bench: 'utility_bench', level: 3 }, before: [{ itemId: 'rope', quantity: 3 }], after: [{ itemId: 'steel_cable', quantity: 2 }] },
    { result: 'anvil_i', bench: { bench: 'gunsmith', level: 1 }, before: [{ itemId: 'a', quantity: 1 }], after: [{ itemId: 'b', quantity: 1 }] },
  ],
  upgrades: [{ from: 'anvil_i', to: 'anvil_ii', before: [{ itemId: 'a', quantity: 1 }], after: [{ itemId: 'b', quantity: 2 }] }],
  repairs: [{ id: 'anvil_iii', before: [{ itemId: 'a', quantity: 1 }], after: [{ itemId: 'b', quantity: 1 }] }],
  recycling: [{ id: 'anvil_ii', after: [{ itemId: 'b', quantity: 2 }] }, { id: 'splitter', after: [{ itemId: 'b', quantity: 5 }] }],
  stash: [
    { from: 280, to: 304, after: [{ itemId: 'coins', quantity: 750000 }] },
    { from: 64, to: 88, before: [{ itemId: 'coins', quantity: 5000 }], after: [{ itemId: 'coins', quantity: 5000 }] },
    { from: 208, to: 232, before: [{ itemId: 'coins', quantity: 90000 }], after: [{ itemId: 'coins', quantity: 100000 }] },
  ],
  traders: [
    { npc: 'shani', added: [{ result: 'flare', cost: [{ itemId: 'coins', quantity: 15000 }] }], priceChanged: [{ result: 'fireworks_box', before: [{ itemId: 'cred', quantity: 60 }], after: [{ itemId: 'coins', quantity: 6000 }] }] },
    { npc: 'celeste', added: [{ result: 'steel_cable', cost: [{ itemId: 'assorted_seeds', quantity: 3 }] }], removed: [{ result: 'rope', cost: [{ itemId: 'coins', quantity: 100 }] }] },
  ],
};

describe('changes tab helpers', () => {
  it('formats prices with currency names', () => {
    expect(priceText([{ itemId: 'assorted_seeds', quantity: 3 }], refOf, fmt)).toBe('3 assorted seeds');
    expect(priceText([{ itemId: 'coins', quantity: 15000 }], refOf, fmt)).toBe('15,000 coins');
  });

  it('puts the Anvil chain after other recipes with tier tiles and labels', () => {
    const labels = { craft: 'Craft', upgrade: (a: string, b: string) => `Upgrade ${a} to ${b}`, repair: (t: string) => `Repair ${t}` };
    const { others, anvil } = buildRecipeRows(changes, refOf, labels);
    expect(others.map((r) => r.item.item.id)).toEqual(['snap_hook']);
    expect(anvil.map((r) => r.item.sublabel)).toEqual(['Craft', 'Upgrade I to II', 'Repair III']);
    expect(anvil[1].item.item.id).toBe('anvil_ii');
  });

  it('sorts stash tiers, marks new and unchanged', () => {
    const rows = buildStashRows(changes, refOf, fmt);
    expect(rows.map((r) => r.slots)).toEqual([88, 232, 304]);
    expect(rows.map((r) => r.isNew)).toEqual([false, false, true]);
    expect(rows.map((r) => r.changed)).toEqual([false, true, true]);
    expect(rows[1].now).toBe('100,000 coins');
  });
});

describe('ChangesTab', () => {
  it('renders the four blocks with the first trader selected', () => {
    const data = {
      catalog: { items: {}, aliases: {} },
      trades: undefined,
      whatsNew: { versions: { 'frozen-trail': { changes } } },
    } as unknown as WhatsNewPageData;
    const out = renderToStaticMarkup(
      <LocaleProvider>
        <MemoryRouter>
          <ChangesTab data={data} />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(out).toContain('Recipes');
    expect(out).toContain('Recycling');
    expect(out).toContain('wn-segmented');
    expect(out.indexOf('celeste')).toBeLessThan(out.indexOf('shani'));
    expect(out).toContain('No longer sold');
    expect(out).toContain('wn-stash__row--same');
    expect(out).toContain('wn-stash__new');
    expect(out).toContain('304 slots');
  });
});
