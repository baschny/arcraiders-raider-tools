import { describe, expect, it } from 'vitest';
import type { GenContext } from '../context';
import { Report } from '../context';
import { TextCollector } from '../text';
import amplification, { appliedAmplifications } from '../domains/amplification';
import { ampGlyphName, ampIconUrl } from '../ampIcons';
import type { AmplifiedWeapon } from '../../../src/shared/gamedata/types';

const loc = (en: string, key = 'K') => ({ key, en, de: `${en}-de` });
const tex = (name: string) => `/Game/Pioneer/UI/Assets/Icons/Ascended_upgrades/${name}.${name}`;
const fx = (key: string, value: number, type = 'positive') => ({ text: loc(`${key} {0}`, key), value, type });
const amp = (id: string, icon: string, extra: Record<string, unknown> = {}) => ({
  id, name: loc(id), description: loc(`${id} desc`), effects: [fx(`FX_${id}`, 1)], icon: tex(icon),
  requires: [], excludes: [], research: null, researchId: null, researchSlug: null, ...extra,
});
const cost = (itemId: string, quantity: number) => ({ items: [{ itemId, quantity }] });

/** Weapons: key → [slug base, base item, amplified item, variants(name suffix → slug)] */
function build(canon: Record<string, unknown>, mismatch = false) {
  const weapon = (base: string, amplified: string, variants: Record<string, string>, graph: AmplifiedWeapon['graph']) => ({ base, amplified, variants, graph });
  const defs = {
    Shotgun_PumpAction_01: weapon('il_toro_i', 'il_toro_amplified', {
      MoreReload: 'il_toro_amplified_more_reload', SlugRounds: 'il_toro_amplified_slug_rounds', 'MoreReload_SlugRounds': 'il_toro_amplified_more_reload_slug_rounds',
    }, {}),
  };
  const w = defs.Shotgun_PumpAction_01;
  const items: Record<string, { id: string; amplifiedFrom: string; baseId: string; upgradesTo?: unknown[] }> = {
    il_toro_iv: { id: 'il_toro_iv', amplifiedFrom: '', baseId: 'il_toro_i' },
  };
  const shipped = new Map<number, string>([[1, 'il_toro_iv'], [2, w.amplified], [3, 'slug_rounds_research']]);
  const arcItems = new Map<number, { internalName: string }>([
    [1, { internalName: 'DA_Item_Shotgun_PumpAction_01_Legendary' }],
    [2, { internalName: 'DA_Item_Shotgun_PumpAction_01_Ascended' }],
  ]);
  let n = 10;
  const add = (slug: string, suffix: string, upgradesTo: unknown[] = []) => {
    items[slug] = { id: slug, amplifiedFrom: 'il_toro_iv', baseId: 'il_toro_i', upgradesTo };
    shipped.set(n, slug);
    arcItems.set(n++, { internalName: `DA_Item_Shotgun_PumpAction_01_${suffix}` });
  };
  const slugStep = { cost: cost('turbine_compressor', 4), requires: [{ kind: 'item', id: 'slug_rounds_research', amount: 1 }] };
  const reloadStep = { cost: cost('part_d', 2) };
  const to = (itemId: string, s: { cost: unknown; requires?: unknown }) => ({ itemId, ...s });
  add(w.amplified, 'Ascended', [to(w.variants.MoreReload, reloadStep), to(w.variants.SlugRounds, slugStep)]);
  add(w.variants.MoreReload, 'MoreReload', [to(w.variants.MoreReload_SlugRounds, slugStep)]);
  add(w.variants.SlugRounds, 'SlugRounds', [to(w.variants.MoreReload_SlugRounds, mismatch ? { cost: cost('part_d', 3) } : reloadStep)]);
  add(w.variants.MoreReload_SlugRounds, 'MoreReload_SlugRounds');
  items.il_toro_iv.upgradesTo = [to(w.amplified, { cost: cost('material', 1) })];
  // items module result shape: only variants carry amplifiedFrom
  items.il_toro_iv.amplifiedFrom = '';
  delete (items.il_toro_iv as { amplifiedFrom?: string }).amplifiedFrom;
  items[w.amplified].amplifiedFrom = 'il_toro_iv';
  const report = new Report();
  const text = new TextCollector();
  const ctx = {
    arc: { items: arcItems, amplifications: () => canon },
    results: { items: { items } },
    shippedItems: shipped,
    report, text,
    itemRef: (id: number) => shipped.get(id) ?? null,
  } as unknown as GenContext;
  const out = amplification.build(ctx) as { weapons: Record<string, AmplifiedWeapon> };
  return { out, report, text };
}

const ilToro = () => ({
  Shotgun_PumpAction_01: {
    weaponSlug: 'il_toro', amplifiedItemId: 2, amplifiedSlug: 'il_toro_amplified', baseEffects: [fx('FIRERATE', 50)], maxAmplifications: 2, combinations: 3,
    amplifications: [
      amp('MoreReload', 'T_UI_Icon_Upgrade_MoreBulletsReload', { effects: [fx('SHELLS', 1, 'negative')] }),
      amp('SlugRounds', 'T_UI_Icon_Upgrade_SlugRounds', { research: 'DA_Item_Research_Ascended_SlugRounds', researchId: 3, researchSlug: 'slug_rounds_research' }),
    ],
  },
});

