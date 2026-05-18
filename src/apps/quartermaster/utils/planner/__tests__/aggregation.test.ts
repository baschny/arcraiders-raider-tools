import { describe, expect, it } from 'vitest';
import type { StoredList } from '../../../types/list';
import { aggregateRequired } from '../aggregation';

describe('quartermaster planner aggregation', () => {
  it('prioritizes generated hideout lists before user-authored lists', () => {
    const lists: StoredList[] = [
      {
        id: 'user',
        name: 'User List',
        type: 'user',
        isEnabled: true,
        items: [
          { itemId: 'metal_parts', quantity: 2, isEnabled: true },
        ],
      },
      {
        id: 'hideout_workbench_1',
        name: 'Workbench Unlock',
        type: 'hideout',
        isEnabled: true,
        items: [
          { itemId: 'metal_parts', quantity: 3, isEnabled: true },
        ],
      },
    ];

    const result = aggregateRequired(lists);

    expect(result.required.metal_parts).toBe(5);
    expect(result.targetPriority.metal_parts).toEqual({ listIndex: 0, itemIndex: 0 });
    expect(result.requiredSourcesByItemId.metal_parts.map(source => source.listId)).toEqual([
      'hideout_workbench_1',
      'user',
    ]);
  });

  it('ignores disabled hideout lists and items', () => {
    const lists: StoredList[] = [
      {
        id: 'hideout_workbench_1',
        name: 'Workbench Unlock',
        type: 'hideout',
        isEnabled: false,
        items: [
          { itemId: 'metal_parts', quantity: 3, isEnabled: true },
        ],
      },
      {
        id: 'hideout_refiner_1',
        name: 'Refiner Unlock',
        type: 'hideout',
        isEnabled: true,
        items: [
          { itemId: 'wires', quantity: 2, isEnabled: false },
        ],
      },
    ];

    const result = aggregateRequired(lists);

    expect(result.required).toEqual({});
    expect(result.targetPriority).toEqual({});
    expect(result.requiredSourcesByItemId).toEqual({});
  });
});
