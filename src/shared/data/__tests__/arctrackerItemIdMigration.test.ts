import { describe, expect, it } from 'vitest';
import { migrateArctrackerItemId, setArctrackerAliases } from '../arctrackerItemIdMigration';

describe('migrateArctrackerItemId', () => {
  it('translates arctracker ids through the generated alias table', () => {
    setArctrackerAliases({ arctracker_name: 'our_slug' });
    expect(migrateArctrackerItemId('arctracker_name')).toBe('our_slug');
    expect(migrateArctrackerItemId('anvil_i')).toBe('anvil_i');
    expect(migrateArctrackerItemId(null)).toBeNull();
  });
});
