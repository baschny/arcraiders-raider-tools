import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../../../../shared/context/LocaleContext';
import type { LoadedDomain, WhatsNewUse } from '../../../../shared/gamedata/types';
import type { WhatsNewPageData } from '../../hooks/useWhatsNewData';
import { PURPOSE_ORDER, buildPurposeGroups, purposeOfUse, selectionKey, type PurposeContext } from '../new-items/groups';
import { newItemSources, oldItemSources } from '../new-items/sources';
import { buildNewItemsModel, isInventoryItem, NEW_GROUP_ORDER } from '../new-items/model';
import { buildHover, createHoverContext } from '../new-items/hover';
import { NewItemsTab } from '../NewItemsTab';
import { OldItemsTab } from '../OldItemsTab';

import itemsJson from '../../../../../public/data/game/items.json';
import benchesJson from '../../../../../public/data/game/benches.json';
import tradesJson from '../../../../../public/data/game/trades.json';
import blueprintsJson from '../../../../../public/data/game/blueprints.json';
import whatsNewJson from '../../../../../public/data/game/whats-new.json';
import outpostJson from '../../../../../public/data/game/outpost.json';
import researchJson from '../../../../../public/data/game/research.json';
import questsJson from '../../../../../public/data/game/quests.json';
import projectsJson from '../../../../../public/data/game/projects.json';

const domain = (structure: unknown) => ({ structure, text: {}, locale: 'en' }) as unknown as LoadedDomain<'benches'>;

function fakeData(): WhatsNewPageData {
  const items = itemsJson.items as unknown as Record<string, { id: string; nameEn: string; icon: string; rarity?: string }>;
  const catalogItems = Object.fromEntries(Object.values(items).map((i) => [i.id, { ...i, name: i.nameEn }]));
  return {
    catalog: { items: catalogItems, aliases: {} } as unknown as WhatsNewPageData['catalog'],
    benches: domain(benchesJson),
    trades: domain(tradesJson),
    blueprints: domain(blueprintsJson),
    outpost: domain(outpostJson),
    research: domain(researchJson),
    quests: domain(questsJson),
    projects: domain(projectsJson),
    whatsNew: whatsNewJson,
  } as unknown as WhatsNewPageData;
}

const ctx: PurposeContext = { isAmplified: (slug) => slug.includes('amplified') };
const use = (system: WhatsNewUse['system'], target: WhatsNewUse['target'], amount = 1): WhatsNewUse => ({ system, target, amount });

describe('purposeOfUse', () => {
  it('maps systems to purposes', () => {
    expect(purposeOfUse(use('outpostRoom', 'chalet_room'), ctx)).toBe('outpost');
    expect(purposeOfUse(use('researchStation', { bench: 'research_station', level: 2 }), ctx)).toBe('researchStation');
    expect(purposeOfUse(use('benchUpgrade', { bench: 'research_station', level: 4 }), ctx)).toBe('researchStation');
    expect(purposeOfUse(use('benchUpgrade', { bench: 'weapon_bench', level: 4 }), ctx)).toBe('gunsmith4');
    expect(purposeOfUse(use('benchUpgrade', { stashSlots: 304 }), ctx)).toBeNull();
    expect(purposeOfUse(use('amplifyPerk', 'x_amplified_y'), ctx)).toBe('amplified');
    expect(purposeOfUse(use('repair', 'canto_amplified'), ctx)).toBe('amplified');
    expect(purposeOfUse(use('repair', 'grapple_hook'), ctx)).toBe('crafting');
    expect(purposeOfUse(use('research', 'bp'), ctx)).toBe('researchBlueprints');
    expect(purposeOfUse(use('fieldCraft', 'x'), ctx)).toBe('crafting');
    expect(purposeOfUse(use('project', 'p'), ctx)).toBe('quests');
    expect(purposeOfUse(use('trade', 'x'), ctx)).toBe('trades');
  });
});

