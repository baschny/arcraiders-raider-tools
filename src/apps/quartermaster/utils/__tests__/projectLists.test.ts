/**
 * Project behavior tests
 * Verify: no-cache → no lists, Embark remaining quantities, submit-available restriction,
 * project toggle cleanup, date filtering
 */

import { describe, it, expect } from 'vitest';
import { generateProjectLists } from '../../utils/projectLists';
import { cleanupObsoleteProjectToggles } from '../../utils/projectStorage';
import type { ProjectDefinition } from '../../types/project';
import type { CachedProjects } from '../../../../shared/types/arctracker';

const makeStep = (index: number, goals: Array<{ itemId: string; required: number; remaining: number }>) => {
  const goalObjs = goals.map((g) => ({
    goalAssetId: index * 100 + goals.indexOf(g),
    itemId: g.itemId,
    required: g.required,
    submitted: g.required - g.remaining,
    remaining: g.remaining,
    completed: g.remaining === 0,
  }));
  return {
    name: `Step ${index}`,
    index,
    completed: goalObjs.every((g) => g.completed),
    goals: goalObjs,
  };
};

const formatListName = (_projectName: string, stepIndex: number, stepName: string) =>
  `${_projectName}: Step ${stepIndex} (${stepName})`;
const compareText = (a: string, b: string) => a.localeCompare(b);

const def1: ProjectDefinition = {
  id: 'test_project',
  name: 'Test Project',
  phases: [
    {
      name: 'Phase One',
      index: 1,
      requirementItemIds: [
        { itemId: 'item_a', quantity: 10 },
        { itemId: 'item_b', quantity: 5 },
      ],
    },
    {
      name: 'Phase Two',
      index: 2,
      requirementItemIds: [
        { itemId: 'item_c', quantity: 3 },
      ],
    },
  ],
};

