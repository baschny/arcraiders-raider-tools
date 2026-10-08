import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadAllItems,
  loadHideoutDefinitions,
  loadProjectDefinitions,
  loadQuestData,
} from '../dataLoader';
import { resetGameDataCache } from '../../../../shared/gamedata/loader';
import { resetItemCatalog } from '../../../../shared/gamedata/catalog';
import { generateHideoutLists } from '../hideoutLists';
import { BENCH_ORDER, type ItemsMap } from '../../types/item';
import type { HideoutModuleDefinition } from '../../types/hideout';
import type { ProjectDefinition } from '../../types/project';
import type { QuestDefinition } from '../../types/quest';
import type { QuartermasterState } from '../../../../shared/state/stores';
import { stubGameDataFetch } from './gameDataFetch';
import * as dataLoader from '../dataLoader';

describe('quartermaster v2 data loader', () => {
  let items: ItemsMap;
  let hideout: HideoutModuleDefinition[];
  let projects: ProjectDefinition[];
  let quests: QuestDefinition[];

  beforeAll(async () => {
    stubGameDataFetch();
    items = await loadAllItems('en');
    hideout = await loadHideoutDefinitions('en');
    projects = await loadProjectDefinitions('en');
    quests = (await loadQuestData('en')).definitions;
  });
  afterAll(() => {
    resetGameDataCache();
    resetItemCatalog();
  });

  it('derives valid bench ids from the benches domain', () => {
    expect([...dataLoader.VALID_BENCH_IDS]).toEqual(
      expect.arrayContaining(['refiner', 'weapon_bench', 'workbench', 'research_station']),
    );
    const benchesInUse = new Set(Object.values(items).map((i) => i.craftBench).filter(Boolean));
    for (const b of benchesInUse) {
      expect(dataLoader.VALID_BENCH_IDS.has(b!)).toBe(true);
      expect(BENCH_ORDER).toContain(b);
    }
    expect(items.bandage?.craftBench).toBe('med_station');
    expect(Object.values(items).some((i) => i.type === 'Blueprint')).toBe(false);
  });

  it('maps hideout benches with costs, icons and level gates', () => {
    const rs = hideout.find((m) => m.id === 'research_station');
    expect(rs).toBeDefined();
    expect(rs!.maxLevel).toBe(4);
    expect(rs!.levels[0].image).toBe('/images/benches/research_station-tier1.webp');
    expect(rs!.levels[0].requirementItemIds.length).toBeGreaterThan(0);
    expect(rs!.levels[1].requires).toEqual([{ kind: 'outpostLevel', id: '2' }]);
    expect(hideout.find((m) => m.id === 'refiner')!.levels[0].requirementItemIds).toContainEqual({
      itemId: 'metal_parts',
      quantity: 60,
    });
    expect(hideout.some((m) => m.id === 'workbench')).toBe(false);
  });

  it('generates hideout lists for the research station without crashing', () => {
    const lists = generateHideoutLists(
      hideout,
      { modules: [{ moduleId: 'research_station', currentLevel: 1, maxLevel: 4 }], syncedAt: '', cachedAt: 0 },
      { listEnabled: {}, itemEnabled: {} },
      { formatListName: (n, l) => `${n} ${l}`, compareText: (a, b) => a.localeCompare(b) },
    );
    expect(lists.some((l) => l.id === 'hideout_research_station_2')).toBe(true);
  });

  it('flattens project steps with 1-based indices and keeps non-item goals', () => {
    const trophy = projects.find((p) => p.id === 'trophy_display_project')!;
    expect(trophy.phases.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
    expect(trophy.phases[0].name).toBe('Roaming Threats');
    expect(trophy.phases[0].requirementItemIds).toContainEqual({ itemId: 'pop_trigger', quantity: 15 });
    const exp = projects.find((p) => p.id === 'expedition_project')!;
    expect(exp.phases).toHaveLength(6);
    expect(exp.phases[4].requirementItemIds).toEqual([]);
    expect(exp.phases[4].otherGoals?.[0]).toMatchObject({ goalType: 'value', required: true });
    expect(exp.phases[5].otherGoals?.[0]).toMatchObject({ goalType: 'complete_quests' });
    expect(projects.some((p) => p.id === 'community_event')).toBe(false);
  });

  it('derives quest required items from deliver objectives', () => {
    const q = quests.find((x) => x.id === 'belly_of_the_beast')!;
    expect(q.requiredItems).toContainEqual({ itemId: 'wires', quantity: 1 });
    expect(q.previousQuestIds.length + q.nextQuestIds.length).toBeGreaterThan(0);
  });

  // Realistic persisted quartermaster state written by the 1.x app (ids are plain slugs).
  it('resolves every id of a persisted 1.x state fixture', () => {
    const state: QuartermasterState = {
      lists: [
        {
          id: 'list_1', name: 'Anvil IV', type: 'user', isEnabled: true,
          items: [
            { itemId: 'anvil_iv', quantity: 1, isEnabled: true },
            { itemId: 'metal_parts', quantity: 40, isEnabled: true },
          ],
        },
        {
          id: 'hideout_refiner_2', name: 'Refiner to Level 2', type: 'hideout', isEnabled: true,
          items: [{ itemId: 'metal_parts', quantity: 5, isEnabled: false }],
        },
      ],
      hideoutToggles: {
        listEnabled: { 'refiner:2': true, 'weapon_bench:3': false },
        itemEnabled: { 'refiner:1:metal_parts': true },
      },
      projectToggles: {
        listEnabled: { 'trophy_display_project:2': true },
        itemEnabled: { 'trophy_display_project:1:pop_trigger': true, 'expedition_project:1:metal_parts': false },
      },
      questToggles: { listEnabled: {}, itemEnabled: {} },
      prioritizedItemIds: ['anvil_iv', 'silencer_ii'],
      weaponBuilds: [
        {
          id: 'b1', name: 'Silent Anvil', weaponItemId: 'anvil_iv',
          slots: { muzzle: 'silencer_ii', special: null },
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      projectView: { collapsedProjectIds: ['expedition_project_s1'] },
    };

    for (const list of state.lists) for (const i of list.items) expect(items[i.itemId], i.itemId).toBeDefined();
    for (const id of state.prioritizedItemIds) expect(items[id], id).toBeDefined();
    for (const key of [...Object.keys(state.hideoutToggles.listEnabled), ...Object.keys(state.hideoutToggles.itemEnabled)]) {
      const [moduleId, level, itemId] = key.split(':');
      const mod = hideout.find((m) => m.id === moduleId);
      const lvl = mod?.levels.find((l) => l.level === Number(level));
      expect(lvl, key).toBeDefined();
      if (itemId) expect(lvl!.requirementItemIds.map((r) => r.itemId), key).toContain(itemId);
    }
    for (const key of [...Object.keys(state.projectToggles.listEnabled), ...Object.keys(state.projectToggles.itemEnabled)]) {
      const [projectId, step, itemId] = key.split(':');
      const project = projects.find((p) => p.id === projectId);
      const s = project?.phases.find((p) => p.index === Number(step));
      expect(s, key).toBeDefined();
      if (itemId) expect(s!.requirementItemIds.map((r) => r.itemId), key).toContain(itemId);
    }
    for (const id of state.projectView!.collapsedProjectIds) expect(projects.some((p) => p.id === id), id).toBe(true);
    for (const build of state.weaponBuilds) {
      const weapon = items[build.weaponItemId];
      expect(weapon.weaponBaseId).toBe('anvil_i');
      for (const [slot, mod] of Object.entries(build.slots)) {
        if (mod) expect(weapon.modSlots?.[slot], slot).toContain(mod);
      }
    }
  });
});
