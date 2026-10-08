import { describe, expect, it } from 'vitest';
import { hasLootItem, lootItemsFor } from '../scoring';
import { checkSchemaVersion, MAP_SCHEMA_VERSION, MapSchemaError } from '../schema';
import type { LootItem, MapIndex } from '../types';

const item = (name: string | undefined, slug: string): LootItem => ({ name, slug, conditions: {} });

const index = {
  schemaVersion: MAP_SCHEMA_VERSION,
  manifest: '1',
  gameVersion: null,
  built: '2026-10-06T00:00:00Z',
  maps: [],
  items: [
    item('Burnt-out Candles', 'burnt_out_candles'),
    // Two loot items of one raider-tools item (several assets).
    item('"Wind Sprite" Ship Model', 'wind_sprite_ship_model'),
    item('"Wind Sprite" Ship Model', 'wind_sprite_ship_model'),
    // No English name in the game files.
    item(undefined, 'colorful_shoes_red'),
  ],
  tables: {},
  enemies: [],
  enemyTables: {},
  containerConditions: {},
  quests: [],
} satisfies MapIndex;

describe('lootItemsFor', () => {
  it('joins by slug only, whatever the names', () => {
    expect(lootItemsFor(index, 'burnt_out_candles')).toEqual([0]);
    expect(lootItemsFor(index, 'colorful_shoes_red')).toEqual([3]);
  });

  it('returns every loot item of the raider-tools item', () => {
    expect(lootItemsFor(index, 'wind_sprite_ship_model')).toEqual([1, 2]);
  });

  it('does not join by English name', () => {
    expect(lootItemsFor(index, 'Burnt-out Candles')).toEqual([]);
    expect(lootItemsFor(index, 'burnt-out_candles')).toEqual([]);
    expect(hasLootItem(index, 'Wind Sprite Ship Model')).toBe(false);
  });

  it('reports whether an item is in static loot', () => {
    expect(hasLootItem(index, 'colorful_shoes_red')).toBe(true);
    expect(hasLootItem(index, 'colorful_shoes')).toBe(false);
  });
});

describe('checkSchemaVersion', () => {
  it('accepts the supported version', () => {
    expect(checkSchemaVersion(index)).toBe(index);
  });

  it('rejects unknown or missing versions with MapSchemaError', () => {
    expect(() => checkSchemaVersion({ ...index, schemaVersion: MAP_SCHEMA_VERSION + 1 })).toThrow(MapSchemaError);
    expect(() => checkSchemaVersion({ ...index, schemaVersion: 1 })).toThrow(MapSchemaError);
    const old: Partial<MapIndex> = { ...index };
    delete old.schemaVersion;
    expect(() => checkSchemaVersion(old as MapIndex)).toThrow(MapSchemaError);
  });
});
