import type { Project, ProjectGoal, ProjectPhase, ProjectStep, ProjectType } from '../../../src/shared/gamedata/types';
import type { CanonCost, CanonOffer, CanonRecord, CanonRewardPackage, Localization } from '../arcData';
import type { GenContext } from '../context';
import type { DomainModule } from './types';

/**
 * Domain 'projects' (docs/Game-Data.md). Phases → steps → goals are kept unflattened.
 *
 * Keys (index paths, never asset ids), shared by structure and text file:
 *   phase key  '<i>'          step key '<i>.<j>'          goal key '<i>.<j>.<k>'
 * Text fields per project slug (dotted paths, built into nested objects by TextCollector):
 *   name, description, longDescription, completedTitle, completedDescription,
 *   about.<n>.title, about.<n>.description,
 *   phases.<i>.name, phases.<i>.description,
 *   steps.<i>.<j>.name, steps.<i>.<j>.description,
 *   goals.<i>.<j>.<k>.name            (goal title, when the game gives one)
 * i.e. `<projectId>.<steps|goals|phases>.<key>.<field>` with the key's dots as nesting.
 *
 * Goal types: CONTRIBUTE_AMOUNT_OF_ITEMS → 'items', CONTRIBUTE_VALUE_OF_ITEMS → 'value', any
 * other canonical type → lowercase (e.g. 'complete_quests'). Server-side goal ids and quest
 * target ids are not emitted (S10 / game-mappings).
 *
 * Community events: CommunityEvent offers are grouped by owner into one project of type 'event'
 * (one phase, one step, one repeatable goal per offer, in offer `order`).
 */

interface CanonGoal {
  id: number;
  type: string;
  amount: number;
  canRepeat?: boolean;
  required?: boolean;
  title?: Localization | null;
  targetIds?: number[];
  targetTags?: string[];
  rewardPackage?: CanonRewardPackage | null;
}
interface CanonStep {
  title?: Localization | null;
  description?: Localization | null;
  rewardPackage?: CanonRewardPackage | null;
  goals?: CanonGoal[];
}
interface CanonPhase {
  title?: Localization | null;
  description?: Localization | null;
  steps?: CanonStep[];
}
interface CanonProject extends CanonRecord {
  start?: string | null;
  end?: string | null;
  rewards?: CanonRewardPackage | null;
  phases?: CanonPhase[];
  longDescription?: Localization | null;
  completedTitle?: Localization | null;
  completedDescription?: Localization | null;
  about?: { title?: Localization | null; description?: Localization | null }[];
}

const TYPES: Record<string, ProjectType> = { GENERAL: 'general', EXPEDITION: 'expedition', SEASONAL: 'seasonal' };

export function goalTypeOf(canonical: string): string {
  if (canonical === 'CONTRIBUTE_AMOUNT_OF_ITEMS') return 'items';
  if (canonical === 'CONTRIBUTE_VALUE_OF_ITEMS') return 'value';
  return canonical.toLowerCase();
}

/** Appends the expedition number to every non-empty locale string ("Expedition" → "Expedition 2"). */
function numbered(name: Localization, n: number): Localization {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(name)) out[k] = k !== 'key' && v ? `${v} ${n}` : v;
  return out as unknown as Localization;
}

function buildGoal(ctx: GenContext, pid: string, canon: CanonGoal, key: string): ProjectGoal {
  const type = goalTypeOf(canon.type);
  const goal: ProjectGoal = { key, goalType: type, amount: canon.amount, required: canon.required !== false };
  if (type === 'items' || type === 'value') {
    const ids = (canon.targetIds ?? []).map((id) => ctx.itemRef(id, `project ${pid} goal ${key}`)).filter((s): s is string => !!s);
    if (ids.length) goal.itemIds = ids;
  }
  if (canon.targetTags?.length) goal.tags = canon.targetTags;
  if (canon.canRepeat) goal.repeatable = true;
  const rewards = ctx.rewards(canon.rewardPackage, `project ${pid} goal ${key}`);
  if (rewards.length) goal.rewards = rewards;
  ctx.text.add('projects', pid, `goals.${key}.name`, canon.title);
  return goal;
}

