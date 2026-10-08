import type { SkillGroup, SkillNode, SkilltreeStructure } from '../../../src/shared/gamedata/types';
import type { CanonRecord } from '../arcData';
import type { GenContext } from '../context';
import type { DomainModule } from './types';

interface CanonSkillNode extends CanonRecord {
  category: string;
  root: boolean;
  parentNodeIds: number[];
  childNodeIds: number[];
  requireAllParents: boolean;
  maxLevel: number;
  minTotalInvestment: number;
}

interface CanonSkillGroup extends CanonRecord {
  maxSelectable: number;
  minTotalInvestmentOverridePerUnlock?: number[];
  nodeIds: number[];
}

/**
 * Domain 'skilltree' (spec-site.md#skilltree). A node without an English name gets no slug (so
 * nothing placeholder-ish is ever frozen). A tree with unnamed nodes would dangle parents and
 * children, so the whole domain is emitted empty and reported under `skilltreeIncomplete` until
 * every node has a name.
 */
export function buildSkilltree(ctx: GenContext): SkilltreeStructure {
  const empty: SkilltreeStructure = { nodes: {}, groups: {} };
  const all = [...ctx.arc.file<CanonSkillNode & CanonSkillGroup>('skill-trees').values()];
  const nodes = all.filter((r) => r.kind === 'skillNode') as CanonSkillNode[];
  const groups = all.filter((r) => r.kind === 'skillGroup') as CanonSkillGroup[];
  const unnamed = nodes.filter((n) => !n.name?.en);
  if (nodes.length === 0 || unnamed.length > 0) {
    ctx.report.add(
      'skilltreeIncomplete',
      `${nodes.length - unnamed.length}/${nodes.length} skill nodes have an English name; skilltree not shipped`,
    );
    return empty;
  }

  const slugOf = new Map<number, string>();
  for (const n of [...nodes].sort((a, b) => Number(a.id) - Number(b.id))) {
    const slug = ctx.slugFor('skills', n.id, n);
    if (slug) slugOf.set(Number(n.id), slug);
  }
  const ref = (id: number, context: string): string | null => {
    const s = slugOf.get(id);
    if (!s) ctx.report.add('droppedSkillRefs', `${id} in ${context}`);
    return s ?? null;
  };

  const out: SkilltreeStructure = { nodes: {}, groups: {} };
  for (const n of nodes) {
    const id = slugOf.get(Number(n.id));
    if (!id) continue;
    const node: SkillNode = {
      id,
      nameEn: n.name!.en,
      category: n.category,
      parents: n.parentNodeIds.map((p) => ref(p, id)).filter((s): s is string => !!s),
      children: n.childNodeIds.map((c) => ref(c, id)).filter((s): s is string => !!s),
      maxLevel: n.maxLevel,
      minTotalInvestment: n.minTotalInvestment,
      requireAllParents: n.requireAllParents,
    };
    if (n.root) node.root = true;
    out.nodes[id] = node;
    ctx.text.add('skilltree', id, 'name', n.name);
    ctx.text.add('skilltree', id, 'description', n.description);
  }
  for (const g of groups) {
    const members = g.nodeIds.map((x) => ref(x, `group ${g.id}`)).filter((s): s is string => !!s);
    if (members.length === 0) continue;
    const id = `group_${[...members].sort()[0]}`;
    const group: SkillGroup = { id, nodes: members, maxSelectable: g.maxSelectable };
    if (g.minTotalInvestmentOverridePerUnlock?.length) {
      group.minTotalInvestmentOverridePerUnlock = g.minTotalInvestmentOverridePerUnlock;
    }
    out.groups[id] = group;
  }
  return out;
}

const module: DomainModule = {
  domain: 'skilltree',
  build(ctx) {
    return { ...buildSkilltree(ctx) };
  },
};

export default module;
