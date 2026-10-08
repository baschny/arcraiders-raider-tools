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
import { buildObjectiveTree, buildQuests, mapNodeId } from '../buildQuests';

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
  it('drops hidden nodes, keeps choices and skips missing titles', () => {
    const { tree, leafTexts } = buildObjectiveTree(
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
          { key: '0.2', kind: 'sequence', oneRound: true, children: [] },
        ],
      },
      { '0.0.0': 'A', '0.0.1': 'B' },
    );
    expect(tree?.children).toHaveLength(1);
    expect(tree?.children[0].kind).toBe('anyOf');
    expect(tree?.children[0].text).toBeUndefined();
    expect(tree?.children[0].children.map((c) => c.leafIndex)).toEqual([0, 1]);
    expect(leafTexts).toEqual(['A', 'B']);
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

  it('shows main and side quests only, without hidden trigger quests', () => {
    const categories = new Set(quests.filter((q) => q.category !== 'map').map((q) => q.category));
    expect([...categories].sort()).toEqual(['main', 'side']);
    expect(byId.has('unlock_nomad_envoy_questgiver')).toBe(false);
  });

  it('turns map requirements into map prerequisite nodes with the legacy ids', () => {
    const quest = byId.get('picking_up_the_pieces')!;
    expect(quest.previousQuestIds).toContain(mapNodeId('dam-battleground'));
    expect(mapNodeId('dam-battleground')).toBe('map_dam_battleground');
    const mapNode = byId.get('map_dam_battleground')!;
    expect(mapNode.trader).toBe('Map');
    expect(mapNode.nextQuestIds).toContain('picking_up_the_pieces');
  });

  it('turns raid requirements into text and keeps edges to visible quests', () => {
    const quest = byId.get('a_first_foothold')!;
    expect(quest.otherRequirements).toEqual(['18 raids']);
    expect(quest.previousQuestIds).toContain('off_the_radar');
  });

  it('hides hidden objectives and exposes xp and rewards', () => {
    const quest = byId.get('picking_up_the_pieces')!;
    expect(quest.objectives).toEqual(['Visit any area on your map with a loot category icon']);
    expect(quest.xp).toBe(1000);
    expect(quest.rewardItems.map((r) => r.id)).toContain('rattler_iii');
  });
});
