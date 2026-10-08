import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextCollector } from '../text';
import { prune, writeDomain } from '../writer';

describe('TextCollector', () => {
  it('builds per-locale text with English fallback and nested fields', () => {
    const t = new TextCollector();
    t.add('quests', 'q1', 'name', { key: 'k', en: 'Quest', de: 'Auftrag' } as never);
    t.add('quests', 'q1', 'objectives.0.1', { key: 'k2', en: 'Find it', de: '' } as never);
    t.add('quests', 'q1', 'description', null);
    expect(t.build('quests', 'de')).toEqual({ q1: { name: 'Auftrag', objectives: { '0': { '1': 'Find it' } } } });
    expect(t.en('quests', 'q1')).toBe('Quest');
  });
});

describe('writer', () => {
  it('prunes empty optional fields', () => {
    expect(prune({ a: [], b: {}, c: undefined, d: 0, e: '', f: [{ g: [] }] })).toEqual({ d: 0, e: '', f: [{}] });
  });

  it('writes the envelope, sorts records by slug and reports budget overruns', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-'));
    const text = new TextCollector();
    text.add('maps', 'b', 'name', 'B');
    const res = writeDomain(
      'maps',
      { maps: { b: { id: 'b', nameEn: 'B' }, a: { id: 'a', nameEn: 'A' } }, eventTypes: {} },
      text,
      { gameVersion: '2.0', generatedFrom: 'abc', aliases: { old: 'a' } },
      dir,
    );
    const structure = JSON.parse(fs.readFileSync(path.join(dir, 'maps.json'), 'utf8'));
    expect(structure).toEqual({
      schemaVersion: 2,
      gameVersion: '2.0',
      generatedFrom: 'abc',
      aliases: { old: 'a' },
      maps: { a: { id: 'a', nameEn: 'A' }, b: { id: 'b', nameEn: 'B' } },
    });
    expect(Object.keys(structure.maps)).toEqual(['a', 'b']);
    expect(res.files).toContain('maps.text.zh-TW.json');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'maps.text.ja.json'), 'utf8'))).toEqual({ b: { name: 'B' } });
    expect(res.overBudget).toEqual([]);
  });
});
