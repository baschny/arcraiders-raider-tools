import { describe, expect, it } from 'vitest';
import type { ArcData, CanonRecord } from '../arcData';
import { Report, type GenContext } from '../context';
import { TextCollector } from '../text';
import { buildMaps, legacyEventTypes, type OverlayEventType } from '../domains/maps';
import { buildSkilltree } from '../domains/skilltree';

const loc = (en: string) => ({ key: null, en }) as never;

function makeCtx(files: Record<string, Record<string, unknown>>, overlay: Record<string, OverlayEventType> | null, slugTable: Record<string, Record<string, { slug: string; name?: string }>> = {}): GenContext {
  const created: Record<string, string> = {};
  const arc = {
    file: (n: string) => new Map(Object.entries(files[n] ?? {})) as Map<string, CanonRecord>,
    json: () => overlay,
  } as unknown as ArcData;
  const slugs = {
    table: (k: string) => slugTable[k] ?? {},
    get: (k: string, key: string) => slugTable[k]?.[key] ?? null,
    slugOf: (k: string, key: string) => slugTable[k]?.[key]?.slug ?? created[`${k}:${key}`] ?? null,
    getOrCreate: (k: string, key: string, o: { name?: string | null }) => (created[`${k}:${key}`] ??= String(o.name ?? '').toLowerCase().replace(/\W+/g, '_')),
  };
  const report = new Report();
  return {
    arc,
    slugs,
    report,
    text: new TextCollector(),
    slugFor: (k: string, key: string | number, rec?: CanonRecord | null) =>
      rec?.name?.en ? slugs.getOrCreate(k, String(key), { name: rec.name.en }) : null,
  } as unknown as GenContext;
}

const node = (id: number, name: string | null, extra: Record<string, unknown> = {}) => ({
  id, kind: 'skillNode', name: name ? loc(name) : null, category: 'Survival', root: false,
  parentNodeIds: [], childNodeIds: [], requireAllParents: false, maxLevel: 1, minTotalInvestment: 0, ...extra,
});

describe('skilltree', () => {
  it('ships nothing and reports when nodes are unnamed', () => {
    const ctx = makeCtx({ 'skill-trees': { 1: node(1, 'Alpha'), 2: node(2, null) } }, null);
    expect(buildSkilltree(ctx)).toEqual({ nodes: {}, groups: {} });
    expect(ctx.report.count('skilltreeIncomplete')).toBe(1);
  });

  it('builds nodes, roots and groups by slug when all are named', () => {
    const ctx = makeCtx(
      {
        'skill-trees': {
          1: node(1, 'Alpha', { root: true, childNodeIds: [2, 3] }),
          2: node(2, 'Beta', { parentNodeIds: [1] }),
          3: node(3, 'Gamma', { parentNodeIds: [1], maxLevel: 5 }),
          9: { id: 9, kind: 'skillGroup', maxSelectable: 1, minTotalInvestmentOverridePerUnlock: [10], nodeIds: [3, 2] },
        },
      },
      null,
    );
    const out = buildSkilltree(ctx);
    expect(out.nodes.alpha).toMatchObject({ root: true, children: ['beta', 'gamma'], nameEn: 'Alpha' });
    expect(out.nodes.beta.root).toBeUndefined();
    expect(out.nodes.gamma.maxLevel).toBe(5);
    expect(out.groups).toEqual({ group_beta: { id: 'group_beta', nodes: ['gamma', 'beta'], maxSelectable: 1, minTotalInvestmentOverridePerUnlock: [10] } });
    expect(ctx.text.en('skilltree', 'beta')).toBe('Beta');
  });
});

describe('maps', () => {
  const scen = (gameMode: string, active = true) => ({ gameMode, active, visible: true, disabled: false });
  const overlay: Record<string, OverlayEventType> = {
    'cold-snap': { name: { en: 'Cold Snap', de: 'Kälteeinbruch' }, icon: 'i.png', category: 'major', translationKey: 'coldSnap' },
    matriarch: { name: { en: 'Matriarch' }, icon: 'm.png', category: 'minor', translationKey: 'matriarch' },
  };
  const files = {
    maps: {
      '1': { id: 1, kind: 'map', mapName: 'A', name: loc('Alpha Map'), scenarios: [scen('Salvage')] },
      '2': { id: 2, kind: 'map', mapName: 'B', name: null, scenarios: [scen('Salvage')] },
      '3': { id: 3, kind: 'map', mapName: 'Practice', name: loc('Practice'), scenarios: [scen('PracticeRangeArray')] },
      '4': { id: 4, kind: 'map', mapName: 'Quest only', name: loc('Quest Map'), scenarios: [scen('X', false)] },
    },
    quests: { q: { id: 'q', mapIds: [4] } },
  };
  const table = { maps: { 1: { slug: 'alpha-map' }, 2: { slug: 'b-map', name: 'Label B' }, 3: { slug: 'practice' }, 4: { slug: 'quest-map' }, 99: { slug: 'old-dup' } } };

  it('ships live or quest-referenced maps with existing slugs and skips the rest', () => {
    const ctx = makeCtx(files, overlay, table);
    const { structure } = buildMaps(ctx);
    expect(Object.keys(structure.maps).sort()).toEqual(['alpha-map', 'b-map', 'quest-map']);
    expect(structure.maps['b-map'].nameEn).toBe('Label B');
    const skipped = ctx.report.sections.get('skippedMaps')!;
    expect(skipped.some((s) => s.startsWith('3 '))).toBe(true);
    expect(skipped.some((s) => s.startsWith('99 '))).toBe(true);
    expect(skipped).toHaveLength(2);
  });

  it('builds event types with major flag and text', () => {
    const ctx = makeCtx(files, overlay, table);
    const { structure } = buildMaps(ctx);
    expect(structure.eventTypes['cold-snap']).toEqual({ id: 'cold-snap', nameEn: 'Cold Snap', icon: 'i.png', major: true });
    expect(structure.eventTypes.matriarch.major).toBeUndefined();
    expect(ctx.text.build('maps', 'de')['cold-snap']).toEqual({ name: 'Kälteeinbruch' });
  });

  it('reproduces the legacy event-types.json shape', () => {
    const legacy = legacyEventTypes(overlay, 'src') as { eventTypes: Record<string, unknown> };
    expect(legacy.eventTypes['cold-snap']).toEqual({
      displayName: 'Cold Snap', icon: 'i.png', translationKey: 'coldSnap', category: 'major',
      localizations: { en: 'Cold Snap', de: 'Kälteeinbruch' },
    });
  });

  it('rejects an event id that collides with a map slug', () => {
    const ctx = makeCtx(files, { 'alpha-map': { name: { en: 'X' } } }, table);
    expect(() => buildMaps(ctx)).toThrow(/collides/);
  });
});
