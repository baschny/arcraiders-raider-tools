import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GameDataSchemaError,
  loadDomain,
  nameOf,
  resetGameDataCache,
  resolveSlug,
} from '../loader';
import { GAME_DATA_SCHEMA_VERSION } from '../types';

function mockFetch(files: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      if (!(url in files)) return { ok: false, status: 404, statusText: 'Not Found' };
      return { ok: true, json: async () => files[url] };
    }),
  );
  return calls;
}

const items = {
  schemaVersion: GAME_DATA_SCHEMA_VERSION,
  gameVersion: '2.0',
  generatedFrom: 'abc',
  aliases: { old_anvil: 'anvil_i' },
  items: { anvil_i: { id: 'anvil_i', nameEn: 'Anvil I' } },
};

describe('gamedata loader', () => {
  afterEach(() => {
    resetGameDataCache();
    vi.unstubAllGlobals();
  });

  it('merges structure and locale text, caching the structure across locales', async () => {
    const calls = mockFetch({
      '/data/game/items.json': items,
      '/data/game/items.text.de.json': { anvil_i: { name: 'Amboss I' } },
      '/data/game/items.text.en.json': { anvil_i: { name: 'Anvil I' } },
    });
    const de = await loadDomain('items', 'de');
    expect(nameOf(de, 'anvil_i')).toBe('Amboss I');
    const en = await loadDomain('items', 'en');
    expect(nameOf(en, 'anvil_i')).toBe('Anvil I');
    expect(calls.filter((c) => c === '/data/game/items.json')).toHaveLength(1);
  });

  it('falls back to English text when a locale file is missing', async () => {
    mockFetch({
      '/data/game/items.json': items,
      '/data/game/items.text.en.json': { anvil_i: { name: 'Anvil I' } },
    });
    const ja = await loadDomain('items', 'ja');
    expect(nameOf(ja, 'anvil_i')).toBe('Anvil I');
  });

  it('rejects files with another schemaVersion', async () => {
    mockFetch({ '/data/game/items.json': { ...items, schemaVersion: 1 } });
    await expect(loadDomain('items', 'en')).rejects.toBeInstanceOf(GameDataSchemaError);
  });

  it('does not fetch text for text-less domains', async () => {
    const calls = mockFetch({
      '/data/game/recipes.json': { schemaVersion: GAME_DATA_SCHEMA_VERSION, gameVersion: null, generatedFrom: null, recipes: {} },
    });
    const loaded = await loadDomain('recipes', 'de');
    expect(loaded.text).toEqual({});
    expect(calls).toEqual(['/data/game/recipes.json']);
  });

  it('resolves aliases and falls back to the English name', () => {
    expect(resolveSlug(items, 'old_anvil')).toBe('anvil_i');
    expect(resolveSlug(items, 'anvil_i')).toBe('anvil_i');
    expect(nameOf({ text: {} }, 'x', 'X')).toBe('X');
  });
});
