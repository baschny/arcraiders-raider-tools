import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { FieldCraftingSection } from '../FieldCraftingSection';
import { buildFieldCraftingData, groupRecipesBySkill, normalizeSkillId } from '../field-crafting/data';

import skilltreeJson from '../../../../../public/data/game/skilltree.json';
import skilltreeText from '../../../../../public/data/game/skilltree.text.en.json';
import whatsNewJson from '../../../../../public/data/game/whats-new.json';
import itemsJson from '../../../../../public/data/game/items.json';

function fakeData(): WhatsNewPageData {
  const items = itemsJson.items as unknown as Record<string, { id: string; nameEn: string; icon: string }>;
  const catalogItems = Object.fromEntries(Object.values(items).map((i) => [i.id, { ...i, name: i.nameEn }]));
  return {
    catalog: { items: catalogItems, aliases: {} },
    skilltree: { structure: skilltreeJson, text: skilltreeText, locale: 'en' } as unknown as LoadedDomain<'skilltree'>,
    whatsNew: whatsNewJson,
  } as unknown as WhatsNewPageData;
}

describe('field crafting grouping', () => {
  it('files a recipe under its most specific skill', () => {
    const recipes = [
      { skills: ['nomadic', 'base'] },
      { skills: ['nomadic', 'base'] },
      { skills: ['tinkerer', 'base'] },
      { skills: ['base'] },
    ];
    const counts = new Map([['nomadic', 2], ['tinkerer', 1], ['base', 4]]);
    const groups = groupRecipesBySkill(recipes, counts, new Set(['nomadic']));
    expect([...groups.keys()].sort()).toEqual(['base', 'nomadic', 'tinkerer']);
    expect(groups.get('nomadic')).toHaveLength(2);
    expect(groups.get('base')).toHaveLength(1);
  });

  it('normalizes old skill ids', () => {
    expect(normalizeSkillId('in_round_crafting_characterskill_unlockfieldcraft')).toBe('in_round_crafting');
    expect(normalizeSkillId('nomadic_crafting')).toBe('nomadic_crafting');
  });

  it('builds the real data', () => {
    const fc = buildFieldCraftingData(fakeData());
    expect(fc.before.map((s) => s.id).sort()).toEqual(['in_round_crafting', 'traveling_tinkerer']);
    expect(fc.after.filter((s) => s.isNew).map((s) => s.name)).toEqual(['Nomadic Crafting']);
    expect(fc.added[0].skill.id).toBe('nomadic_crafting');
    expect(fc.addedCount).toBe(10);
    expect(fc.unchangedCount).toBe(17);
  });

  it.each(['a', 'b'] as const)('renders variant %s', (variant) => {
    const out = renderToStaticMarkup(
      <LocaleProvider>
        <FieldCraftingSection data={fakeData()} variant={variant} />
      </LocaleProvider>,
    );
    expect(out).toContain('id="field-crafting"');
    expect(out).toContain('Nomadic Crafting');
  });
});
