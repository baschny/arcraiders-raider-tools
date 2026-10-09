import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { OutpostTab } from '../OutpostTab';

import outpostJson from '../../../../../public/data/game/outpost.json';
import tradesJson from '../../../../../public/data/game/trades.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import benchesText from '../../../../../public/data/game/benches.text.en.json';
import itemsJson from '../../../../../public/data/game/items.json';

const domain = (structure: unknown, text: unknown = {}) => ({ structure, text, locale: 'en' }) as unknown as LoadedDomain<'outpost'>;

function fakeData(): WhatsNewPageData {
  const items = itemsJson.items as unknown as Record<string, { id: string; nameEn: string; icon: string }>;
  const catalogItems = Object.fromEntries(Object.values(items).map((i) => [i.id, { ...i, name: i.nameEn }]));
  return {
    catalog: { items: catalogItems, aliases: {} },
    outpost: domain(outpostJson),
    trades: domain(tradesJson),
    benches: domain(benchesJson, benchesText),
    whatsNew: null,
  } as unknown as WhatsNewPageData;
}

describe('OutpostTab', () => {
  const out = renderToStaticMarkup(
    <LocaleProvider>
      <OutpostTab data={fakeData()} />
    </LocaleProvider>,
  );

  it('renders one panel per expansion with three labelled columns', () => {
    expect(out).toContain('Level 1 to 2');
    expect(out).toContain('Level 3 to 4');
    expect((out.match(/wn-outpost__cols/g) ?? []).length).toBe(3);
    expect((out.match(/>Pick one room</g) ?? []).length).toBe(3);
    expect((out.match(/>Unlocks</g) ?? []).length).toBe(3);
    expect(out).toContain('Special option');
    expect(out).toMatch(/Research Station level 2/);
  });

  it('shows 4 slots, furniture and Celeste trades without placeholder', () => {
    expect((out.match(/wn-outpost__slot"|wn-outpost__slot /g) ?? []).length).toBe(4);
    expect(out).toContain('pieces of furniture');
    expect(out).toContain('/images/trader/celeste.png');
    expect((out.match(/wn-needs"/g) ?? []).length).toBe(3);
    expect(out).not.toContain('wn-placeholder');
    expect(out).not.toContain('data-has-whats-new');
  });
});