describe('projectLists', () => {
  const defaultToggleState = { listEnabled: {}, itemEnabled: {} };

  it('returns empty when cachedProjects is null', () => {
    const result = generateProjectLists(
      [def1],
      null,
      defaultToggleState,
      { formatListName, compareText },
    );
    expect(result).toHaveLength(0);
  });

  it('generates lists when cached progress exists', () => {
    const cached: CachedProjects = {
      projects: [{
        projectId: 'test_project',
        projectName: 'Test Project',
        completed: false,
        steps: [
          makeStep(1, [
            { itemId: 'item_a', required: 10, remaining: 10 },
            { itemId: 'item_b', required: 5, remaining: 5 },
          ]),
          makeStep(2, [
            { itemId: 'item_c', required: 3, remaining: 3 },
          ]),
        ],
        syncedAt: '2026-01-01T00:00:00Z',
        cachedAt: 1000,
      }],
      syncedAt: '2026-01-01T00:00:00Z',
      cachedAt: 1000,
    };

    const result = generateProjectLists(
      [def1],
      cached,
      defaultToggleState,
      { formatListName, compareText },
    );
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('project');
    expect(result[0].id).toBe('project_test_project_1');
    expect(result[1].id).toBe('project_test_project_2');
  });

  it('uses Embark remaining quantities instead of static full quantities', () => {
    const cached: CachedProjects = {
      projects: [{
        projectId: 'test_project',
        projectName: 'Test Project',
        completed: false,
        steps: [
          makeStep(1, [
            { itemId: 'item_a', required: 10, remaining: 4 },
            { itemId: 'item_b', required: 5, remaining: 0 },
          ]),
          makeStep(2, [
            { itemId: 'item_c', required: 3, remaining: 3 },
          ]),
        ],
        syncedAt: '2026-01-01T00:00:00Z',
        cachedAt: 1000,
      }],
      syncedAt: '2026-01-01T00:00:00Z',
      cachedAt: 1000,
    };

    const result = generateProjectLists(
      [def1],
      cached,
      defaultToggleState,
      { formatListName, compareText },
    );

    expect(result).toHaveLength(2);
    const step1 = result[0];
    const itemA = step1.items.find((i) => i.itemId === 'item_a');
    const itemB = step1.items.find((i) => i.itemId === 'item_b');
    expect(itemA?.quantity).toBe(4);
    expect(itemB?.quantity).toBe(0);
  });

  it('completes step when all goals have remaining: 0', () => {
    const step1 = makeStep(1, [
      { itemId: 'item_a', required: 10, remaining: 0 },
      { itemId: 'item_b', required: 5, remaining: 0 },
    ]);
    const cached: CachedProjects = {
      projects: [{
        projectId: 'test_project',
        projectName: 'Test Project',
        completed: false,
        steps: [step1,
          makeStep(2, [
            { itemId: 'item_c', required: 3, remaining: 3 },
          ]),
        ],
        syncedAt: '2026-01-01T00:00:00Z',
        cachedAt: 1000,
      }],
      syncedAt: '2026-01-01T00:00:00Z',
      cachedAt: 1000,
    };
    const result = generateProjectLists(
      [def1],
      cached,
      defaultToggleState,
      { formatListName, compareText },
    );

    expect(result).toHaveLength(2);
    // Incomplete steps sort before complete steps
    expect(result[0].isEnabled).toBe(true);
    expect(result[1].isEnabled).toBe(false);
  });

  it('filters out expired projects (endDate in the past)', () => {
    const expiredDef: ProjectDefinition = {
      ...def1,
      endDate: 1000, // Very old timestamp
    };

    const cached: CachedProjects = {
      projects: [{
        projectId: 'test_project',
        projectName: 'Test Project',
        completed: false,
        steps: [
          makeStep(1, [
            { itemId: 'item_a', required: 10, remaining: 10 },
          ]),
        ],
        syncedAt: '2026-01-01T00:00:00Z',
        cachedAt: 1000,
      }],
      syncedAt: '2026-01-01T00:00:00Z',
      cachedAt: 1000,
    };

    const result = generateProjectLists(
      [expiredDef],
      cached,
      defaultToggleState,
      { formatListName, compareText },
    );
    expect(result).toHaveLength(0);
  });

  it('includes projects with future endDate', () => {
    const futureDef: ProjectDefinition = {
      id: 'test_project',
      name: 'Test Project',
      endDate: Math.floor(Date.now() / 1000) + 86400 * 365,
      phases: [
        {
          name: 'Phase One',
          index: 1,
          requirementItemIds: [
            { itemId: 'item_a', quantity: 10 },
          ],
        },
      ],
    };

    const cached: CachedProjects = {
      projects: [{
        projectId: 'test_project',
        projectName: 'Test Project',
        completed: false,
        steps: [
          makeStep(1, [
            { itemId: 'item_a', required: 10, remaining: 10 },
          ]),
        ],
        syncedAt: '2026-01-01T00:00:00Z',
        cachedAt: 1000,
      }],
      syncedAt: '2026-01-01T00:00:00Z',
      cachedAt: 1000,
    };

    const result = generateProjectLists(
      [futureDef],
      cached,
      defaultToggleState,
      { formatListName, compareText },
    );
    expect(result).toHaveLength(1);
  });

  it('includes projects with no endDate', () => {
    const cached: CachedProjects = {
      projects: [{
        projectId: 'test_project',
        projectName: 'Test Project',
        completed: false,
        steps: [
          makeStep(1, [
            { itemId: 'item_a', required: 10, remaining: 10 },
          ]),
        ],
        syncedAt: '2026-01-01T00:00:00Z',
        cachedAt: 1000,
      }],
      syncedAt: '2026-01-01T00:00:00Z',
      cachedAt: 1000,
    };

    const result = generateProjectLists(
      [def1],
      cached,
      defaultToggleState,
      { formatListName, compareText },
    );
    expect(result).toHaveLength(2);
  });

  it('skips projects not present in cached progress (no-fallback)', () => {
    const def2: ProjectDefinition = {
      id: 'other_project',
      name: 'Other Project',
      phases: [
        {
          name: 'Phase A',
          index: 1,
          requirementItemIds: [
            { itemId: 'item_x', quantity: 5 },
          ],
        },
      ],
    };

    // cached progress has test_project but NOT other_project
    const cached: CachedProjects = {
      projects: [{
        projectId: 'test_project',
        projectName: 'Test Project',
        completed: false,
        steps: [
          makeStep(1, [
            { itemId: 'item_a', required: 10, remaining: 10 },
          ]),
        ],
        syncedAt: '2026-01-01T00:00:00Z',
        cachedAt: 1000,
      }],
      syncedAt: '2026-01-01T00:00:00Z',
      cachedAt: 1000,
    };

    const result = generateProjectLists(
      [def1, def2],
      cached,
      defaultToggleState,
      { formatListName, compareText },
    );

    // Only def1 (test_project) should produce lists; def2 should be skipped
    expect(result).toHaveLength(2); // def1 has 2 phases
    expect(result.every((l) => l.id.startsWith('project_test_project_'))).toBe(true);
  });
});

describe('projectStorage', () => {
  it('cleanupObsoleteProjectToggles removes completed step keys', () => {
    const toggles = {
      listEnabled: {
        'test_project:1': true,
        'test_project:2': false,
        'test_project:3': true,
      },
      itemEnabled: {
        'test_project:1:item_a': true,
        'test_project:2:item_c': false,
        'test_project:3:item_d': true,
      },
    };

    const cached: CachedProjects = {
      projects: [{
        projectId: 'test_project',
        projectName: 'Test Project',
        completed: false,
        steps: [
          makeStep(1, [{ itemId: 'item_a', required: 10, remaining: 0 }]),
          makeStep(2, [{ itemId: 'item_c', required: 3, remaining: 3 }]),
          makeStep(3, [{ itemId: 'item_d', required: 5, remaining: 5 }]),
        ],
        syncedAt: '2026-01-01T00:00:00Z',
        cachedAt: 1000,
      }],
      syncedAt: '2026-01-01T00:00:00Z',
      cachedAt: 1000,
    };

    const cleaned = cleanupObsoleteProjectToggles(cached, toggles);

    // Step 1 is completed — should be removed
    expect(cleaned.listEnabled['test_project:1']).toBeUndefined();
    expect(cleaned.itemEnabled['test_project:1:item_a']).toBeUndefined();

    // Steps 2 and 3 are not completed — should be preserved
    expect(cleaned.listEnabled['test_project:2']).toBe(false);
    expect(cleaned.listEnabled['test_project:3']).toBe(true);
    expect(cleaned.itemEnabled['test_project:2:item_c']).toBe(false);
    expect(cleaned.itemEnabled['test_project:3:item_d']).toBe(true);
  });
});
