// Puzzle overlay logic of the map page (S21): which puzzles and variants are shown for the selected round
// condition, their colour from a fixed palette, the ordered trail of a sequence, and the door pin a puzzle is
// revealed from. Pure so the engine, the sidebar legend and the tests agree.
import type { MapCondition, MapData, Puzzle, PuzzlePart, PuzzleVariant } from './types';

/** Fixed variant palette (distinct hues); a variant keeps one colour for all its pins and its trail. */
export const PUZZLE_COLORS = ['#e0604f', '#4fb0e0', '#8fbf6a', '#d9cc5c', '#c27cb3', '#5bb594', '#d9a03e', '#8e97d4'];

/**
 * Colour per variant, distinct across all puzzles shown at once: the palette index keeps counting over the
 * variants of the preceding puzzles, so two puzzles never share a colour while the palette is not exhausted.
 */
export function variantColors(puzzles: Puzzle[]): string[][] {
  let n = 0;
  return puzzles.map((p) => p.variants.map(() => PUZZLE_COLORS[n++ % PUZZLE_COLORS.length]));
}

/**
 * Whether a variant exists under the selected round condition. Conditions are matched by the name the page
 * shows; a `not` entry naming a condition the map does not offer is ignored (it can never be selected).
 */
export function variantActive(variant: PuzzleVariant, cond: MapCondition): boolean {
  const c = variant.conditions;
  if (!c) return true;
  if (c.not?.includes(cond.name)) return false;
  if (c.only && !c.only.includes(cond.name)) return false;
  return true;
}

/** Indexes of a puzzle's variants that are active under `cond`. */
export const activeVariants = (puzzle: Puzzle, cond: MapCondition): number[] =>
  puzzle.variants.map((_, i) => i).filter((i) => variantActive(puzzle.variants[i], cond));

/** Steps of a variant in press order (`n` ascending; unnumbered steps keep their order, last). */
export function stepOrder(variant: PuzzleVariant): PuzzleVariant['steps'] {
  return [...variant.steps].sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity));
}

/** Label of a variant: "Layout 3" for `LI_…Layout3`, else "Variant N" (1-based). */
export function variantLabel(variant: PuzzleVariant, index: number): string {
  const m = /Layout(\d+)$/.exec(variant.id ?? '');
  return m ? `Layout ${m[1]}` : `Variant ${index + 1}`;
}

/** Readable sigil label: the trailing number of its key ("mural-81" -> "81"). */
export const symbolLabel = (key: string) => key.split('-').pop() ?? key;

/**
 * Index of the spawner that draws a puzzle's door pin: the spawner whose class set holds the door part's class
 * and whose uv is at the part's uv (they are the same actor). -1 when there is no such spawner.
 */
export function doorSpawnerOf(map: MapData, part: PuzzlePart): number {
  const cls = part.class.replace(/_C$/, '');
  let best = -1, bestD = Infinity;
  map.spawners.forEach(([u, v, cs], i) => {
    const set = map.spawnerClasses[cs] ?? '';
    if (!set.split(' | ').includes(cls)) return;
    const d = (u - part.uv[0]) ** 2 + (v - part.uv[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  // The part and its spawner are the same actor: require a match within a few metres (uv identical in the data).
  const tol = 3 / (map.world?.[2] || 162000);
  return bestD <= tol * tol ? best : -1;
}

/** Spawner index -> puzzle index, for the door-pin reveal of every puzzle of the map. */
export function doorPuzzles(map: MapData): Map<number, number> {
  const out = new Map<number, number>();
  (map.puzzles ?? []).forEach((p, pi) => {
    const part = p.parts?.find((x) => x.role === 'door');
    if (!part) return;
    const i = doorSpawnerOf(map, part);
    if (i >= 0) out.set(i, pi);
  });
  return out;
}

/**
 * Puzzles to show: all of them with the Puzzles layer on, else only the one opened by its door pin (none).
 * Each puzzle's active variants are checked separately (a puzzle can be visible with no variant this round).
 */
export function visiblePuzzles(map: MapData, layerOn: boolean, opened: number | null): number[] {
  const n = map.puzzles?.length ?? 0;
  if (layerOn) return Array.from({ length: n }, (_, i) => i);
  return opened != null && opened >= 0 && opened < n ? [opened] : [];
}
