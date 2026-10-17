import { describe, expect, it } from 'vitest';
import type { ItemCatalog } from '../../../../shared/gamedata/catalog';
import { buildCatalogItem, emptyClassification } from '../../../../shared/gamedata/catalog';
import type { LoadedDomain } from '../../../../shared/gamedata/types';
import questsStructure from '../../../../../public/data/game/quests.json';
import questsText from '../../../../../public/data/game/quests.text.en.json';
import mapsStructure from '../../../../../public/data/game/maps.json';
import mapsText from '../../../../../public/data/game/maps.text.en.json';
import itemsStructure from '../../../../../public/data/game/items.json';
import itemsText from '../../../../../public/data/game/items.text.en.json';
import { buildObjectiveTree, buildQuests } from '../buildQuests';

const files = {
  quests: { structure: questsStructure, text: questsText },
  maps: { structure: mapsStructure, text: mapsText },
  items: { structure: itemsStructure, text: itemsText },
};

function load<D extends 'quests' | 'maps' | 'items'>(domain: D): LoadedDomain<D> {
  return { ...files[domain], locale: 'en' } as unknown as LoadedDomain<D>;
}

function catalog(): ItemCatalog {
  const items = load('items');
  return {
    items: Object.fromEntries(
      Object.values(items.structure.items).map((i) => [i.id, buildCatalogItem(i, items.text[i.id], {})]),
    ),
    recipes: {},
    research: {},
    arctrackerAliases: {},
    aliases: {},
    classification: emptyClassification(),
  };
}

describe('buildObjectiveTree', () => {
  const resolve = {
    mapName: (id: string) => `Map ${id}`,
    item: (itemId: string, quantity: number) => ({ id: itemId, quantity, name: itemId, imageFilename: '' }),
  };

  it('keeps hidden nodes, lists every leaf key in tree order and splices nested sequences', () => {
    const { tree, leafTexts, leafKeys } = buildObjectiveTree(
      {
        key: '0',
        kind: 'sequence',
        children: [
          {
            key: '0.0',
            kind: 'anyOf',
            children: [
              { key: '0.0.0', kind: 'atomic', action: { type: 'Interact', amount: 1 } },
              { key: '0.0.1', kind: 'atomic', action: { type: 'Interact', amount: 1 } },
            ],
          },
          { key: '0.1', kind: 'atomic', hidden: true, action: { type: 'Interact', amount: 1 } },
          {
            key: '0.2',
            kind: 'sequence',
            hidden: true,
            children: [{ key: '0.2.0', kind: 'atomic', action: { type: 'Photo', amount: 1, mapIds: ['dam'] } }],
          },
          { key: '0.3', kind: 'sequence', oneRound: true, children: [] },
        ],
      },
      { '0.0.0': 'A', '0.0.1': 'B', '0.1': 'C', '0.2.0': 'D' },
      resolve,
    );
    expect(leafKeys).toEqual(['0.0.0', '0.0.1', '0.1', '0.2.0']);
    expect(leafTexts).toEqual(['A', 'B', 'C', 'D']);
    expect(tree?.children.map((c) => c.key)).toEqual(['0.0', '0.1', '0.2.0']);
    const [choice, hidden, photo] = tree!.children;
    expect(choice.kind).toBe('anyOf');
    expect(hidden.hidden).toBe(true);
    // The single-child hidden sequence collapses onto its leaf and passes its flag on.
    expect(photo).toMatchObject({ hidden: true, actionType: 'Photo', mapNames: ['Map dam'] });
    expect(photo.items).toEqual([expect.objectContaining({ id: 'basic_camera', role: 'bring' })]);
  });

  it('adds the interaction prompt, hold time and items of a step', () => {
    const { tree } = buildObjectiveTree(
      {
        key: '0',
        kind: 'atomic',
        action: {
          type: 'Interact',
          amount: 1,
          interaction: { holdSeconds: 2, requiredItems: [{ itemId: 'wires', quantity: 5 }, { itemId: 'key', quantity: 1, consumed: false }] },
        },
      },
      { '0': 'Repair the panels' },
      resolve,
      { '0': 'Repair' },
    );
    expect(tree).toMatchObject({ prompt: 'Repair', holdSeconds: 2 });
    expect(tree?.items?.map((i) => [i.id, i.quantity, i.role])).toEqual([
      ['wires', 5, 'consumed'],
      ['key', 1, 'kept'],
    ]);
  });
});

describe('buildQuests (real data)', () => {
  const quests = buildQuests({
    quests: load('quests'),
    maps: load('maps'),
    catalog: catalog(),
    traderNames: { shani: 'Shani' },
    locale: 'en',
  });
  const byId = new Map(quests.map((q) => [q.id, q]));

  it('shows main and side quests plus the unlock nodes they depend on', () => {
    const categories = new Set(quests.filter((q) => q.category !== 'unlock').map((q) => q.category));
    expect([...categories].sort()).toEqual(['main', 'side']);
    expect(byId.get('unlock_nomad_envoy_questgiver')?.unlock).toEqual({ kind: 'level', label: 'Reach player level 25' });
    expect(byId.has('map_dam_battleground')).toBe(false);
    expect(byId.get('picking_up_the_pieces')!.previousQuestIds).toEqual([]);
  });

  it('chains unlock nodes and labels them by kind, never by their internal name', () => {
    const nomads = byId.get('the_first_nomads')!;
    expect(nomads.previousQuestIds).toEqual(['the_first_nomads_unlock']);
    const bunker = byId.get('the_first_nomads_unlock')!;
    expect(bunker.category).toBe('unlock');
    expect(bunker.unlock).toMatchObject({ kind: 'location', label: 'Enter Bunker Interior' });
    expect(bunker.previousQuestIds).toEqual(['blue_gate_content_unlock']);
    const rounds = byId.get('blue_gate_content_unlock')!;
    expect(rounds.name).toBe('Play 18 rounds');
    expect(rounds.nextQuestIds).toEqual(expect.arrayContaining(['a_first_foothold', 'the_first_nomads_unlock']));
    expect(byId.get('queens_pve_quest_unlock')!.unlock?.label).toBe('Damage a Queen or Matriarch');
    expect(byId.get('nothing_ventured')!.previousQuestIds).toEqual(['queens_pve_quest_unlock']);
  });

  it('keeps unlock edges instead of raid texts', () => {
    const quest = byId.get('a_first_foothold')!;
    expect(quest.otherRequirements).toEqual([]);
    expect(quest.previousQuestIds).toEqual(expect.arrayContaining(['blue_gate_content_unlock', 'off_the_radar']));
  });

  it('keeps hidden objectives and exposes xp and rewards', () => {
    const quest = byId.get('picking_up_the_pieces')!;
    expect(quest.objectives[0]).toBe('Visit any area on your map with a loot category icon');
    expect(quest.objectives).toHaveLength(quest.objectiveLeafKeys.length);
    expect(quest.xp).toBe(1000);
    expect(quest.rewardItems.map((r) => r.id)).toContain('rattler_iii');
  });

  it('shows the items a hidden Interact step needs', () => {
    const quest = byId.get('after_rain_comes')!;
    const repair = quest.objectiveTree!.children[1];
    expect(repair.hidden).toBe(true);
    expect(repair.prompt).toBe('Repair');
    expect(repair.items?.map((i) => [i.id, i.quantity, i.role])).toEqual([
      ['battery', 2, 'consumed'],
      ['wires', 5, 'consumed'],
    ]);
  });
});
