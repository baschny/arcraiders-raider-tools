import { describe, expect, it } from 'vitest';
import { createContext, type GenContext } from '../context';
import type { ArcData, CanonItem } from '../arcData';
import items from '../domains/items';
import classification, { parseRarityColors } from '../domains/classification';
import { shortCategory, shortGroup, shortTheme } from '../domains/classification-ids';
import type { ClassificationStructure, Item } from '../../../src/shared/gamedata/types';

const loc = (en: string, de = en) => ({ key: null, en, de });
const CAT = 'UI.ItemClassification.Category.';
const THEME = 'UI.ItemClassification.Theme.';
const GROUP = 'UI.Inventory.CategoryFilter.';

function canonItem(id: number, name: string, over: Record<string, unknown> = {}): CanonItem {
  return {
    id,
    kind: 'item',
    type: 'GameItem',
    internalName: `DA_${name}`,
    name: loc(name),
    description: null,
    sources: [],
    baseId: 0,
    quality: 0,
    maxStack: 1,
    stackable: false,
    unique: false,
    tags: [],
    groupIds: [],
    value: 10,
    recycle: { items: [], random: null },
    scrap: { items: [], random: null },
    repair: { cost: [], durability: 0 },
    slots: { discriminator: 'none' },
    upgrades: [],
    category: null,
    themes: [],
    rarity: null,
    tier: null,
    weightKg: null,
    effects: [],
    stashGroup: null,
    stashSubgroup: null,
    ...over,
  } as CanonItem;
}

const category = (tag: string, en: string, parent: string | null = null) => ({
  id: tag, kind: 'itemCategory', type: 'ItemCategory', name: loc(en, `${en} de`), parent, sources: [],
});

function fixtureCtx(list: CanonItem[], overlay: Record<string, unknown> = {}): GenContext {
  const files: Record<string, Record<string, unknown>> = {
    'item-categories': {
      [`${CAT}Utility`]: category(`${CAT}Utility`, 'Utility'),
      [`${CAT}Utility.Grenade`]: category(`${CAT}Utility.Grenade`, 'Quick Use', `${CAT}Utility`),
      [`${CAT}Misc.StudyItem`]: category(`${CAT}Misc.StudyItem`, 'Research Item'),
      [`${CAT}Recipe`]: category(`${CAT}Recipe`, 'Blueprint'),
      [`${THEME}OldWorld`]: category(`${THEME}OldWorld`, 'Old World'),
      [`${CAT}Unused`]: category(`${CAT}Unused`, 'Unused'),
    },
    'stash-groups': {
      [`${GROUP}All`]: { id: `${GROUP}All`, name: loc('All'), order: 1, subgroups: [] },
      [`${GROUP}Misc`]: { id: `${GROUP}Misc`, name: loc('Misc'), order: 10, subgroups: [{ id: `${CAT}Misc.StudyItem`, name: loc('Research Item') }, { id: `${CAT}Recipe`, name: loc('Blueprint') }] },
      [`${GROUP}Utilities`]: { id: `${GROUP}Utilities`, name: loc('Quick Use', 'Schnelleinsatz'), order: 7, subgroups: [{ id: `${CAT}Utility.Grenade`, name: loc('Grenades', 'Granaten') }] },
      [`${GROUP}Keys`]: { id: `${GROUP}Keys`, name: loc('Keys'), order: 8, subgroups: [] },
    },
    rarities: Object.fromEntries(
      ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Amplified'].map((n, i) => [String(i + 1), { id: i + 1, name: loc(n), color: ['#6C6C6C', '#26BF57', '#00A9F2', '#CC3099', '#FFC600', '#E88629'][i], sources: [] }]),
    ),
  };
  const arc = {
    constants: { currencies: {}, owners: {}, stash: {}, gameSettings: {} },
    items: new Map(list.map((i) => [i.id, i])),
    offers: new Map(),
    meta: {},
    file: (name: string) => new Map(Object.entries(files[name] ?? {})),
    json: (rel: string) => (rel === 'overlay/item-properties.json' ? { items: overlay } : null),
  } as unknown as ArcData;
  const slugs = {
    get: () => null,
    slugOf: () => null,
    getOrCreate: (_k: string, key: string | number, o: { name?: string | null }) => (o.name ?? String(key)).toLowerCase().replace(/\W+/g, '_'),
  };
  return createContext(arc, slugs as never);
}