function buildProject(ctx: GenContext, slug: string, p: CanonProject, type: ProjectType, expedition?: number): Project {
  const phases: ProjectPhase[] = (p.phases ?? []).map((phase, i) => {
    const pk = String(i);
    ctx.text.add('projects', slug, `phases.${pk}.name`, phase.title);
    ctx.text.add('projects', slug, `phases.${pk}.description`, phase.description);
    const steps: ProjectStep[] = (phase.steps ?? []).map((step, j) => {
      const sk = `${i}.${j}`;
      ctx.text.add('projects', slug, `steps.${sk}.name`, step.title);
      ctx.text.add('projects', slug, `steps.${sk}.description`, step.description);
      const out: ProjectStep = { key: sk, goals: (step.goals ?? []).map((g, k) => buildGoal(ctx, slug, g, `${sk}.${k}`)) };
      const rewards = ctx.rewards(step.rewardPackage, `project ${slug} step ${sk}`);
      if (rewards.length) out.rewards = rewards;
      return out;
    });
    return { key: pk, steps };
  });

  const needsNumber = !!expedition && !/\d/.test(p.name?.en ?? '');
  const nameEn = needsNumber ? `${p.name?.en || 'Expedition'} ${expedition}` : (p.name?.en ?? slug);
  const project: Project = { id: slug, nameEn, type, phases };
  if (p.start) project.start = p.start;
  if (p.end) project.end = p.end;
  if (expedition) project.expedition = expedition;
  const rewards = ctx.rewards(p.rewards, `project ${slug}`);
  if (rewards.length) project.rewards = rewards;

  ctx.text.add('projects', slug, 'name', p.name && needsNumber ? numbered(p.name, expedition!) : p.name);
  ctx.text.add('projects', slug, 'description', p.description);
  ctx.text.add('projects', slug, 'longDescription', p.longDescription);
  ctx.text.add('projects', slug, 'completedTitle', p.completedTitle);
  ctx.text.add('projects', slug, 'completedDescription', p.completedDescription);
  (p.about ?? []).forEach((a, n) => {
    ctx.text.add('projects', slug, `about.${n}.title`, a.title);
    ctx.text.add('projects', slug, `about.${n}.description`, a.description);
  });
  return project;
}

function buildEvents(ctx: GenContext, projects: Record<string, Project>): void {
  const byOwner = new Map<number, CanonOffer[]>();
  for (const o of ctx.arc.offers.values()) {
    if (o.type !== 'CommunityEvent') continue;
    byOwner.set(o.owner, [...(byOwner.get(o.owner) ?? []), o]);
  }
  for (const [owner, offers] of [...byOwner].sort((a, b) => a[0] - b[0])) {
    const slug = ctx.slugFor('projects', `event:${owner}`, {
      id: `event:${owner}`,
      kind: 'project',
      type: null,
      sources: [],
      name: { key: null, en: 'Community Event' } as Localization,
    });
    if (!slug) continue;
    const goals: ProjectGoal[] = [];
    for (const o of [...offers].sort((a, b) => a.order - b.order || a.id - b.id)) {
      const cost = ctx.cost(o.cost as CanonCost, `event ${slug}`);
      const goal: ProjectGoal = { key: `0.0.${goals.length}`, goalType: 'items', amount: 0, required: false, repeatable: true };
      if ('items' in cost) {
        goal.amount = cost.items.reduce((s, a) => s + a.quantity, 0);
        if (cost.items.length) goal.itemIds = cost.items.map((a) => a.itemId);
      } else {
        goal.goalType = 'value';
        goal.amount = cost.scrapValue ?? 0;
        if (cost.itemIds?.length) goal.itemIds = cost.itemIds;
        if (cost.tags?.length) goal.tags = cost.tags;
      }
      const rewards = ctx.rewards(o.rewards, `event ${slug}`);
      if (rewards.length) goal.rewards = rewards;
      ctx.text.add('projects', slug, `goals.${goal.key}.name`, o.title);
      goals.push(goal);
    }
    ctx.text.add('projects', slug, 'name', 'Community Event');
    projects[slug] = { id: slug, nameEn: 'Community Event', type: 'event', phases: [{ key: '0', steps: [{ key: '0.0', goals }] }] };
  }
}

const module: DomainModule = {
  domain: 'projects',
  build(ctx) {
    const records = [...ctx.arc.file<CanonProject>('projects').values()];
    // Expedition numbers by start order; the windows (one per expedition) serve as a consistency check.
    const windows = records.filter((r) => r.kind === 'expeditionWindow');
    const expeditions = records
      .filter((r) => r.kind === 'project' && r.type === 'EXPEDITION')
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
    if (windows.length !== expeditions.length) {
      ctx.report.add('projects', `expedition windows (${windows.length}) != expedition projects (${expeditions.length})`);
    }
    const numberOf = new Map(expeditions.map((e, i) => [String(e.id), i + 1]));

    const projects: Record<string, Project> = {};
    for (const rec of records) {
      if (rec.kind !== 'project') continue;
      const type = TYPES[rec.type ?? ''];
      if (!type) {
        ctx.report.add('projects', `unknown project type ${rec.type} (${rec.id})`);
        continue;
      }
      const slug = ctx.slugFor('projects', rec.id, rec);
      if (!slug) continue;
      projects[slug] = buildProject(ctx, slug, rec, type, type === 'expedition' ? numberOf.get(String(rec.id)) : undefined);
    }
    buildEvents(ctx, projects);
    return { projects };
  },
};

export default module;
