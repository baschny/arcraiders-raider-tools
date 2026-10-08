import * as fs from 'fs';
import * as path from 'path';
import { RARITIES, type ClassificationStructure, type Item, type Rarity } from '../../../src/shared/gamedata/types';
import { repoRoot, type CanonRecord, type Localization } from '../arcData';
import type { GenContext } from '../context';
import { shortCategory, shortClassification, shortGroup } from './classification-ids';
import type { DomainModule } from './types';

interface CanonCategory extends CanonRecord {
  parent?: string | null;
}
interface CanonRarity extends CanonRecord {
  color?: string;
}
interface CanonStashGroup extends CanonRecord {
  order?: number;
  subgroups?: { id: string; name?: Localization | null }[];
}

const SHARED_VARIABLES = path.join(repoRoot, 'src', 'shared', 'styles', '_variables.scss');

/** `$rarity-common: #6C6C6C;` → { Common: '#6C6C6C' } for the rarities found in the file. */
export function parseRarityColors(scss: string): Partial<Record<Rarity, string>> {
  const out: Partial<Record<Rarity, string>> = {};
  for (const m of scss.matchAll(/^\$rarity-([a-z]+)\s*:\s*(#[0-9a-fA-F]{6})\b/gm)) {
    const name = RARITIES.find((r) => r.toLowerCase() === m[1]);
    if (name) out[name] = m[2].toUpperCase();
  }
  return out;
}

/** Reports shared SCSS rarity colors that differ from the game's (the game is the source). */
function checkRarityStyles(ctx: GenContext, colors: Record<Rarity, { level: number; color: string }>): void {
  if (!fs.existsSync(SHARED_VARIABLES)) return;
  const scss = parseRarityColors(fs.readFileSync(SHARED_VARIABLES, 'utf8'));
  for (const name of RARITIES) {
    const have = scss[name];
    const want = colors[name]?.color.toUpperCase();
    if (!have) ctx.report.add('rarityColorMismatch', `${name}: no $rarity-${name.toLowerCase()} in src/shared/styles/_variables.scss (game ${want})`);
    else if (want && have !== want) ctx.report.add('rarityColorMismatch', `${name}: styles ${have} != game ${want}`);
  }
}

const module: DomainModule = {
  domain: 'classification',
  build(ctx) {
    const items = (ctx.results.items?.items ?? {}) as Record<string, Item>;
    const categoryRecords = ctx.arc.file<CanonCategory>('item-categories');
    const byShort = new Map<string, CanonCategory>();
    for (const [tag, rec] of categoryRecords) byShort.set(shortClassification(tag), rec);

    // --- rarities ---------------------------------------------------------------------------
    const rarities = {} as ClassificationStructure['rarities'];
    const rarityRecords = ctx.arc.file<CanonRarity>('rarities');
    RARITIES.forEach((name, i) => {
      const rec = rarityRecords.get(String(i + 1));
      if (!rec?.color) {
        ctx.report.add('raritiesMissing', `${name} (level ${i + 1})`);
        return;
      }
      if (rec.name?.en && rec.name.en !== name) ctx.report.add('rarityNameMismatch', `level ${i + 1}: game "${rec.name.en}" != "${name}"`);
      rarities[name] = { level: i + 1, color: rec.color.toUpperCase() };
      ctx.text.add('classification', 'rarities', [name], rec.name ?? name);
    });
    checkRarityStyles(ctx, rarities);

    // --- used classification ids ---------------------------------------------------------------
    const usedCategories = new Set<string>();
    const usedGroups = new Map<string, Set<string>>();
    for (const item of Object.values(items)) {
      if (item.category) usedCategories.add(item.category);
      if (item.subgroup) usedCategories.add(item.subgroup);
      for (const t of item.foundIn ?? []) usedCategories.add(t);
      if (item.group) {
        const subs = usedGroups.get(item.group) ?? new Set<string>();
        if (item.subgroup) subs.add(item.subgroup);
        usedGroups.set(item.group, subs);
      }
    }

    // --- stash groups (game order) -------------------------------------------------------------
    const groups: ClassificationStructure['groups'] = [];
    const groupRecords = [...ctx.arc.file<CanonStashGroup>('stash-groups').values()]
      .filter((g) => shortGroup(String(g.id)) !== 'All')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const seenGroups = new Set<string>();
    for (const g of groupRecords) {
      const id = shortGroup(String(g.id));
      seenGroups.add(id);
      const used = usedGroups.get(id);
      if (!used) continue;
      const subgroups: string[] = [];
      for (const s of g.subgroups ?? []) {
        const sid = shortCategory(s.id);
        if (!used.has(sid)) continue;
        subgroups.push(sid);
        ctx.text.add('classification', 'subgroups', [sid], s.name ?? byShort.get(sid)?.name);
      }
      groups.push({ id, order: g.order ?? 0, ...(subgroups.length ? { subgroups } : {}) });
      ctx.text.add('classification', 'groups', [id], g.name);
    }
    for (const id of usedGroups.keys()) if (!seenGroups.has(id)) ctx.report.add('unknownStashGroup', id);
    // subgroups an item names that its group does not list
    for (const [gid, subs] of usedGroups) {
      const listed = new Set(groups.find((g) => g.id === gid)?.subgroups ?? []);
      for (const s of subs) if (!listed.has(s)) ctx.report.add('subgroupNotInGroup', `${gid}: ${s}`);
    }

    // --- categories and themes with ancestors ------------------------------------------------
    const categories: ClassificationStructure['categories'] = {};
    const addCategory = (id: string): void => {
      if (categories[id]) return;
      const rec = byShort.get(id);
      if (!rec) {
        ctx.report.add('categoryUnknown', id);
        categories[id] = {};
        return;
      }
      const parent = rec.parent ? shortClassification(rec.parent) : undefined;
      const parentKnown = parent != null && byShort.has(parent);
      categories[id] = parentKnown ? { parent } : {};
      if (parentKnown) addCategory(parent);
    };
    const themeIds = new Set<string>();
    for (const item of Object.values(items)) for (const t of item.foundIn ?? []) themeIds.add(t);
    for (const id of usedCategories) addCategory(id);
    for (const id of Object.keys(categories)) {
      const rec = byShort.get(id);
      if (!rec?.name?.en) {
        if (usedCategories.has(id)) ctx.report.add('categoryUnlabelled', id);
        continue;
      }
      ctx.text.add('classification', themeIds.has(id) ? 'themes' : 'categories', [id], rec.name);
    }
    // a theme and a category sharing a short id would clash in `categories`
    for (const id of themeIds) if (categoryRecords.has(`UI.ItemClassification.Category.${id}`)) ctx.report.add('categoryThemeClash', id);

    return { rarities, groups, categories };
  },
};

export default module;