describe('buildPurposeGroups', () => {
  it('puts an item in every group it has a use in, in spec order, hiding empty groups', () => {
    const groups = buildPurposeGroups(
      [
        { id: 'a', uses: [use('craft', 'x'), use('outpostFurniture', 'f'), use('outpostRoom', 'r')] },
        { id: 'b', uses: [use('craft', 'y')] },
      ],
      ctx,
    );
    expect(groups.map((g) => g.id)).toEqual(['outpost', 'furniture', 'crafting']);
    expect(groups[2].entries.map((e) => e.source.id)).toEqual(['a', 'b']);
    expect(groups[0].entries[0].uses).toHaveLength(1);
  });

  it('adds study items to Research Points and unused items to No use yet only when asked', () => {
    const sources = [{ id: 's', group: 'study' }, { id: 'n', uses: [] }, { id: 'q', uses: [use('benchUpgrade', { stashSlots: 1 })] }];
    expect(buildPurposeGroups(sources, ctx).map((g) => g.id)).toEqual(['researchPoints']);
    const withNoUse = buildPurposeGroups(sources, ctx, { includeNoUse: true });
    expect(withNoUse.map((g) => g.id)).toEqual(['researchPoints', 'noUse']);
    expect(withNoUse[1].entries.map((e) => e.source.id)).toEqual(['n', 'q']);
  });

  it('sorts items inside a group with the compare function', () => {
    const groups = buildPurposeGroups([{ id: 'b', uses: [use('craft', 'x')] }, { id: 'a', uses: [use('craft', 'x')] }], ctx, {
      compare: (x, y) => x.id.localeCompare(y.id),
    });
    expect(groups[0].entries.map((e) => e.source.id)).toEqual(['a', 'b']);
  });

  it('builds the real 2.0 groups', () => {
    const data = fakeData();
    const groups = buildPurposeGroups(newItemSources(data), { isAmplified: (s) => s.includes('amplified') }, { includeNoUse: true });
    const ids = groups.map((g) => g.id);
    expect(ids).toEqual(PURPOSE_ORDER.filter((id) => ids.includes(id)));
    expect(ids).toContain('noUse');
    expect(ids).toContain('researchPoints');
    const old = buildPurposeGroups(oldItemSources(data), { isAmplified: (s) => s.includes('amplified') });
    expect(old.map((g) => g.id)).not.toContain('noUse');
    expect(old.length).toBeGreaterThan(0);
  });

  it('builds selection keys per group and item', () => {
    expect(selectionKey('crafting', 'x')).toBe('crafting:x');
  });
});

const t = (key: string) => key;
const tm = (key: string, r: Record<string, string | number>) => `${key}:${JSON.stringify(r)}`;

function model() {
  const data = fakeData();
  const ctx = createHoverContext(data, t, tm);
  return { data, ctx, model: buildNewItemsModel(data, ctx) };
}

describe('inventory filter', () => {
  it('drops currency, research tokens and counters but keeps carried items', () => {
    const data = fakeData();
    expect(isInventoryItem(data, 'research_points')).toBe(false);
    expect(isInventoryItem(data, 'slug_rounds_research')).toBe(false);
    expect(isInventoryItem(data, 'outpost_rooms_installed')).toBe(false);
    expect(isInventoryItem(data, 'reward_pass_points')).toBe(false);
    expect(isInventoryItem(data, 'planks')).toBe(true);
    expect(isInventoryItem(data, 'banjo_blueprint')).toBe(true);
  });

  it('keeps them out of every group and card', () => {
    const { model: m } = model();
    const all = [...m.groups.flatMap((g) => g.entries.map((e) => e.id)), ...m.cards.flatMap((c) => c.items.map((i) => i.id))];
    for (const bad of ['research_points', 'slug_rounds_research', 'x_rounds_research', 'outpost_rooms_installed']) {
      expect(all).not.toContain(bad);
    }
  });
});

