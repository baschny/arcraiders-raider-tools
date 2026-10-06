import { describe, expect, it } from 'vitest';
import { hasLootItem, lootItemsFor } from '../scoring';
import { checkSchemaVersion, MAP_SCHEMA_VERSION, MapSchemaError } from '../schema';
import type { LootItem, MapIndex } from '../types';

const item = (name: string, asset: string, slug?: string): LootItem => ({ name, asset, slug, conditions: {} });

const index = {
  schemaVersion: MAP_SCHEMA_VERSION,
  manifest: '1',
  gameVersion: null,
  built: '2026-10-06T00:00:00Z',
  maps: [],
  items: [
    item('Burnt-out Candles', 'DA_Item_Salvage_Trinket_BurntoutCandles', 'burnt_out_candles'),
    item('"Wind Sprite" Ship Model', 'DA_Item_Salvage_Trinket_BoatModel_A'),
    item('"Wind Sprite" Ship Model', 'DA_Item_Salvage_Trinket_BoatModel_A_02', 'wind_sprite_ship_model'),
    item('Colorful Shoes', 'DA_Item_Salvage_ColorfulShoes_Red', 'colorful_shoes_red'),
    item('Colorful Shoes', 'DA_Item_Salvage_ColorfulShoes_Green', 'colorful_shoes_green'),
  ],
  tables: {},
  enemies: [],
  enemyTables: {},
  containerConditions: {},
  quests: [],
} satisfies MapIndex;

describe('lootItemsFor', () => {
  it('joins by slug, whatever the names', () => {
    expect(lootItemsFor(index, 'burnt_out_candles', 'Burnt-Out Candles')).toEqual([0]);
    expect(lootItemsFor(index, 'colorful_shoes_green', 'Colorful Shoes (Green)')).toEqual([4]);
  });

  it('adds loot items without a slug by English name', () => {
    expect(lootItemsFor(index, 'wind_sprite_ship_model', '"Wind Sprite" Ship Model')).toEqual([1, 2]);
  });

  it('matches names ignoring case and surrounding spaces', () => {
    expect(lootItemsFor(index, 'wind_sprite', ' "WIND SPRITE" ship model ')).toEqual([1]);
  });

  it('does not match slugged loot items by name', () => {
    expect(lootItemsFor(index, 'colorful_shoes', 'Colorful Shoes')).toEqual([]);
    expect(hasLootItem(index, 'colorful_shoes', 'Colorful Shoes')).toBe(false);
    expect(hasLootItem(index, 'colorful_shoes_red', 'Colorful Shoes (Red)')).toBe(true);
  });
});

describe('checkSchemaVersion', () => {
  it('accepts the supported version', () => {
    expect(checkSchemaVersion(index)).toBe(index);
  });

  it('rejects unknown or missing versions with MapSchemaError', () => {
    expect(() => checkSchemaVersion({ ...index, schemaVersion: MAP_SCHEMA_VERSION + 1 })).toThrow(MapSchemaError);
    const old: Partial<MapIndex> = { ...index };
    delete old.schemaVersion;
    expect(() => checkSchemaVersion(old as MapIndex)).toThrow(MapSchemaError);
  });
});