describe('amplification domain', () => {
  it('parses applied Amplifications from variant item names', () => {
    expect([...appliedAmplifications('DA_Item_W_01_Ascended', 'W_01')!]).toEqual([]);
    expect([...appliedAmplifications('DA_Item_W_01_A_B', 'W_01')!]).toEqual(['A', 'B']);
    expect(appliedAmplifications('DA_Item_Other_A', 'W_01')).toBeNull();
  });

  it('maps textures to the amp-* glyphs', () => {
    expect(ampGlyphName(tex('T_UI_Icon_Upgrade_MoreBulletsReload'))).toBe('amp-more-reload');
    expect(ampIconUrl('UI/Assets/Icons/Ascended_upgrades/T_UI_Icon_Upgrade_SlugRounds.png')).toBe('/images/whats-new/icons/amp-slug-rounds.webp');
    expect(ampIconUrl(tex('T_UI_Icon_Upgrade_Nope'))).toBeUndefined();
  });

  it('Il Toro: two Amplifications (More Reload, Slug Rounds), max 2, with edge costs and research', () => {
    const { out, report } = build(ilToro());
    const w = out.weapons.il_toro_i;
    expect(w.maxAmplifications).toBe(2);
    expect(w.amplifiedItemId).toBe('il_toro_amplified');
    expect(w.baseEffects).toEqual([{ key: 'FIRERATE', value: 50, type: 'positive' }]);
    expect(w.amplifications.map((a) => a.id)).toEqual(['MoreReload', 'SlugRounds']);
    const [reload, slug] = w.amplifications;
    expect(reload).toMatchObject({
      icon: '/images/whats-new/icons/amp-more-reload.webp',
      effects: [{ key: 'SHELLS', value: 1, type: 'negative' }],
      requires: [], excludes: [], variantStep: { cost: cost('part_d', 2) },
    });
    expect(reload.researchItemId).toBeUndefined();
    expect(slug.researchItemId).toBe('slug_rounds_research');
    expect(slug.variantStep).toEqual({ cost: cost('turbine_compressor', 4), requires: [{ kind: 'item', id: 'slug_rounds_research', amount: 1 }] });
    expect(report.count('amplificationStepMismatch')).toBe(0);
    expect(report.count('amplificationWithoutStep')).toBe(0);
  });

  it('reports a cost that differs between the edges adding the same Amplification', () => {
    const { report } = build(ilToro(), true);
    expect(report.count('amplificationStepMismatch')).toBe(1);
  });

  it('writes names, descriptions and effect texts per weapon, Amplification and effect index', () => {
    const { text } = build(ilToro());
    const de = text.build('amplification', 'de')['il_toro_i'] as Record<string, Record<string, unknown>>;
    expect(de.amplifications.MoreReload).toEqual({ name: 'MoreReload-de', description: 'MoreReload desc-de', effects: { 0: 'SHELLS {0}-de' } });
    expect(de.baseEffects).toEqual({ 0: 'FIRERATE {0}-de' });
    expect(text.en('amplification', 'il_toro_i', ['amplifications', 'SlugRounds', 'name'])).toBe('SlugRounds');
  });

  it('without amplifications.json the weapons get no extra fields', () => {
    const { out } = build({});
    const w = out.weapons.il_toro_i;
    expect(w.variants).toHaveLength(4);
    expect(w.amplifications).toBeUndefined();
    expect(w.maxAmplifications).toBeUndefined();
  });

  it('keeps exclusion and prerequisite rules as given (Anvil, Aphelion)', () => {
    const c = ilToro();
    c.Shotgun_PumpAction_01.amplifications = [
      amp('XRounds', 'T_UI_Icon_Upgrade_ExplosiveRounds', { excludes: ['ProjectileSplitter'] }),
      amp('ProjectileSplitter', 'T_UI_Icon_Upgrade_ProjectileSplitter', { excludes: ['XRounds'] }),
      amp('IncreasedBurst', 'T_UI_Icon_Upgrade_BurstFirst', { requires: ['ChargedBurst'] }),
    ] as never;
    c.Shotgun_PumpAction_01.maxAmplifications = 1;
    const w = build(c).out.weapons.il_toro_i;
    const by = Object.fromEntries(w.amplifications.map((a) => [a.id, a]));
    expect(w.maxAmplifications).toBe(1);
    expect(by.XRounds.excludes).toEqual(['ProjectileSplitter']);
    expect(by.ProjectileSplitter.excludes).toEqual(['XRounds']);
    expect(by.IncreasedBurst.requires).toEqual(['ChargedBurst']);
  });
});

// The generated data (public/data/game/amplification.json) for the weapons named in the spec.
import fs from 'fs';
import path from 'path';
import { repoRoot } from '../arcData';

describe('generated amplification.json', () => {
  const file = path.join(repoRoot, 'public', 'data', 'game', 'amplification.json');
  const weapons = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')).weapons as Record<string, AmplifiedWeapon>) : null;
  const find = (variant: string) => Object.values(weapons!).find((w) => w.variants?.includes(variant))!;

  it.skipIf(!weapons)('Il Toro has More Reload and Slug Rounds, max 2', () => {
    const w = find('il_toro_amplified');
    expect(w.maxAmplifications).toBe(2);
    expect(w.amplifications.map((a) => a.id).sort()).toEqual(['MoreReload', 'SlugRounds']);
  });

  it.skipIf(!weapons)('Anvil: max 1, X-Rounds and Splitter exclude each other', () => {
    const w = find('anvil_amplified');
    expect(w.maxAmplifications).toBe(1);
    const by = Object.fromEntries(w.amplifications.map((a) => [a.id, a]));
    expect(by.XRounds.excludes).toContain('ProjectileSplitter');
    expect(by.ProjectileSplitter.excludes).toContain('XRounds');
  });

  it.skipIf(!weapons)('Aphelion: Increased Burst requires Charged Burst', () => {
    const w = find('aphelion_amplified');
    expect(w.amplifications.find((a) => a.id === 'IncreasedBurst')!.requires).toEqual(['ChargedBurst']);
  });
});