describe('new items model', () => {
  it('orders the groups as specified, hiding empty ones', () => {
    const { model: m } = model();
    const ids = m.groups.map((g) => g.id);
    expect(ids).toEqual(NEW_GROUP_ORDER.filter((id) => ids.includes(id)));
    for (const id of ['researchPoints', 'amplified', 'researchBlueprints', 'newGear', 'fallenEmperor', 'crafting', 'furnitureDecoration', 'stencils', 'keys']) {
      expect(ids).toContain(id);
    }
  });

  it('puts the one-time unlock cards first: outpost levels, station, Gunsmith (no quests)', () => {
    const { model: m } = model();
    const titles = m.cards.map((c) => c.id);
    expect(titles.slice(0, 3)).toEqual(['outpost-1', 'outpost-2', 'outpost-3']);
    expect(titles).toEqual(expect.arrayContaining(['station-1', 'station-2', 'station-3', 'station-4', 'gunsmith-4']));
    expect(m.cards.some((c) => c.quest)).toBe(false);
    const outpost1 = m.cards[0];
    expect(outpost1.items).toEqual([
      { id: 'steel_cable', amount: 3 },
      { id: 'sheet_metal', amount: 20 },
      { id: 'frozen_trail_mechanical_1', amount: 3 },
    ]);
    // quest items are not shown anywhere in this tab
    const shownIds = m.groups.flatMap((g) => g.entries.map((e) => e.id));
    for (const id of ['nomad_tech_item', 'unknown_arc_circuitry', 'broken_compass']) expect(shownIds).not.toContain(id);
  });

  it('has the curated Fallen Emperor group', () => {
    const { model: m } = model();
    const emperor = m.groups.find((g) => g.id === 'fallenEmperor')!.entries.map((e) => e.id);
    expect(emperor).toEqual([
      'emperor_beacon',
      'ruined_emperor_beacon',
      'emperor_gateway_conduit_blueprint',
      'arc_insulated_coupler',
      'arc_plated_coupler',
      'arc_conductive_coupler',
      'emperor_gateway_conduit',
    ]);
  });

  it('derives new weapons and gear from the catalog, each followed by its blueprint', () => {
    const { model: m } = model();
    const gear = m.groups.find((g) => g.id === 'newGear')!.entries.map((e) => e.id);
    for (const base of ['bantam_i', 'stiletto_i', 'banjo', 'harmonica', 'tether_gun', 'grapple_hook', 'yank_grenade', 'upgraded_detector']) {
      expect(gear).toContain(base);
    }
    expect(gear).not.toContain('bantam_ii');
    expect(gear.some((id) => id.includes('amplified'))).toBe(false);
    expect(gear).not.toContain('emperor_beacon');
    expect(gear[gear.indexOf('bantam_i') + 1]).toBe('bantam_blueprint');
    expect(gear[gear.indexOf('stiletto_i') + 1]).toBe('stiletto_blueprint');
    expect(gear[gear.indexOf('banjo') + 1]).toBe('banjo_blueprint');
  });

  it('adds decoration items and Pendola keys', () => {
    const { model: m } = model();
    const furniture = m.groups.find((g) => g.id === 'furnitureDecoration')!.entries.map((e) => e.id);
    for (const id of ['archive_desk_lamp', 'bureau_desk_lamp', 'desk_lamp', 'potted_plant', 'planks']) expect(furniture).toContain(id);
    const keys = m.groups.find((g) => g.id === 'keys')!.entries.map((e) => e.id);
    expect(keys).toHaveLength(4);
    expect(keys.every((k) => k.startsWith('pendola_pass_'))).toBe(true);
  });

  it('shows study items with Research Points and their other uses', () => {
    const { model: m } = model();
    const rp = m.groups.find((g) => g.id === 'researchPoints')!;
    expect(rp.entries.map((e) => e.id).sort()).toEqual(['battered_paperback', 'research_item_02', 'research_item_03', 'research_item_04', 'research_item_05']);
    expect(rp.entries.every((e) => String(e.amount).startsWith('+'))).toBe(true);
    const logbook = m.studyCallout.find((c) => c.id === 'research_item_02');
    expect(logbook?.rows.map((r) => r.label)).toContain('whatsNew.new-items.detail.level:{"bench":"Research Station","level":2}');
    expect(m.rpScale.min?.rp).toBe(500);
    expect(m.rpScale.median?.rp).toBe(2000);
    expect(m.rpScale.max?.rp).toBe(5000);
    expect(m.rpScale.topStudy?.item.name).toBe('Frigate Diagnostic Node');
  });

  it('researching blueprints excludes Research Points and study conversions', () => {
    const { model: m } = model();
    const ids = m.groups.find((g) => g.id === 'researchBlueprints')!.entries.map((e) => e.id);
    expect(ids).toContain('steel_cable');
    expect(ids).not.toContain('research_points');
    expect(ids).not.toContain('research_item_05');
  });

  it('leaves "No use yet" empty or minimal', () => {
    const { model: m } = model();
    const left = m.groups.find((g) => g.id === 'noUse')?.entries.map((e) => e.id) ?? [];
    if (left.length > 0) console.warn('No use yet is not empty:', left.join(', '));
    expect(left.length).toBeLessThanOrEqual(3);
  });

  it('gives every shown item a hover source', () => {
    const { model: m } = model();
    for (const g of m.groups) for (const e of g.entries) expect(m.sources.has(e.id)).toBe(true);
  });
});

