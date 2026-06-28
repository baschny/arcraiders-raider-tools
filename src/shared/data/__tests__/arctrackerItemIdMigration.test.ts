import { describe, expect, it } from 'vitest';

import {
  fixCdnItemUrl,
  migrateArctrackerItemId,
} from '../arctrackerItemIdMigration';

describe('ArcTracker item ID migration', () => {
  it('keeps generic item migration separate from weapon blueprint matching', () => {
    expect(migrateArctrackerItemId('hullcracker')).toBe('hullcracker');
    expect(fixCdnItemUrl('https://cdn.arctracker.io/items/v2/hullcracker_i.png'))
      .toBe('https://cdn.arctracker.io/items/v2/hullcracker_i.png');
  });
});
