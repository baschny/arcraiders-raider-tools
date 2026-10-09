import { describe, expect, it } from 'vitest';
import { localizePath, splitLocalePath } from '../localeCodes';

describe('locale URL prefixes', () => {
  it('prefixes every language but English', () => {
    expect(localizePath('/quests', 'en')).toBe('/quests');
    expect(localizePath('/quests', 'de')).toBe('/de/quests');
    expect(localizePath('/', 'pt-BR')).toBe('/pt-BR');
  });

  it('splits the prefix off a URL path', () => {
    expect(splitLocalePath('/de/quests/')).toEqual({ locale: 'de', path: '/quests/', nonCanonical: false });
    expect(splitLocalePath('/zh-TW')).toEqual({ locale: 'zh-TW', path: '/', nonCanonical: false });
    expect(splitLocalePath('/quests')).toEqual({ locale: null, path: '/quests', nonCanonical: false });
    expect(splitLocalePath('/')).toEqual({ locale: null, path: '/', nonCanonical: false });
  });

  it('recognizes a prefix written another way', () => {
    expect(splitLocalePath('/pt-br/maps')).toEqual({ locale: 'pt-BR', path: '/maps', nonCanonical: true });
    expect(splitLocalePath('/en/maps')).toEqual({ locale: null, path: '/maps', nonCanonical: true });
  });

  it('does not take a route for a prefix', () => {
    expect(splitLocalePath('/dexter').locale).toBeNull();
    expect(splitLocalePath('/maps/de').locale).toBeNull();
  });
});
