import type { Amplification, AmplifiedWeapon } from '../../../../shared/gamedata/types';
import { requiresOf } from './picker';

export interface GraphNode {
  id: string;
  /** Column 0 is the root (the Amplified weapon); Amplifications start at column 1. */
  col: number;
  /** Row, 0-based; fractional for the root, which is centred on all paths. */
  row: number;
}

export interface GraphEdge {
  /** Parent Amplification id; null = the root. */
  from: string | null;
  to: string;
}

export interface GraphLayout {
  root: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  cols: number;
  rows: number;
}

/**
 * Lays the Amplifications out like the game: every Amplification without `requires` starts its own
 * path (row) from the root, an Amplification that requires another continues that path to the right.
 * A second Amplification requiring the same parent branches into a new row.
 */
export function layoutGraph(weapon: AmplifiedWeapon): GraphLayout {
  const byId = new Map<string, Amplification>(weapon.amplifications.map((a) => [a.id, a]));
  const parentOf = (a: Amplification): string | null => requiresOf(a).find((r) => byId.has(r)) ?? null;
  const children = new Map<string | null, Amplification[]>();
  for (const a of weapon.amplifications) {
    const p = parentOf(a);
    children.set(p, [...(children.get(p) ?? []), a]);
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let nextRow = 0;
  const place = (a: Amplification, col: number, row: number, parent: string | null) => {
    nodes.push({ id: a.id, col, row });
    edges.push({ from: parent, to: a.id });
    (children.get(a.id) ?? []).forEach((child, i) => place(child, col + 1, i === 0 ? row : nextRow++, a.id));
  };
  (children.get(null) ?? []).forEach((a) => place(a, 1, nextRow++, null));

  const rows = Math.max(1, nextRow);
  const cols = 1 + Math.max(0, ...nodes.map((n) => n.col));
  return { root: { id: '', col: 0, row: (rows - 1) / 2 }, nodes, edges, cols, rows };
}
