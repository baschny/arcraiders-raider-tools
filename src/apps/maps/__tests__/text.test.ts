import { describe, expect, it } from 'vitest';
import { getTranslationValue } from '../../../shared/i18n/translations';
import { CATEGORIES, KINDS, type TimingRule } from '../data/kinds';
import { makeText } from '../text';

const t = (key: string) => getTranslationValue('en', key) ?? key;
const tm = (key: string, r: Record<string, string | number>) => Object.entries(r).reduce((v, [k, x]) => v.replaceAll(`{${k}}`, String(x)), t(key));
const formatNumber = (v: number, o?: Intl.NumberFormatOptions) => new Intl.NumberFormat('en', o).format(v);
const tx = makeText(t, tm, formatNumber, 'en');
const de = makeText(t, tm, (v, o) => new Intl.NumberFormat('de-DE', o).format(v), 'de-DE');
const isKey = (s: string) => /^(maps|lootHelper|shared|quartermaster)\.[\w.]+$/.test(s);

/** Source files of the maps app (tests excluded). */
const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/__tests__/**'], { query: '?raw', import: 'default', eager: true });

describe('en.json', () => {
  it('has every translation key the maps app uses literally', () => {
    const missing: string[] = [];
    expect(Object.keys(SOURCES).length).toBeGreaterThan(10);
    for (const [file, source] of Object.entries(SOURCES)) {
      for (const [, key] of source.matchAll(/['`]((?:maps|lootHelper|shared|quartermaster)\.[\w.]+)['`]/g)) {
        if (getTranslationValue('en', key) === undefined) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has the keys composed at run time', () => {
    const keys = [
      ...['major', 'majorLive', 'minor', 'minorLive'].map((k) => `maps.conditionBar.${k}`),
      ...['tapPin', 'tapUnpin', 'clickPin', 'clickUnpin'].map((k) => `maps.tooltip.${k}`),
      // plural pairs
      ...['maps.best.spots', 'maps.filters.count.spots', 'maps.filters.count.hits', 'maps.filters.count.noHits', 'maps.filters.count.expected',
        'maps.arc.expected', 'maps.tooltip.serverTables', 'maps.tooltip.groupSpots', 'maps.tooltip.groupSpawners'].flatMap((k) => [k, `${k}One`]),
    ];
    expect(keys.filter((k) => getTranslationValue('en', k) === undefined)).toEqual([]);
  });

  it('labels every category and kind', () => {
    expect(CATEGORIES.map((c) => tx.category(c.key)).filter(isKey)).toEqual([]);
    expect(KINDS.map((k) => tx.kind(k)).filter(isKey)).toEqual([]);
  });
});

describe('makeText', () => {
  it('labels container types, falling back to the raw tag part', () => {
    expect(tx.containerType('Industrial.Wrh')).toBe('Warehouse furniture');
    expect(tx.containerType('Industrial.RsrMachineM01')).toBe('Research machine');
    expect(tx.containerType('Security.Crate01')).toBe('Crate');
    expect(tx.containerType('Raider.MedicalBag')).toBe('Medical bag');
    expect(tx.containerType('Nature.Candleberries')).toBe('Candleberries');
    expect(tx.containerType('Weird.SomeThing02')).toBe('Some Thing 02');
  });

  it('labels a full socket tag', () => {
    expect(tx.containerTag('Industrial.Lockers.Door')).toBe('Industrial › Lockers › Door');
    expect(tx.containerTag('Tech.Computer01.Screen')).toBe('Technological › Computer 1 › Screen');
    expect(tx.containerTag('Nature.Lemon')).toBe('Nature › Lemon');
    expect(tx.containerTag('OldWorld.MuseumCrate_01.Lid_01')).toBe('Old World › Museum crate 1 › Lid_01');
  });

  it('names spawned classes by kind, else readably', () => {
    expect(tx.className('BP_SocketContainer_Raider_AmmoBox_01_Lid_A_Dynamic')).toBe('Ammo box');
    expect(tx.className('BP_Foo_Bar_C')).toBe('Foo Bar');
  });

  it('translates map layers, zones, item tags and reasons with fallbacks', () => {
    expect(tx.layer('Upper floor')).toBe('Upper floor');
    expect(tx.layer('Attic')).toBe('Attic');
    expect(tx.zone('dense')).toBe('Dense loot');
    expect(tx.itemTag('Tier.Mid')).toBe('Mid');
    expect(tx.itemTag('Rarity.01Common')).toBe('Common');
    expect(tx.conditionReason('on hiatus')).toBe('on hiatus');
    expect(tx.conditionReason('something new')).toBe('something new');
    expect(tx.location('OldWorld')).toBe('Old World');
  });

  it('words respawn rules', () => {
    const rules: TimingRule[] = [
      { t: 'noRespawn' }, { t: 'respawn', secs: 90 }, { t: 'randomDelay', min: 0, max: 30 }, { t: 'noDynamic' },
      { t: 'airDrop', secs: 45 }, { t: 'sneak', secs: -1, indoors: true }, { t: 'activates', meters: 120 },
    ];
    expect(rules.map(tx.timing)).toEqual([
      'does not respawn after destroyed', 'respawn 1.5 min after destroyed', '+ 0–30 s random delay', 'no dynamic respawn',
      'air drop 45 s after the group is destroyed', 'out-of-sight respawn after never (indoors)', 'activates within 120 m',
    ]);
  });

  it('picks singular and plural keys', () => {
    expect(tx.plural('maps.filters.count.spots', 1)).toBe('1 spot');
    expect(tx.plural('maps.filters.count.spots', 1200)).toBe('1,200 spots');
  });

  it('formats numbers in the site locale', () => {
    expect(tx.score(12.34)).toBe('12.3');
    expect(de.score(12.34)).toBe('12,3');
    expect(de.exp(2.25)).toBe('2,3');
    expect(de.pct(0.123, 1)).toMatch(/^12,3\s%$/);
    expect(tx.meters(12)).toBe('+1.2');
    expect(tx.meters(-5)).toBe('-0.5');
  });
});