const yank = () =>
  canonItem(1, 'Yank Grenade', {
    category: `${CAT}Utility.Grenade`,
    rarity: 2,
    weightKg: 0.35,
    stashGroup: `${GROUP}Utilities`,
    stashSubgroup: `${CAT}Utility.Grenade`,
    effects: [
      { title: loc('Radius'), format: loc('{0}m'), value: 8.5, showSign: false, positive: true },
      { title: loc('Noise'), format: loc('{0}%'), value: 5, showSign: true, positive: false },
    ],
  });
const handbook = () =>
  canonItem(2, 'Exodus Technical Handbook', {
    category: `${CAT}Misc.StudyItem`,
    themes: [`${THEME}OldWorld`],
    rarity: 3,
    weightKg: 0.5,
    stashGroup: `${GROUP}Misc`,
    stashSubgroup: `${CAT}Misc.StudyItem`,
  });
const module6 = () => canonItem(3, 'Amplification Module', { category: `${CAT}Misc.StudyItem`, rarity: 6, stashGroup: `${GROUP}Misc`, stashSubgroup: `${CAT}Misc.StudyItem` });
const blueprint = () => canonItem(4, 'Thing Blueprint', { category: `${CAT}Recipe`, stashGroup: `${GROUP}Misc`, stashSubgroup: `${CAT}Recipe` });

function run(list: CanonItem[], overlay: Record<string, unknown> = {}) {
  const ctx = fixtureCtx(list, overlay);
  ctx.results.items = items.build(ctx);
  ctx.results.classification = classification.build(ctx) as never;
  return { ctx, items: (ctx.results.items as { items: Record<string, Item> }).items, cls: ctx.results.classification as unknown as ClassificationStructure };
}

describe('short ids', () => {
  it('strips the game tag prefixes', () => {
    expect(shortCategory(`${CAT}Utility.Grenade`)).toBe('Utility.Grenade');
    expect(shortCategory('UI.ItemClassification.SpecialThing')).toBe('SpecialThing');
    expect(shortTheme(`${THEME}OldWorld`)).toBe('OldWorld');
    expect(shortGroup(`${GROUP}Furniture.Seating`)).toBe('Furniture.Seating');
  });
});

describe('items domain: game classification', () => {
  it('reads category, group, subgroup, rarity, weight, themes and effects from the canonical item', () => {
    const { items: out, ctx } = run([yank(), handbook(), module6(), blueprint()]);
    expect(out.yank_grenade).toMatchObject({
      category: 'Utility.Grenade',
      group: 'Utilities',
      subgroup: 'Utility.Grenade',
      rarity: 'Uncommon',
      weightKg: 0.35,
      effects: [{ value: 8.5 }, { value: 5, showSign: true, positive: false }],
    });
    expect(out.exodus_technical_handbook).toMatchObject({ category: 'Misc.StudyItem', group: 'Misc', rarity: 'Rare', foundIn: ['OldWorld'] });
    expect(out.amplification_module.rarity).toBe('Amplified');
    // no rarity from the game = no rarity on the site (no 'Common' default)
    expect('rarity' in out.thing_blueprint).toBe(false);
    expect('type' in out.yank_grenade).toBe(false);
    expect(ctx.report.count('itemsWithDefaultProperties')).toBe(0);
    const en = ctx.text.build('items', 'de').yank_grenade as { effects: Record<string, { title: string; format: string }> };
    expect(en.effects['0']).toEqual({ title: 'Radius', format: '{0}m' });
  });

  it('ignores type/rarity/weight/foundIn/modSlots of the overlay but keeps questItem and fallback effects', () => {
    const noEffects = canonItem(5, 'Shield', { category: `${CAT}Utility`, rarity: 4 });
    const { items: out, ctx } = run([noEffects, yank()], {
      '5': { type: 'Trinket', rarity: 'Common', weightKg: 99, foundIn: ['ARC'], questItem: true, modSlots: { grip: ['g'] }, effects: { Durability: { value: '100/100', label: loc('Durability') }, Flag: { value: '', label: loc('Flag') } } },
      '1': { effects: { Ignored: { value: 1, label: loc('Ignored') } } },
    });
    expect(out.shield.modSlots).toBeUndefined();
    expect(out.shield).toMatchObject({ rarity: 'Epic', questItem: true, effects: [{ valueText: '100/100' }, {}] });
    expect(out.shield.weightKg).toBeUndefined();
    expect(out.shield.foundIn).toBeUndefined();
    expect(ctx.text.build('items', 'en').shield).toMatchObject({ effects: { '0': { title: 'Durability' }, '1': { title: 'Flag' } } });
    // game effects win over overlay effects
    expect(out.yank_grenade.effects).toHaveLength(2);
  });

  it('reports shipped items without category per canonical type', () => {
    const { ctx } = run([yank(), canonItem(9, 'Mystery'), canonItem(10, 'Room', { type: 'OutpostRoom' })]);
    expect(ctx.report.sections.get('itemsWithoutCategory')).toEqual(['1 GameItem', '1 OutpostRoom']);
  });

  it('reports unknown rarity levels', () => {
    const { ctx, items: out } = run([canonItem(7, 'Odd', { rarity: 9 })]);
    expect(out.odd.rarity).toBeUndefined();
    expect(ctx.report.count('unknownRarityLevel')).toBe(1);
  });
});

