import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { CraftingTab } from '../CraftingTab';
import { buildGatewayCard } from '../crafting/gateway';

import skilltreeJson from '../../../../../public/data/game/skilltree.json';
import skilltreeText from '../../../../../public/data/game/skilltree.text.en.json';
import whatsNewJson from '../../../../../public/data/game/whats-new.json';
import itemsJson from '../../../../../public/data/game/items.json';
import stencilsJson from '../../../../../public/data/game/stencils.json';
import recipesJson from '../../../../../public/data/game/recipes.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import benchesText from '../../../../../public/data/game/benches.text.en.json';

function fakeData(): WhatsNewPageData {
  const items = itemsJson.items as unknown as Record<string, { id: string; nameEn: string; icon: string }>;
  const catalogItems = Object.fromEntries(Object.values(items).map((i) => [i.id, { ...i, name: i.nameEn }]));
  return {
    catalog: { items: catalogItems, aliases: {} },
    skilltree: { structure: skilltreeJson, text: skilltreeText, locale: 'en' } as unknown as LoadedDomain<'skilltree'>,
    stencils: { structure: stencilsJson, text: {}, locale: 'en' } as unknown as LoadedDomain<'stencils'>,
    recipes: { structure: recipesJson, text: {}, locale: 'en' } as unknown as LoadedDomain<'recipes'>,
    benches: { structure: benchesJson, text: benchesText, locale: 'en' } as unknown as LoadedDomain<'benches'>,
    whatsNew: whatsNewJson,
  } as unknown as WhatsNewPageData;
}

describe('crafting tab', () => {
  it('builds the Emperor Gateway card with bench, couplers and blueprint', () => {
    const card = buildGatewayCard(fakeData());
    expect(card).not.toBeNull();
    expect(card!.result.item.id).toBe('emperor_gateway_conduit');
    expect(card!.needs).toHaveLength(3);
    expect(card!.where?.label).toBeTruthy();
    expect(card!.alsoNeeds).toHaveLength(1);
    expect(card!.alsoNeeds![0].isBlueprint).toBe(true);
  });

  it('renders the three panels', () => {
    const out = renderToStaticMarkup(
      <LocaleProvider>
        <CraftingTab data={fakeData()} />
      </LocaleProvider>,
    );
    expect(out).not.toContain('data-has-whats-new');
    expect(out.match(/wn-panel__title/g)).toHaveLength(3);
    expect(out).toContain('Nomadic Crafting');
    expect(out).toContain('Before 2.0');
    expect(out).toContain('17 recipes unchanged');
    expect(out).toContain('2 Stencil Parts');
    expect(out).toContain('15 Stencil Parts');
    expect(out.match(/wn-stencil-tile__swatch/g)).toHaveLength(14);
    expect(out).toContain('Emperor Gateway Conduit');
  });
});