describe('hover sections', () => {
  it('builds sections from all uses of the item', () => {
    const { data, ctx, model: m } = model();
    const steel = buildHover(ctx, m.sources.get('steel_cable')!);
    const keys = steel.sections.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['unlocks', 'craft', 'research']));
    const unlocks = steel.sections.find((s) => s.key === 'unlocks')!;
    expect(unlocks.rows).toHaveLength(1);
    expect(unlocks.rows[0].amount).toBe('3×');
    const research = steel.sections.find((s) => s.key === 'research')!;
    expect(research.rows.every((r) => r.isBlueprint)).toBe(true);
    expect(research.rows.some((r) => r.detail?.includes('researchDetail'))).toBe(true);

    const study = buildHover(ctx, m.sources.get('research_item_03')!);
    expect(study.sections.find((s) => s.key === 'gives')?.rows[0].amount).toMatch(/^\+\d+$/);

    const coupler = buildHover(ctx, m.sources.get('arc_conductive_coupler')!);
    expect(coupler.sections.find((s) => s.key === 'quests')?.rows.length).toBeGreaterThan(0);

    const planks = buildHover(ctx, m.sources.get('planks')!);
    expect(planks.sections.find((s) => s.key === 'furniture')!.rows.length).toBeLessThanOrEqual(6);
    expect(planks.sections.find((s) => s.key === 'furniture')!.more).toBeGreaterThan(0);

    const module = buildHover(ctx, m.sources.get('amplification_material_hairpin_kettle_rattler')!);
    expect(module.sections.map((s) => s.key)).toEqual(expect.arrayContaining(['amplified', 'recycles']));
    expect(data.catalog.items.planks).toBeDefined();
  });

  it('adds "No longer used for" for old items', () => {
    const data = fakeData();
    const ctx = createHoverContext(data, t, tm);
    const withLost = (data.whatsNew!.versions['frozen-trail'].existingItems ?? []).find((i) => (i.lost ?? []).length > 0);
    expect(withLost).toBeDefined();
    const hover = buildHover(ctx, { id: withLost!.id, uses: withLost!.gained, lost: withLost!.lost });
    expect(hover.sections.map((s) => s.key)).toContain('lost');
  });
});

describe('tabs', () => {
  it('render group headers, unlock cards and tiles with hover triggers', () => {
    const data = fakeData();
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LocaleProvider>
          <NewItemsTab data={data} />
          <OldItemsTab data={data} />
        </LocaleProvider>
      </MemoryRouter>,
    );
    expect(html).toContain('One-time unlocks');
    expect(html).toContain('Outpost level 1 to 2');
    expect(html).not.toContain('Pick one room');
    expect(html).toContain('Research Station build');
    expect(html).toContain('New weapons and gear');
    expect(html).toContain('Fallen Emperor');
    expect(html).toContain('Ruined Emperor Beacon');
    expect(html).toContain('Pendola Pass keys');
    expect(html).toContain('Furniture and decoration');
    expect(html).toContain('wn-hc-trigger');
    expect(html).toContain('wn-group__square');
    expect(html).toContain('--wn-accent');
    expect(html).toContain('/images/rarities/blueprint_bg.png');
    expect(html).toContain('Gunsmith level 4');
    expect(html).toContain('Researching blueprints');
    expect(html).not.toContain('wn-detail');
    expect(html).not.toContain('No use yet');
    expect(html).not.toContain('Keep');
  });

  it('lists the other uses of study items in the Research Points callout', () => {
    const data = fakeData();
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LocaleProvider>
          <NewItemsTab data={data} />
        </LocaleProvider>
      </MemoryRouter>,
    );
    expect(html).toContain('Several of these are also needed to build and upgrade the Research Station');
    expect(html).toContain('3× Raider Logbook for Research Station level 2');
    expect(html).toContain('Research plan cost 500–5,000 RP');
    expect(html).not.toContain('1 Frigate Diagnostic Node = 1,000 RP');
    expect(html).toContain('More about research in the Research tab');
    expect(html).toContain('Cheapest research plan');
  });
});