describe('classification domain', () => {
  it('builds rarities, groups in game order (without All, unused skipped) and categories with ancestors', () => {
    const { cls } = run([yank(), handbook(), module6(), blueprint()]);
    expect(cls.rarities.Amplified).toEqual({ level: 6, color: '#E88629' });
    expect(cls.rarities.Common).toEqual({ level: 1, color: '#6C6C6C' });
    expect(cls.groups).toEqual([
      { id: 'Utilities', order: 7, subgroups: ['Utility.Grenade'] },
      { id: 'Misc', order: 10, subgroups: ['Misc.StudyItem', 'Recipe'] },
    ]);
    expect(cls.categories).toEqual({
      'Utility.Grenade': { parent: 'Utility' },
      Utility: {},
      'Misc.StudyItem': {},
      Recipe: {},
      OldWorld: {},
    });
  });

  it('collects texts for rarities, groups, subgroups, categories and themes (dots kept in keys)', () => {
    const { ctx } = run([yank(), handbook(), blueprint()]);
    const de = ctx.text.build('classification', 'de');
    expect(de.rarities).toMatchObject({ Common: 'Common', Amplified: 'Amplified' });
    expect(de.groups).toEqual({ Utilities: 'Schnelleinsatz', Misc: 'Misc' });
    expect(de.subgroups['Utility.Grenade' as never]).toBe('Granaten');
    expect(de.categories).toMatchObject({ 'Utility.Grenade': 'Quick Use de', 'Misc.StudyItem': 'Research Item de', Recipe: 'Blueprint de' });
    expect(de.themes).toEqual({ OldWorld: 'Old World de' });
  });

  it('parses the rarity colors of the shared SCSS variables', () => {
    expect(parseRarityColors('$rarity-common: #6c6c6c;\n$rarity-amplified: #E88629;\n$rarity-legendary-border: #fff000;')).toEqual({ Common: '#6C6C6C', Amplified: '#E88629' });
  });
});

describe('items domain: mod slots from the game', () => {
  const MS = 'Online.Item.ModSlot.Firearm.';
  it('maps game slots to site keys, resolves mod slugs, merges muzzle variants and keeps -1 slots', () => {
    const mod = (id: number, name: string) => canonItem(id, name, { category: `${CAT}Recipe` });
    const gun = canonItem(10, 'Gun', {
      modSlots: [
        { slot: `${MS}Muzzle`, unlocksAtQuality: 0, mods: [11] },
        { slot: `${MS}Muzzle.Shotgun`, unlocksAtQuality: 0, mods: [12] },
        { slot: `${MS}UnderBarrel`, unlocksAtQuality: -1, mods: [13, 999] },
        { slot: `${MS}Magazine.Medium`, unlocksAtQuality: 0, mods: [14] },
      ],
    });
    const { items: out } = run([gun, mod(11, 'Silencer'), mod(12, 'Choke'), mod(13, 'Grip'), mod(14, 'Mag')]);
    expect(out.gun.modSlots).toEqual({ grip: ['grip'], magazine: ['mag'], muzzle: ['choke', 'silencer'] });
    expect(Object.keys(out.gun.modSlots!)).toEqual(['grip', 'magazine', 'muzzle']);
    expect(out.silencer.modSlots).toBeUndefined();
  });

  it('ignores overlay modSlots', () => {
    const { items: out } = run([canonItem(20, 'Old Gun')], { 20: { modSlots: { muzzle: ['x'] } } });
    expect(out.old_gun.modSlots).toBeUndefined();
  });
});
