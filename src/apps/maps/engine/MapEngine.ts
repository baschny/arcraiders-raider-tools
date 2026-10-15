// Imperative canvas engine for the map (originally ported from the embark-api map features UI): map texture,
// playable area, POIs and loot zones, item heat map, loot sockets as dots (icons when zoomed in), spawned spots
// and map features as game icons, ARC spawners with patrol paths, and the activity group of the hovered or
// pinned spawner (ringed members + area hull). React feeds it the Explorer model; it reports tooltip targets.
import { ICON_SHARE, THEME_ICONS, THREAT, ZONE_COLORS, areaThemes, enemyIcon, isFeature, lootZone, markerStyle, type MarkerStyle, type SpotKind } from '../data/kinds';
import { DATA_BASE, reportTileError, symbolUrl } from '../data/useMapData';
import type { Level, MapData, PuzzleSymbol, UV } from '../data/types';
import { eligibleEntrances, guideEntranceVisible, guideOwnsSpawner, guidePins, guideTrails, selectEntrance, symbolOf, toggleLayout, type GuideSelection, type GuideTargets, PLAIN_PUZZLE_COLOR, visibleSteps, stepLabel } from '../data/puzzles';
import type { MapScore } from '../data/scoring';
import { bbox, convexHull, inPoly, inRings, polyArea, ringsArea } from '../geometry';
import type { Explorer } from '../model';
import { onIconsLoaded, tintedIcon, tintedImage } from './iconAtlas';
import { TileLayer } from './tiles';

export type Target = {
  /** frigate / reclaimer: index into Frigate.poses; cargo: into Frigate.dropsites. */
  t: 'socket' | 'spawner' | 'enemy' | 'poi' | 'entrance' | 'action' | 'frigate' | 'reclaimer' | 'cargo';
  i: number;
};
export type Pin = { t: 'spawner' | 'enemy'; i: number };
/** Tooltip target at a position, with the map's size for keeping the tooltip inside; touch: opened by a tap. */
export type TipState = { target: Target; x: number; y: number; w: number; h: number; touch?: boolean };
export type Padding = { left?: number; right?: number; top?: number; bottom?: number };
export interface Heat {
  canvas: HTMLCanvasElement | null;
  /** Sockets that hold the item, lowest score first (drawn in this order). */
  order: number[];
}

const MIN_S = 0.5, MAX_S = 40;
/** Distinct, high-contrast COLD hues for area-of-effect discs (the snowy terrain swallows pale colours); one per zone. */
const AREA_HUES = [205, 235, 265, 295, 175, 190, 220, 250, 280];
/** Touch: movement (px) below which a touch still counts as a tap; double tap window (ms) and distance (px). */
const TAP_SLOP = 8, DOUBLE_TAP_MS = 300, DOUBLE_TAP_PX = 30;
/**
 * ARC Frigate layer: footprints in magenta, Reclaimer landing rings in cyan (both apart from the red / yellow loot
 * zones and the ARC red), cargo drop sites as light tiles. Also the tooltip accents.
 */
export const FRIGATE_RGB = '214,92,230', RECLAIMER_RGB = '64,206,222';
const RAMP: [number, number, number][] = [[80, 160, 220], [90, 200, 190], [230, 215, 90], [235, 150, 60], [225, 80, 60]];
function ramp(t: number, alpha = 1) {
  const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1), i = Math.floor(x), f = x - i;
  const c = RAMP[i].map((v, k) => Math.round(v + (RAMP[i + 1][k] - v) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}
export const heightCode = (h: Level | undefined): -1 | 0 | 1 => (h?.[1] == null ? 0 : h[1] > 35 ? 1 : h[1] < -35 ? -1 : 0);

/** Heat map in texture space (512² accumulation with a smooth kernel) of the sockets that can hold the item. */
export function buildHeat(score: MapScore | null, map: MapData, socketVisible: (i: number) => boolean): Heat {
  if (!score || score.max <= 0) return { canvas: null, order: [] };
  const order = map.sockets.map((_, i) => i).filter((i) => score.sockets[i] > 0 && socketVisible(i)).sort((a, b) => score.sockets[a] - score.sockets[b]);
  const N = 512, R = 9, acc = new Float32Array(N * N), kernel: [number, number, number][] = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy) / R;
    if (d <= 1) kernel.push([dx, dy, (1 - d * d) ** 2]);
  }
  for (const i of order) {
    const s = map.sockets[i], v = score.sockets[i], cx = Math.round(s[0] * N), cy = Math.round(s[1] * N);
    for (const [dx, dy, w] of kernel) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < N && y < N) acc[y * N + x] += v * w;
    }
  }
  let max = 0;
  for (const v of acc) if (v > max) max = v;
  if (!max) return { canvas: null, order };
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const hctx = c.getContext('2d')!, img = hctx.createImageData(N, N);
  for (let i = 0; i < acc.length; i++) {
    if (!acc[i]) continue;
    const t = Math.sqrt(acc[i] / max), x = Math.min(0.9999, t) * 4, k = Math.floor(x), f = x - k;
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = RAMP[k][ch] + (RAMP[k + 1][ch] - RAMP[k][ch]) * f;
    img.data[i * 4 + 3] = Math.min(190, 30 + t * 210);
  }
  hctx.putImageData(img, 0, 0);
  return { canvas: c, order };
}

// ---------------------------------------------------------------- marker geometry
/** Kinds drawn like loot dots (containers, nature), also when a spawner places them (snow piles). */
const lootLike = (kind: SpotKind) => ['dot', 'leaf'].includes(markerStyle(kind));
/** Loot spots drawn as icon markers when zoomed in (nature); container dots always stay dots. */
const iconWhenZoomed = (kind: SpotKind) => !kind.small && markerStyle(kind) !== 'dot';
//
// Marker sizes follow the zoom: the view scale s is 1 when the map fits the view and up to MAX_S zoomed in. Markers grow
// with s^0.4 (×1 at s ≤ 1, ×1.74 at 4, ×2.5 from 10 on), much slower than the map (×s), so they spread apart when
// zooming in and their icons grow readable. Container dots stay small at every zoom (radius 2.2·√s, 2.4–6 px; there
// are thousands, packed in buildings); nature spots turn into icon markers from SOCKET_ICON_ZOOM on. The base sizes (MARKER_SIZE, px at s ≤ 1) give the icon inside 7–12 px
// even fully zoomed out, 18–30 px fully zoomed in.
export const SOCKET_ICON_ZOOM = 4;
export const MARKER_SIZE = { major: 19, normal: 16, small: 13, socket: 11, enemy: 28 };
export const markerScaleAt = (s: number) => Math.min(2.5, Math.max(1, s ** 0.4));
const LIGHT = '#f4f3ef', DARK = '#15181e', OUTLINE = 'rgba(6,8,12,.7)';

/** A closed polygon with its corners rounded by r (arcTo: every corner alike, so the shape stays symmetric). */
function roundedPolygon(ctx: CanvasRenderingContext2D, pts: [number, number][], r: number) {
  const n = pts.length, [ax, ay] = pts[n - 1], [bx, by] = pts[0];
  ctx.moveTo((ax + bx) / 2, (ay + by) / 2);
  for (let i = 0; i < n; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[(i + 1) % n][0], pts[(i + 1) % n][1], r);
  ctx.closePath();
}

/** Adds the outline of a marker shape of half-size R at (x, y) to the current path (markers, highlights alike). */
export function shapePath(ctx: CanvasRenderingContext2D, style: MarkerStyle, x: number, y: number, R: number) {
  switch (style) {
    case 'tile':
    case 'gate': {
      const h = R * 0.9;
      ctx.roundRect(x - h, y - h, 2 * h, 2 * h, h * 0.4);
      return;
    }
    case 'leaf': {
      const h = R * 0.9;
      ctx.roundRect(x - h, y - h, 2 * h, 2 * h, [h, h * 0.24, h, h * 0.24]);
      return;
    }
    case 'diamond': {
      const d = R * 1.2;
      roundedPolygon(ctx, [[x, y - d], [x + d, y], [x, y + d], [x - d, y]], d * 0.2);
      return;
    }
    case 'hex': {
      const d = R * 1.1;
      roundedPolygon(ctx, [0, 1, 2, 3, 4, 5].map((i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        return [x + d * Math.cos(a), y + d * Math.sin(a)] as [number, number];
      }), d * 0.18);
      return;
    }
    default:
      ctx.moveTo(x + R, y);
      ctx.arc(x, y, R, 0, Math.PI * 2);
  }
}

/** Visible half-extent of a bare enemy glyph of size sz (the ping icons fill about 65 % of their image). */
const glyphR = (sz: number) => sz * 0.34;
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

/** Patrol mark: a small dark badge with a white circular arrow on the marker's lower right. */
function patrolMark(ctx: CanvasRenderingContext2D, x: number, y: number, R: number) {
  const b = Math.max(3.8, R * 0.42), cx = x + R * 0.8, cy = y + R * 0.8, a = b * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, b, 0, Math.PI * 2);
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = LIGHT;
  ctx.stroke();
  const end = Math.PI * 1.55;
  ctx.beginPath();
  ctx.arc(cx, cy, a, -Math.PI * 0.25, end);
  ctx.lineWidth = Math.max(1.1, b * 0.24);
  ctx.lineCap = 'round';
  ctx.stroke();
  // Arrowhead at the arc's end, pointing along it.
  const ex = cx + a * Math.cos(end), ey = cy + a * Math.sin(end), h = b * 0.42;
  ctx.beginPath();
  ctx.moveTo(ex + h, ey);
  ctx.lineTo(ex, ey - h * 0.9);
  ctx.lineTo(ex - h * 0.15, ey + h * 0.6);
  ctx.closePath();
  ctx.fillStyle = LIGHT;
  ctx.fill();
}

/**
 * Height mark, the same on every shape: a small dark badge with a white chevron (up: above ground, down: below) on the
 * marker's upper right. Plain loot dots get only the chevron, above or below the dot.
 */
function heightMark(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, code: -1 | 1, badge: boolean) {
  const b = badge ? Math.max(3.6, R * 0.42) : 2.6;
  const cx = badge ? x + R * 0.8 : x, cy = badge ? y - R * 0.8 : y - code * (R + 3.2);
  if (badge) {
    ctx.beginPath();
    ctx.arc(cx, cy, b, 0, Math.PI * 2);
    ctx.fillStyle = DARK;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = LIGHT;
    ctx.stroke();
  }
  const w = b * (badge ? 0.5 : 1), t = b * (badge ? 0.28 : 0.55);
  ctx.beginPath();
  ctx.moveTo(cx - w, cy + code * t);
  ctx.lineTo(cx, cy - code * t);
  ctx.lineTo(cx + w, cy + code * t);
  ctx.lineCap = ctx.lineJoin = 'round';
  if (!badge) {
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  ctx.lineWidth = badge ? Math.max(1.2, b * 0.3) : 1.5;
  ctx.strokeStyle = LIGHT;
  ctx.stroke();
}

export class MapEngine {
  private ex!: Explorer;
  private heat: Heat = { canvas: null, order: [] };
  private padding: Padding = {};
  private view = { s: 1, x: 0, y: 0 };
  private zoom = { target: 1, mx: 0, my: 0, active: false };
  private frame = 0;
  private hoverFrame = 0;
  private hover: Target | null = null;
  private pin: Pin | null = null;
  private tipKey: string | null = null;
  private tipShown = false;
  private tipTimer = 0;
  private drag: { x: number; y: number; vx: number; vy: number } | null = null;
  // Touch: active pointers, pinch start (finger distance, scale, map point under the midpoint), tap tracking.
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { d0: number; s0: number; u: number; v: number } | null = null;
  private tapOk = false;
  private lastTap = { t: 0, x: 0, y: 0 };
  private lastPointer = 'mouse';
  private cleanup: (() => void)[] = [];
  private wrap: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private onTip: (tip: TipState | null) => void;
  /** Last tooltip state reported to React. */
  private tip: TipState | null = null;
  /** One session-only guide and entrance selection. */
  private activePuzzle: GuideSelection | null = null;
  private guideHighlight: GuideTargets | null = null;
  private onPuzzle: (i: GuideSelection | null) => void;
  private tiles = new TileLayer(DATA_BASE, () => this.requestDraw(), reportTileError);

  constructor(wrap: HTMLDivElement, canvas: HTMLCanvasElement, onTip: (tip: TipState | null) => void, onPuzzle: (i: GuideSelection | null) => void = () => {}) {
    this.wrap = wrap;
    this.canvas = canvas;
    this.onPuzzle = onPuzzle;
    this.onTip = (tip) => {
      this.tip = tip;
      onTip(tip);
    };
    const ro = new ResizeObserver(() => this.requestDraw());
    ro.observe(wrap);
    this.cleanup.push(() => ro.disconnect(), onIconsLoaded(() => this.requestDraw()));
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn as EventListener, opts);
      this.cleanup.push(() => el.removeEventListener(ev, fn as EventListener));
    };
    // Touch has its own handlers (pan, pinch, taps); mouse and pen keep hover, drag and click.
    const touch = (e: PointerEvent) => e.pointerType === 'touch';
    on(canvas, 'pointerdown', (e) => {
      this.lastPointer = e.pointerType;
      if (touch(e)) this.touchDown(e);
      else this.down(e);
    });
    on(canvas, 'pointerup', (e) => (touch(e) ? this.touchUp(e, true) : this.up(e)));
    on(canvas, 'pointercancel', (e) => touch(e) && this.touchUp(e, false));
    on(canvas, 'pointermove', (e) => (touch(e) ? this.touchMove(e) : this.move(e)));
    on(canvas, 'wheel', (e) => this.wheel(e), { passive: false });
    on(canvas, 'pointerleave', (e) => !touch(e) && this.leave());
    on(canvas, 'dblclick', () => this.lastPointer !== 'touch' && this.fit());
    // Esc unpins, and closes a tooltip card (touch); a hover tooltip stays, with its hint updated.
    on(window, 'keydown', (e) => {
      if (e.key !== 'Escape' || !(this.pin || this.tip?.touch)) return;
      if (this.tip?.touch) return this.dismissTip();
      this.pin = null;
      if (this.tip) this.onTip({ ...this.tip });
      this.requestDraw();
    });
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.hoverFrame);
    clearTimeout(this.tipTimer);
    this.cleanup.forEach((fn) => fn());
  }

  update(ex: Explorer, heat: Heat, padding: Padding = {}, activePuzzle: GuideSelection | null = null) {
    const fresh = !this.ex || this.ex.map !== ex.map;
    // A reloaded copy of the same map (new tile folders after a deploy) keeps the view.
    const refit = !this.ex || this.ex.map.map !== ex.map.map;
    const guideChanged = this.activePuzzle?.guideId !== activePuzzle?.guideId || this.activePuzzle?.entranceId !== activePuzzle?.entranceId;
    const stepsChanged = JSON.stringify(this.activePuzzle?.disabledStepIds ?? []) !== JSON.stringify(activePuzzle?.disabledStepIds ?? []);
    const layoutChanged = this.activePuzzle?.layoutId !== activePuzzle?.layoutId;
    let preservedTip: TipState | null = null;
    if (!fresh && layoutChanged && !guideChanged && this.tip?.target.t === 'action') {
      const oldPin = guidePins(this.ex.map, this.ex.cond, true, this.activePuzzle)[this.tip.target.i];
      const nextPins = guidePins(ex.map, ex.cond, true, activePuzzle);
      const nextIndex = oldPin ? nextPins.findIndex((pin) => pin.location.id === oldPin.location.id) : -1;
      if (nextIndex >= 0) preservedTip = { ...this.tip, target: { t: 'action', i: nextIndex } };
    }
    const reset = fresh || this.ex.state.mode !== ex.state.mode || this.ex.ci !== ex.ci || guideChanged || stepsChanged || this.ex.prefs.puzzleDoors !== ex.prefs.puzzleDoors || (layoutChanged && !preservedTip);
    this.ex = ex;
    this.heat = heat;
    this.padding = padding;
    this.activePuzzle = activePuzzle;
    if (reset) {
      this.guideHighlight = null;
      this.pin = null;
      this.hover = null;
      this.hideTip();
    } else if (preservedTip) {
      this.hover = preservedTip.target;
      this.tip = preservedTip;
      this.onTip(preservedTip);
    }
    if (refit) this.fit();
    else this.requestDraw();
  }

  highlightGuide(targets: GuideTargets | null) {
    this.guideHighlight = targets;
    this.requestDraw();
  }

  pinned() {
    return this.pin;
  }

  /** Close the tooltip card (touch) and drop the highlighted and pinned spot. */
  dismissTip() {
    this.hideTip();
    this.hover = null;
    this.pin = null;
    this.requestDraw();
  }

  // ---------------------------------------------------------------- view
  private size() {
    return { w: this.wrap.clientWidth || 1, h: this.wrap.clientHeight || 1 };
  }
  private base() {
    const { w, h } = this.size();
    return Math.min(w, h);
  }
  private toScreen(u: number, v: number): [number, number] {
    const b = this.base() * this.view.s;
    return [this.view.x + u * b, this.view.y + v * b];
  }
  private toUv(x: number, y: number): UV {
    const b = this.base() * this.view.s;
    return [(x - this.view.x) / b, (y - this.view.y) / b];
  }
  private markerScale() {
    return markerScaleAt(this.view.s);
  }
  /** Puzzle pins keep their gentler growth (×1–1.5). */
  private puzzleScale() {
    return Math.min(1.5, Math.max(1, Math.pow(this.view.s, 0.25)));
  }
  /** Size of a spawner's marker: by importance, zoom, and (spawned kinds) spawn chance; loot-like kinds as loot icons. */
  private spawnerSize(kind: SpotKind, p: number) {
    if (lootLike(kind)) return MARKER_SIZE.socket * this.markerScale();
    const base = kind.major ? MARKER_SIZE.major : kind.small ? MARKER_SIZE.small : MARKER_SIZE.normal;
    return base * this.markerScale() * (isFeature(kind) ? 1 : 0.85 + 0.15 * p);
  }

  requestDraw() {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.draw());
  }

  fit() {
    if (!this.ex) return;
    const { w, h } = this.size(), m = this.ex.map;
    const pad = { left: 16, right: 16, top: 16, bottom: 16, ...this.padding };
    const [u0, v0, u1, v1] = m.bounds?.length ? bbox(m.bounds.flat()) : [0, 0, 1, 1];
    const aw = Math.max(50, w - pad.left - pad.right), ah = Math.max(50, h - pad.top - pad.bottom);
    const b = Math.min(aw / (u1 - u0), ah / (v1 - v0));
    this.zoom.active = false;
    this.view = { s: b / Math.min(w, h), x: pad.left + (aw - (u1 - u0) * b) / 2 - u0 * b, y: pad.top + (ah - (v1 - v0) * b) / 2 - v0 * b };
    this.requestDraw();
  }

  focusUv(pts: UV[], minSpan = 0.02) {
    const [u0, v0, u1, v1] = bbox(pts);
    const { w, h } = this.size(), pad = { left: 16, right: 16, top: 16, bottom: 16, ...this.padding };
    const aw = Math.max(50, w - pad.left - pad.right), ah = Math.max(50, h - pad.top - pad.bottom);
    const span = Math.max(u1 - u0, v1 - v0, minSpan) * 1.6;
    this.zoom.active = false;
    // Fit the span into the free area (beside the floating panels), centered there.
    this.view.s = Math.min(MAX_S, Math.max(MIN_S, Math.min(aw, ah) / this.base() / span));
    const b = this.base() * this.view.s;
    this.view.x = pad.left + aw / 2 - ((u0 + u1) / 2) * b;
    this.view.y = pad.top + ah / 2 - ((v0 + v1) / 2) * b;
    this.requestDraw();
  }

  zoomCenter(f: number) {
    const { w, h } = this.size();
    this.zoomBy(f, w / 2, h / 2);
  }

  private applyScale(s: number, mx: number, my: number) {
    const [u, v] = this.toUv(mx, my);
    this.view.s = s;
    const b = this.base() * s;
    this.view.x = mx - u * b;
    this.view.y = my - v * b;
  }
  private stepZoom() {
    const z = this.zoom;
    if (!z.active) return;
    const cur = Math.log(this.view.s), d = Math.log(z.target) - cur;
    if (Math.abs(d) < 0.002) {
      this.applyScale(z.target, z.mx, z.my);
      z.active = false;
      return;
    }
    this.applyScale(Math.exp(cur + d * 0.45), z.mx, z.my);
    this.requestDraw();
  }
  private zoomBy(f: number, mx: number, my: number) {
    const z = this.zoom;
    if (!z.active) z.target = this.view.s;
    z.target = Math.min(MAX_S, Math.max(MIN_S, z.target * f));
    Object.assign(z, { mx, my, active: true });
    this.requestDraw();
  }

  // ---------------------------------------------------------------- groups
  groupOf(kind: 'spawner' | 'enemy', i: number) {
    const { map: m, ci } = this.ex;
    const g = kind === 'spawner' ? m.spawnG?.[ci]?.[i] ?? m.spawnerGroups[i] : m.enemyG?.[ci]?.[i] ?? m.enemyGroups[i];
    return g != null && g >= 0 ? m.groups[g] : null;
  }
  private groupMembers(kind: 'spawner' | 'enemy', i: number): number[] {
    const { map: m, ci } = this.ex;
    const byCond = kind === 'spawner' ? m.spawnG?.[ci] : m.enemyG?.[ci];
    const fallback = kind === 'spawner' ? m.spawnerGroups : m.enemyGroups;
    const g = byCond?.[i] ?? fallback[i];
    if (g == null || g < 0) return [];
    const n = kind === 'spawner' ? m.spawners.length : m.enemySpawners.length, out: number[] = [];
    for (let j = 0; j < n; j++) if ((byCond?.[j] ?? fallback[j]) === g) out.push(j);
    return out;
  }

  // ---------------------------------------------------------------- drawing
  private draw() {
    this.frame = 0;
    if (!this.ex) return;
    this.stepZoom();
    const e = this.ex, m = e.map, P = e.prefs, c = this.canvas;
    const { w, h } = this.size(), dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const S = this.base() * this.view.s, ox = this.view.x, oy = this.view.y;
    const isLoot = e.state.mode === 'loot';
    const hv = this.hover;
    const toScreen = (u: number, v: number) => this.toScreen(u, v);

    ctx.globalAlpha = isLoot && e.score ? 0.6 : 1;
    this.tiles.draw(ctx, m.layers && e.layer != null ? m.layers[e.layer].image : m.image, ox, oy, S, w, h, dpr);
    ctx.globalAlpha = 1;

    let bounds: Path2D | null = null;
    if (m.bounds?.length) {
      const path = new Path2D();
      for (const poly of m.bounds) {
        poly.forEach(([u, v], k) => {
          const [x, y] = toScreen(u, v);
          if (k) path.lineTo(x, y);
          else path.moveTo(x, y);
        });
        path.closePath();
      }
      bounds = path;
    }
    if (bounds && P.bounds) {
      const outside = new Path2D();
      outside.rect(0, 0, w, h);
      outside.addPath(bounds);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fill(outside, 'evenodd');
    }
    if (isLoot && P.heat && this.heat.canvas) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.heat.canvas, ox, oy, S, S);
    }

    // POI outlines and loot zones (region-sized areas only on hover)
    const hoverPoi = hv?.t === 'poi' && this.tipShown ? hv.i : null;
    if (P.pois || P.zones || hoverPoi != null) {
      ctx.save();
      if (bounds) ctx.clip(bounds);
      ctx.lineJoin = 'round';
      m.pois.forEach((p, i) => {
        if (ringsArea(p.outline) > 0.04 && hoverPoi !== i) return;
        if (!e.onLayer('pois', i)) return;
        const z = P.zones ? lootZone(p.threat, p.themes) : null;
        if (!P.pois && !z && hoverPoi !== i) return;
        const sc = isLoot ? e.score?.pois[i] : undefined;
        const dens = sc && sc.sockets && e.score!.max > 0 ? Math.sqrt(sc.score / sc.sockets / e.score!.max) : 0;
        // One path of the merged outline: inner edges between the area's pieces vanish, overlaps fill once.
        ctx.beginPath();
        for (const ring of p.outline) {
          ring.forEach(([u, v], k) => {
            const [x, y] = toScreen(u, v);
            if (k) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.closePath();
        }
        if (hoverPoi === i) {
          ctx.fillStyle = 'rgba(255,255,255,.07)';
          ctx.fill('evenodd');
        }
        // Loot value like the in-game map: a strong red / yellow outline without fill, on a soft dark shadow so it
        // reads on snow too; sparse areas only faintly.
        const value = z && z !== 'sparse' && hoverPoi !== i && !sc?.score;
        ctx.lineWidth = hoverPoi === i ? 1.8 : value ? 1.8 : 1.1;
        ctx.strokeStyle = hoverPoi === i ? '#fff' : sc?.score ? ramp(dens, 0.8) : z ? `rgba(${ZONE_COLORS[z]},${value ? 0.95 : 0.5})` : 'rgba(230,227,220,.2)';
        if (value) {
          ctx.shadowColor = 'rgba(0,0,0,.65)';
          ctx.shadowBlur = 3;
        }
        ctx.stroke();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      });
      ctx.restore();
    }
    if (bounds && P.bounds) {
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = 'rgba(214,181,110,.6)';
      ctx.stroke(bounds);
      ctx.setLineDash([]);
    }

    this.drawFrigate(ctx);

    const r = Math.max(2.4, Math.min(6, 2.2 * Math.sqrt(this.view.s)));
    const k = this.markerScale();
    const socketIcons = this.view.s >= SOCKET_ICON_ZOOM;
    const hcode = (lv: Level | undefined) => (P.height ? heightCode(lv) : 0);
    if (isLoot) {
      // Area-of-effect circles for spawners that carry a radius (e.g. the Pendola Flash Freeze zones): a faint disc
      // under the markers, in the kind's color.
      let areaOrdinal = -1;
      m.spawners.forEach((s, i) => {
        const rad = m.spawnerRadius?.[i] ?? 0;
        if (rad <= 0 || this.ownedSpawner(i)) return;
        areaOrdinal++; // stable per-disc colour, independent of which kinds are shown
        const kind = e.spawnerKind(i);
        if (!kind) return;
        const [x, y] = toScreen(s[0], s[1]);
        const rp = (rad / (m.world?.[2] || 1)) * S;
        if (x + rp < 0 || y + rp < 0 || x - rp > w || y - rp > h) return;
        // A distinct, high-contrast cold hue per zone; the hovered or pinned one brightens.
        const hue = AREA_HUES[areaOrdinal % AREA_HUES.length];
        const active = (hv?.t === 'spawner' && hv.i === i) || (this.pin?.t === 'spawner' && this.pin.i === i);
        ctx.beginPath();
        ctx.arc(x, y, rp, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 70%, 50%, ${active ? 0.3 : 0.07})`; // faint: the outline marks the zone
        ctx.fill();
        ctx.strokeStyle = active ? '#ffffff' : `hsla(${hue}, 90%, 60%, .95)`;
        ctx.lineWidth = active ? 2.2 : 1.5;
        ctx.stroke();
      });
      this.drawGroups(ctx, 'spawner');
      // Spawned spots under the loot dots; map features and exits on top.
      const drawSpawners = (top: boolean) => m.spawners.forEach((s, i) => {
        const kind = e.spawnerKind(i);
        if (!kind || (isFeature(kind) || kind.cat === 'Exits') !== top || this.ownedSpawner(i)) return;
        const p = e.spawnP[i], [x, y] = toScreen(s[0], s[1]);
        if (x < -20 || y < -20 || x > w + 20 || y > h + 20) return;
        const feature = isFeature(kind);
        // With an item: spots whose contents are server-side turn grey (not scored).
        const grey = !!e.score && !feature && kind.cat !== 'Exits';
        // Spawned loot-like spots (snow piles) match the loot dots of their category: small until icon zoom.
        if (lootLike(kind) && !(socketIcons && iconWhenZoomed(kind))) {
          this.dot(ctx, x, y, r * 0.85, grey ? '#8a8a8a' : kind.color, hcode(m.levels.spawners[i]), markerStyle(kind));
          return;
        }
        this.iconMarker(ctx, x, y, this.spawnerSize(kind, p), kind.icon, grey ? '#8a8a8a' : kind.color, {
          hovered: hv?.t === 'spawner' && hv.i === i,
          height: hcode(m.levels.spawners[i]),
          style: markerStyle(kind),
        });
      });
      drawSpawners(false);
      const smallR = (kind: SpotKind) => r * (kind.small ? 0.6 : 0.85);
      if (e.score) {
        for (const i of this.heat.order) {
          const s = m.sockets[i], [x, y] = toScreen(s[0], s[1]), t = Math.sqrt(e.score.sockets[i] / e.score.max), kind = e.cls.socketKind[i];
          this.dot(ctx, x, y, smallR(kind) * (0.8 + 0.45 * t), ramp(t, 0.6 + 0.4 * t), hcode(m.levels.sockets[i]), markerStyle(kind));
        }
      } else {
        m.sockets.forEach((s, i) => {
          if (!e.socketVisible(i)) return;
          const [x, y] = toScreen(s[0], s[1]);
          if (x < -10 || y < -10 || x > w + 10 || y > h + 10) return;
          const kind = e.cls.socketKind[i], style = markerStyle(kind);
          if (socketIcons && iconWhenZoomed(kind)) this.iconMarker(ctx, x, y, MARKER_SIZE.socket * k, kind.icon, kind.color, { height: hcode(m.levels.sockets[i]), style });
          else this.dot(ctx, x, y, smallR(kind), kind.color, hcode(m.levels.sockets[i]), style);
        });
      }
      drawSpawners(true);
      if (hv?.t === 'socket') {
        const s = m.sockets[hv.i], [x, y] = toScreen(s[0], s[1]), kind = e.cls.socketKind[hv.i];
        const R = socketIcons && iconWhenZoomed(kind) && !e.score ? (MARKER_SIZE.socket * k) / 2 : smallR(kind);
        ctx.beginPath();
        shapePath(ctx, markerStyle(kind), x, y, R + 3);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      this.drawPuzzles(ctx, w, h);
    } else {
      // Patrol paths: of the hovered spawner, or of all shown spawners while enemies are filtered.
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      m.enemySpawners.forEach((s, i) => {
        const hovered = hv?.t === 'enemy' && hv.i === i;
        if (!(hovered || (e.state.enemies.size && e.enemyVisible(i)))) return;
        const en = e.enemyMatch(i);
        ctx.strokeStyle = hovered ? 'rgba(255,255,255,.9)' : en != null && en >= 0 ? `${e.enemyColor(en)}b0` : 'rgba(224,96,79,.55)';
        for (const pi of s[6]) {
          ctx.beginPath();
          m.enemyPaths[pi].forEach(([u, v], j) => {
            const [x, y] = toScreen(u, v);
            if (j) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.stroke();
        }
      });
      ctx.setLineDash([]);
      this.drawGroups(ctx, 'enemy');
      m.enemySpawners.forEach((s, i) => {
        if (!e.enemyVisible(i)) return;
        const p = e.enemyP[i], [x, y] = toScreen(s[0], s[1]), en = e.enemyMatch(i);
        const name = en != null && en >= 0 ? e.index.enemies[en]?.name ?? '' : '';
        // Each enemy type in its own colour (the same as in the list), filtered or not; unknown spawners in red.
        const color = en != null && en >= 0 ? e.enemyColor(en) : THREAT;
        // The enemy's ping icon itself, outlined; patrolling spawners get a patrol badge.
        this.enemyGlyph(ctx, x, y, MARKER_SIZE.enemy * k * (0.8 + 0.35 * p), enemyIcon(name), color, {
          patrols: s[6].length > 0, hovered: hv?.t === 'enemy' && hv.i === i, height: hcode(m.levels.enemies[i]),
        });
      });
    }

    if (P.pois) {
      ctx.font = '600 12px Urbanist, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const themes = areaThemes(m), dpr = window.devicePixelRatio || 1, gs = 12, gap = 3;
      m.areas.forEach((a, i) => {
        if (this.view.s < (a.zoom >= 2 ? 1.8 : a.zoom >= 1 ? 1.2 : 0)) return;
        if (e.layer != null && (a.layer ?? 0) !== e.layer) return;
        const [x, y] = toScreen(a.uv[0], a.uv[1]);
        const label = e.areaLabels[i] ?? a.name; // localized by the model
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.strokeText(label, x, y);
        ctx.fillStyle = '#f0ebe0';
        ctx.fillText(label, x, y);
        // Loot categories of the area above its name, white game icons on a soft shadow (as on the in-game map).
        const icons = themes[i].map((t) => THEME_ICONS[t]).filter(Boolean);
        if (!icons.length) return;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.9)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 0.5;
        const left = x - (icons.length * gs + (icons.length - 1) * gap) / 2;
        icons.forEach((icon, n) => {
          const bmp = tintedIcon(icon, '#ffffff', gs * dpr);
          if (bmp) ctx.drawImage(bmp, left + n * (gs + gap), y - 9 - gs, gs, gs);
        });
        ctx.restore();
      });
    }
  }

  /**
   * An ARC enemy: its game ping icon in `color`, without a shape around it, traced with a dark outline (white when
   * hovered) so it reads on snow and dark ground; the patrol and height badges on its corners.
   */
  private enemyGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, sz: number, icon: string, color: string,
    o: { patrols?: boolean; hovered?: boolean; height?: -1 | 0 | 1 }) {
    const dpr = window.devicePixelRatio || 1, px = sz * (o.hovered ? 1.12 : 1), x0 = x - px / 2, y0 = y - px / 2;
    const layer = (tint: string, d: number) => {
      const bmp = tintedIcon(icon, tint, px * dpr);
      if (bmp) for (const [dx, dy] of AROUND) ctx.drawImage(bmp, x0 + dx * d, y0 + dy * d, px, px);
    };
    if (o.hovered) layer('#ffffff', 2.8);
    layer('#06080c', 1.4);
    const bmp = tintedIcon(icon, color, px * dpr);
    if (bmp) ctx.drawImage(bmp, x0, y0, px, px);
    if (o.patrols) patrolMark(ctx, x, y, glyphR(px));
    if (o.height) heightMark(ctx, x, y, glyphR(px), o.height, true);
  }

  /**
   * ARC Frigate (under its condition): every pose the round can pick as a footprint with the Frigate's ping icon (numbered
   * when there are several), the Reclaimer landing ring below its docking entry, and the cargo drop sites. Hovering a
   * pose or its ring highlights both and the cargo sites in its reach.
   */
  private drawFrigate(ctx: CanvasRenderingContext2D) {
    const f = this.ex?.frigate;
    if (!f) return;
    const m = this.ex!.map, S = this.base() * this.view.s, k = this.markerScale(), hv = this.hover;
    const toScreen = (uv: UV) => this.toScreen(uv[0], uv[1]);
    const active = hv && (hv.t === 'frigate' || hv.t === 'reclaimer') ? hv.i : null;
    const reach = new Set(active != null ? f.poses[active].cargo : []);
    ctx.save();
    ctx.lineJoin = 'round';
    f.poses.forEach((p, i) => {
      const on = active === i;
      ctx.beginPath();
      for (const ring of p.outline) {
        ring.forEach((uv, j) => {
          const [x, y] = toScreen(uv);
          if (j) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fillStyle = `rgba(${FRIGATE_RGB},${on ? 0.34 : 0.17})`;
      ctx.fill();
      ctx.setLineDash(on ? [] : [7, 4]);
      ctx.lineWidth = on ? 2.2 : 1.5;
      ctx.strokeStyle = on ? '#ffffff' : `rgba(${FRIGATE_RGB},.95)`;
      ctx.stroke();
    });
    ctx.setLineDash([]);
    const outer = f.reclaimerRadius[1] ?? 0, inner = f.reclaimerRadius[0] ?? 0;
    f.poses.forEach((p, i) => {
      if (!p.reclaimers || !outer) return;
      const on = active === i, [x, y] = toScreen(p.reclaimers), ro = (outer / (m.world?.[2] || 1)) * S, ri = (inner / (m.world?.[2] || 1)) * S;
      ctx.beginPath();
      ctx.arc(x, y, ro, 0, Math.PI * 2);
      if (ri > 1) {
        ctx.moveTo(x + ri, y);
        ctx.arc(x, y, ri, 0, Math.PI * 2, true);
      }
      ctx.fillStyle = `rgba(${RECLAIMER_RGB},${on ? 0.3 : 0.14})`;
      ctx.fill('evenodd');
      ctx.lineWidth = on ? 2.2 : 1.5;
      ctx.strokeStyle = on ? '#ffffff' : `rgba(${RECLAIMER_RGB},.95)`;
      ctx.beginPath();
      ctx.arc(x, y, ro, 0, Math.PI * 2);
      ctx.stroke();
      this.enemyGlyph(ctx, x, y, MARKER_SIZE.enemy * k * 0.8, 'e-reclaimer', `rgb(${RECLAIMER_RGB})`, { hovered: on });
    });
    f.dropsites.forEach((uv, j) => {
      const [x, y] = toScreen(uv), R = 4.5 * k, hot = (hv?.t === 'cargo' && hv.i === j) || reach.has(j);
      ctx.beginPath();
      shapePath(ctx, 'tile', x, y, R);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = hot ? '#ffffff' : OUTLINE;
      ctx.stroke();
      ctx.fillStyle = hot ? `rgb(${FRIGATE_RGB})` : LIGHT;
      ctx.fill();
    });
    f.poses.forEach((p, i) => {
      const [x, y] = toScreen(p.uv), sz = MARKER_SIZE.enemy * k;
      this.enemyGlyph(ctx, x, y, sz, 'e-frigate', `rgb(${FRIGATE_RGB})`, { hovered: active === i });
      if (f.poses.length < 2) return;
      // Pose number badge on the icon's upper right.
      const b = Math.max(6, sz * 0.24), bx = x + glyphR(sz) + b * 0.4, by = y - glyphR(sz) - b * 0.2;
      ctx.beginPath();
      ctx.arc(bx, by, b, 0, Math.PI * 2);
      ctx.fillStyle = DARK;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgb(${FRIGATE_RGB})`;
      ctx.stroke();
      ctx.font = `700 ${Math.round(b * 1.3)}px Urbanist, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = LIGHT;
      ctx.fillText(String(i + 1), bx, by + 0.5);
    });
    ctx.restore();
  }

  /** A plain loot dot (a small leaf for nature), dark-outlined; a chevron above / below marks its height. */
  private dot(ctx: CanvasRenderingContext2D, x: number, y: number, rr: number, fill: string, code: -1 | 0 | 1, style: MarkerStyle = 'dot') {
    ctx.beginPath();
    shapePath(ctx, style === 'leaf' ? 'leaf' : 'dot', x, y, style === 'leaf' ? rr * 1.2 : rr);
    // A dark outline outside the shape (stroked first, the fill covers its inner half): readable on snow and on dark
    // ground alike without shrinking it.
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
    if (code) heightMark(ctx, x, y, rr, code, false);
  }

  /**
   * A marker of size `sz` in one of the shared styles (kinds.ts `markerStyle`, see `shapePath`), the game icon inside:
   * filled shapes in `color` with a dark icon and a dark outline; `ring` a dark disc with ring and icon in `color`
   * (`filled`: a `color` disc); `tile` white with a dark icon; `gate` dark with a light rim and
   * icon. Hovered: a white outline of the same shape around it.
   */
  private iconMarker(ctx: CanvasRenderingContext2D, x: number, y: number, sz: number, icon: string, color: string,
    o: { alpha?: number; hovered?: boolean; height?: -1 | 0 | 1; filled?: boolean; outline?: boolean; style?: MarkerStyle } = {}) {
    const style = o.style ?? 'ring', R = sz / 2;
    const outlined = style === 'ring' && !o.filled;
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.beginPath();
    shapePath(ctx, style, x, y, R);
    if (style === 'tile' || style === 'gate') {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.6)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = style === 'tile' ? LIGHT : 'rgba(18,22,26,.94)';
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = style === 'tile' ? 1 : 1.3;
      ctx.strokeStyle = style === 'tile' ? 'rgba(0,0,0,.55)' : LIGHT;
      ctx.stroke();
    } else {
      if (o.outline !== false) {
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = OUTLINE;
        ctx.stroke();
      }
      ctx.fillStyle = outlined ? 'rgba(18,22,26,.92)' : color;
      ctx.fill();
      if (outlined && o.outline !== false) {
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    }
    const px = sz * ICON_SHARE[style], dpr = window.devicePixelRatio || 1;
    const bmp = tintedIcon(icon, style === 'gate' ? LIGHT : outlined ? color : DARK, px * dpr);
    if (bmp) ctx.drawImage(bmp, x - px / 2, y - px / 2, px, px);
    if (o.hovered) {
      ctx.beginPath();
      shapePath(ctx, style, x, y, R + 3);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    if (o.height) heightMark(ctx, x, y, R, o.height, true);
    ctx.globalAlpha = 1;
  }

  /**
   * Outline the members of a spawner's group: a padded hull (soft fill) and a ring per member. The area only for
   * local groups (hull under 12 % of the playable area); spread-out groups (all backpacks) only get the rings.
   */
  private drawGroup(ctx: CanvasRenderingContext2D, kind: 'spawner' | 'enemy', members: number[], strong: boolean) {
    if (members.length < 2) return;
    const m = this.ex.map, list = kind === 'spawner' ? m.spawners : m.enemySpawners;
    const pts = members.map((j) => this.toScreen(list[j][0], list[j][1]));
    const hull = convexHull(pts), pad = 16;
    const uvHull = convexHull(members.map((j) => [list[j][0], list[j][1]] as [number, number]));
    const playable = m.bounds?.length ? m.bounds.reduce((a, poly) => a + polyArea(poly), 0) : 1;
    const local = uvHull.length < 3 || polyArea(uvHull) < 0.12 * playable;
    const cx = hull.reduce((a, p) => a + p[0], 0) / hull.length, cy = hull.reduce((a, p) => a + p[1], 0) / hull.length;
    let outline: number[][];
    if (hull.length >= 3) {
      outline = hull.map(([x, y]) => {
        const d = Math.hypot(x - cx, y - cy) || 1;
        return [x + ((x - cx) / d) * pad, y + ((y - cy) / d) * pad];
      });
    } else {
      const [[x1, y1], [x2, y2]] = hull, d = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = (-(y2 - y1) / d) * pad, ny = ((x2 - x1) / d) * pad, ex = ((x2 - x1) / d) * pad, ey = ((y2 - y1) / d) * pad;
      outline = [[x1 - ex + nx, y1 - ey + ny], [x2 + ex + nx, y2 + ey + ny], [x2 + ex - nx, y2 + ey - ny], [x1 - ex - nx, y1 - ey - ny]];
    }
    ctx.save();
    if (local) {
      ctx.beginPath();
      outline.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = strong ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.05)';
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1;
      ctx.strokeStyle = strong ? 'rgba(255,255,255,.32)' : 'rgba(255,255,255,.18)';
      ctx.stroke();
    }
    ctx.strokeStyle = strong ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.5)';
    ctx.lineWidth = strong ? 1.5 : 1.1;
    // Each member outlined in its own marker's shape, just outside it.
    members.forEach((j, n) => {
      const [x, y] = pts[n];
      const sk = kind === 'spawner' ? this.ex.spawnerKind(j) ?? this.ex.cls.spawnerKinds[j][0]?.[0] : null;
      const R = sk ? this.spawnerSize(sk, this.ex.spawnP[j]) / 2 : glyphR(MARKER_SIZE.enemy * this.markerScale() * (0.8 + 0.35 * this.ex.enemyP[j]));
      ctx.beginPath();
      shapePath(ctx, sk ? markerStyle(sk) : 'ring', x, y, R + 4);
      ctx.stroke();
    });
    ctx.restore();
  }
  private drawGroups(ctx: CanvasRenderingContext2D, kind: 'spawner' | 'enemy') {
    const pinned = this.pin?.t === kind ? this.pin.i : null;
    const hv = this.hover?.t === kind ? this.hover.i : null;
    if (hv != null && hv !== pinned) this.drawGroup(ctx, kind, this.groupMembers(kind, hv), pinned == null);
    if (pinned != null) this.drawGroup(ctx, kind, this.groupMembers(kind, pinned), true);
  }

  private ownedSpawner(i: number): boolean {
    return guideOwnsSpawner(this.ex.map, this.ex.cond, this.ex.prefs.puzzleDoors, this.activePuzzle, i);
  }
  private drawPuzzles(ctx: CanvasRenderingContext2D, _w: number, _h: number) {
    if (!this.ex.prefs.puzzleDoors) return;
    const k = this.puzzleScale();
    const pins = guidePins(this.ex.map, this.ex.cond, true, this.activePuzzle);
    ctx.save();
    for (const trail of guideTrails(pins)) {
      ctx.setLineDash([5 * k, 4 * k]); ctx.lineWidth = 2; ctx.strokeStyle = trail[0].color;
      ctx.beginPath();
      trail.forEach((pin, i) => { const [x, y] = this.toScreen(...pin.location.uv); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    eligibleEntrances(this.ex.map, this.ex.cond).forEach(({ guide, entrance }, i) => {
      if (!guideEntranceVisible(guide, entrance.id, this.activePuzzle)) return;
      const [x, y] = this.toScreen(...entrance.uv);
      const step = this.activePuzzle?.guideId === guide.id ? visibleSteps(guide, this.ex.cond, this.activePuzzle.layoutId).find((s) => s.entranceIds.includes(entrance.id)) : null;
      const highlighted = this.guideHighlight ? this.guideHighlight.entranceIds.includes(entrance.id) : this.hover?.t === 'entrance' && this.hover.i === i;
      if (step && ['code-delivery', 'staged-fuel', 'workflow'].includes(guide.presentation?.pattern ?? '')) this.puzzlePin(ctx, x, y, PLAIN_PUZZLE_COLOR, k, stepLabel(step), undefined, highlighted);
      else this.iconMarker(ctx, x, y, 15 * k, 'bunker', PLAIN_PUZZLE_COLOR, { hovered: highlighted, outline: false });
    });
    const hoveredGroup = this.hover?.t === 'action' ? pins[this.hover.i]?.groupId : this.tip?.touch && this.tip.target.t === 'action' ? pins[this.tip.target.i]?.groupId : null;
    pins.forEach((pin, i) => {
      const [x, y] = this.toScreen(...pin.location.uv);
      this.puzzlePin(ctx, x, y, pin.color, k, pin.order ?? (this.activePuzzle && ['code-delivery', 'staged-fuel', 'workflow'].includes(this.ex.map.puzzleGuides?.find((g) => g.id === this.activePuzzle?.guideId)?.presentation?.pattern ?? '') ? pin.stepLabel : null), symbolOf(this.ex.map, pin.action.symbol),
        this.guideHighlight ? this.guideHighlight.locationIds.includes(pin.location.id) : (this.hover?.t === 'action' && this.hover.i === i) || (!!hoveredGroup && pin.groupId === hoveredGroup));
    });
    ctx.restore();
  }
  /** Puzzle step marker: a numbered disc, or a sigil disc for an unnumbered step (S22 real sigil images). */
  private puzzlePin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, k: number,
    n: number | string | null, sym: PuzzleSymbol | undefined, hovered: boolean) {
    const R = 7.5 * k;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (hovered) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    // The recoloured sigil image (S22), tinted like the game icons; a plain puzzle icon when the build has none.
    const dpr = window.devicePixelRatio || 1;
    const sigil = (tint: string, px: number) =>
      sym?.image ? tintedImage(symbolUrl(sym.image), tint, px) : tintedIcon('puzzle', tint, px);
    if (n != null) {
      ctx.fillStyle = '#0d0f11';
      ctx.font = `700 ${Math.round(10 * k)}px Urbanist, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), x, y + 0.5);
    } else {
      const px = R * 1.15;
      const bmp = sigil('#0d0f11', px * dpr);
      if (bmp) ctx.drawImage(bmp, x - px / 2, y - px / 2, px, px);
    }
  }

  private guideAt(mx: number, my: number, k: number): Target | null {
    if (!this.ex.prefs.puzzleDoors) return null;
    let best: Target | null = null, distance = (12 * k) ** 2;
    eligibleEntrances(this.ex.map, this.ex.cond).forEach(({ guide, entrance }, i) => {
      if (!guideEntranceVisible(guide, entrance.id, this.activePuzzle)) return;
      const [x, y] = this.toScreen(...entrance.uv), d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < distance) { distance = d; best = { t: 'entrance', i }; }
    });
    // Action pins take priority over the entrance when their positions overlap.
    guidePins(this.ex.map, this.ex.cond, true, this.activePuzzle).forEach((pin, i) => {
      const [x, y] = this.toScreen(...pin.location.uv), d = (x - mx) ** 2 + (y - my) ** 2;
      if (d <= distance) { distance = d; best = { t: 'action', i }; }
    });
    return best;
  }
  private toggleDoor(target: Target): boolean {
    if (target.t !== 'entrance' || !this.ex.prefs.puzzleDoors) return false;
    const ref = eligibleEntrances(this.ex.map, this.ex.cond)[target.i];
    if (!ref) return false;
    this.activePuzzle = selectEntrance(this.activePuzzle, ref);
    this.onPuzzle(this.activePuzzle);
    this.dismissTip();
    return true;
  }
  private toggleActionLayout(target: Target): boolean {
    if (target.t !== 'action' || !this.activePuzzle) return false;
    const currentPins = guidePins(this.ex.map, this.ex.cond, true, this.activePuzzle);
    const pin = currentPins[target.i];
    if (!pin?.location.layoutId) return false;
    const locationId = pin.location.id;
    const nextPuzzle = toggleLayout(this.activePuzzle, pin.location.layoutId);
    const nextPins = guidePins(this.ex.map, this.ex.cond, true, nextPuzzle);
    const nextIndex = nextPins.findIndex((nextPin) => nextPin.location.id === locationId);
    if (nextIndex < 0) return false;
    const reindex = (candidate: Target) => {
      if (candidate.t !== 'action') return candidate;
      const location = currentPins[candidate.i]?.location.id;
      const index = location ? nextPins.findIndex((nextPin) => nextPin.location.id === location) : -1;
      return index >= 0 ? { ...candidate, i: index } : candidate;
    };
    const nextHover = this.hover ? reindex(this.hover) : null;
    const nextTip = this.tip ? { ...this.tip, target: reindex(this.tip.target) } : null;
    target.i = nextIndex;
    this.hover = nextHover;
    this.tip = nextTip;
    this.activePuzzle = nextPuzzle;
    this.onPuzzle(this.activePuzzle);
    this.requestDraw();
    return true;
  }

  // ---------------------------------------------------------------- interaction
  private local(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private hitTest(mx: number, my: number): Target | null {
    const e = this.ex, m = e.map, k = this.markerScale();
    const nearest = (n: number, ok: (i: number) => boolean, pos: (i: number) => [number, number], radius: number) => {
      let best: number | null = null, bestD = radius ** 2;
      for (let i = 0; i < n; i++) {
        if (!ok(i)) continue;
        const [x, y] = this.toScreen(...pos(i)), d = (x - mx) ** 2 + (y - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    if (e.state.mode === 'arc') {
      const i = nearest(m.enemySpawners.length, (j) => e.enemyVisible(j), (j) => [m.enemySpawners[j][0], m.enemySpawners[j][1]], 12 * k);
      if (i != null) return { t: 'enemy', i };
    } else {
      const step = this.guideAt(mx, my, this.puzzleScale());
      if (step) return step;
      const sp = nearest(m.spawners.length, (j) => !!e.spawnerKind(j) && !this.ownedSpawner(j), (j) => [m.spawners[j][0], m.spawners[j][1]], 10 * k);
      if (sp != null) return { t: 'spawner', i: sp };
      const so = nearest(m.sockets.length, (j) => e.socketVisible(j), (j) => [m.sockets[j][0], m.sockets[j][1]], this.view.s >= SOCKET_ICON_ZOOM ? Math.max(9, MARKER_SIZE.socket * k * 0.6) : 9);
      if (so != null) return { t: 'socket', i: so };
    }
    // ARC Frigate: cargo sites and the pose / Reclaimer icons as points, then the landing rings and footprints as areas.
    const f = e.frigate;
    if (f) {
      const cargo = nearest(f.dropsites.length, () => true, (j) => f.dropsites[j], 9 * k);
      if (cargo != null) return { t: 'cargo', i: cargo };
      const pose = nearest(f.poses.length, () => true, (j) => f.poses[j].uv, 14 * k);
      if (pose != null) return { t: 'frigate', i: pose };
      const landing = nearest(f.poses.length, (j) => !!f.poses[j].reclaimers, (j) => f.poses[j].reclaimers!, 12 * k);
      if (landing != null) return { t: 'reclaimer', i: landing };
    }
    const uv = this.toUv(mx, my);
    if (f) {
      const outer = (f.reclaimerRadius[1] ?? 0) / (m.world?.[2] || 1);
      const ring = f.poses.findIndex((p) => p.reclaimers && Math.hypot(p.reclaimers[0] - uv[0], p.reclaimers[1] - uv[1]) <= outer);
      if (ring >= 0) return { t: 'reclaimer', i: ring };
      const pose = f.poses.findIndex((p) => inRings(uv, p.outline));
      if (pose >= 0) return { t: 'frigate', i: pose };
    }
    if (m.bounds?.length && !m.bounds.some((poly) => inPoly(uv, poly))) return null;
    if (e.prefs.pois) {
      let poi: number | null = null, bestA = Infinity;
      m.pois.forEach((p, i) => {
        const a = ringsArea(p.outline);
        if (a < bestA && e.onLayer('pois', i) && inRings(uv, p.outline)) {
          bestA = a;
          poi = i;
        }
      });
      if (poi != null) return { t: 'poi', i: poi };
    }
    // Area-of-effect discs (e.g. Flash Freeze zones): a fallback target when no marker, socket or POI is under the
    // cursor. The nearest disc centre wins, so overlapping zones can be told apart. Loot mode only.
    if (e.state.mode !== 'loot') return null;
    let area: number | null = null, areaD = Infinity;
    m.spawners.forEach((s, i) => {
      const r = m.spawnerRadius?.[i] ?? 0;
      if (r <= 0 || !e.spawnerKind(i) || this.ownedSpawner(i)) return;
      const d = Math.hypot(s[0] - uv[0], s[1] - uv[1]);
      if (d <= r / m.world[2] && d < areaD) {
        areaD = d;
        area = i;
      }
    });
    return area != null ? { t: 'spawner', i: area } : null;
  }

  private hideTip() {
    clearTimeout(this.tipTimer);
    this.tipKey = null;
    this.tipShown = false;
    this.onTip(null);
  }

  /** Hover intent: tooltips open after 120 ms on points, 700 ms on areas (they cover most of the map). */
  private hoverAt(mx: number, my: number) {
    const target = this.hitTest(mx, my);
    const key = target ? `${target.t}${target.i}` : null;
    const prev = this.hover ? `${this.hover.t}${this.hover.i}` : null;
    this.hover = target;
    if (key !== prev) this.requestDraw();
    if (!target) return this.hideTip();
    if (key !== this.tipKey) {
      this.hideTip();
      this.tipKey = key;
      this.tipTimer = window.setTimeout(() => {
        if (this.tipKey !== key) return;
        this.tipShown = true;
        this.onTip({ target, x: mx, y: my, ...this.size() });
        this.requestDraw();
      }, target.t === 'poi' ? 700 : target.t === 'frigate' || target.t === 'reclaimer' ? 300 : 120);
    } else if (this.tipShown) this.onTip({ target, x: mx, y: my, ...this.size() });
  }

  private down(e: PointerEvent) {
    this.zoom.active = false;
    this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.classList.add('dragging');
  }
  private up(e: PointerEvent) {
    const click = this.drag && Math.abs(e.clientX - this.drag.x) + Math.abs(e.clientY - this.drag.y) < 4;
    this.drag = null;
    this.canvas.classList.remove('dragging');
    if (!click) return;
    // A click on a puzzle's door pin reveals/closes that puzzle; otherwise it pins the hovered spawner's group.
    const hv = this.hover;
    if (hv && this.toggleDoor(hv)) {
      if (this.tipShown) {
        const { x, y } = this.local(e);
        this.onTip({ target: hv, x, y, ...this.size() });
      }
      return;
    }
    if (hv && this.toggleActionLayout(hv)) {
      if (this.tipShown && this.tip) this.onTip({ ...this.tip, target: hv, ...this.local(e) });
      return;
    }
    // A click pins the hovered spawner's group (click again or on empty map: unpin).
    const target: Pin | null = hv && (hv.t === 'spawner' || hv.t === 'enemy') ? { t: hv.t, i: hv.i } : null;
    this.pin = target && !(this.pin?.t === target.t && this.pin.i === target.i) ? target : null;
    if (this.tipShown && hv) {
      const { x, y } = this.local(e);
      this.onTip({ target: hv, x, y, ...this.size() });
    }
    this.requestDraw();
  }
  private move(e: PointerEvent) {
    const d = this.drag;
    if (d) {
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) >= 4) this.hideTip();
      this.view.x = d.vx + e.clientX - d.x;
      this.view.y = d.vy + e.clientY - d.y;
      this.requestDraw();
      return;
    }
    const p = this.local(e);
    cancelAnimationFrame(this.hoverFrame);
    this.hoverFrame = requestAnimationFrame(() => this.hoverAt(p.x, p.y));
  }
  private wheel(e: WheelEvent) {
    e.preventDefault();
    this.hideTip();
    const { x, y } = this.local(e);
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 400;
    this.zoomBy(Math.exp(-Math.max(-120, Math.min(120, dy)) * (e.ctrlKey ? 0.02 : 0.006)), x, y);
  }
  private leave() {
    this.hideTip();
    this.hover = null;
    this.requestDraw();
  }

  // ---------------------------------------------------------------- touch
  // One finger pans, two fingers pinch-zoom around their midpoint (and pan with it), a tap opens the tooltip card of
  // the spot under it (or closes it on empty map), a double tap zooms in. The card stays open while panning.
  private touchDown(e: PointerEvent) {
    this.zoom.active = false;
    this.canvas.setPointerCapture(e.pointerId);
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 1) {
      this.tapOk = true;
      this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
    } else {
      this.tapOk = false;
      this.startPinch();
    }
  }
  private startPinch() {
    const [a, b] = [...this.touches.values()];
    const mid = this.local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
    const [u, v] = this.toUv(mid.x, mid.y);
    this.drag = null;
    this.pinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), s0: this.view.s, u, v };
  }
  private touchMove(e: PointerEvent) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX;
    t.y = e.clientY;
    const p = this.pinch;
    if (p && this.touches.size >= 2) {
      const [a, b] = [...this.touches.values()];
      const mid = this.local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      this.view.s = Math.min(MAX_S, Math.max(MIN_S, (p.s0 * Math.hypot(a.x - b.x, a.y - b.y)) / p.d0));
      const s = this.base() * this.view.s;
      this.view.x = mid.x - p.u * s;
      this.view.y = mid.y - p.v * s;
      this.requestDraw();
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (this.tapOk && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP) return;
    this.tapOk = false;
    this.view.x = d.vx + e.clientX - d.x;
    this.view.y = d.vy + e.clientY - d.y;
    this.requestDraw();
  }
  private touchUp(e: PointerEvent, released: boolean) {
    if (!this.touches.delete(e.pointerId)) return;
    if (this.pinch) {
      if (this.touches.size >= 2) this.startPinch();
      else if (this.touches.size === 1) {
        // Back to one finger: keep panning with it from here.
        const [t] = [...this.touches.values()];
        this.pinch = null;
        this.drag = { x: t.x, y: t.y, vx: this.view.x, vy: this.view.y };
      }
      return;
    }
    if (this.touches.size) return;
    this.drag = null;
    if (released && this.tapOk) this.tap(this.local(e));
    this.tapOk = false;
  }
  private tap({ x, y }: { x: number; y: number }) {
    const now = performance.now(), last = this.lastTap;
    const target = this.hitTest(x, y);
    const actionRepeat = target?.t === 'action' && this.hover?.t === 'action' && target.i === this.hover.i;
    if (!actionRepeat && now - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < DOUBLE_TAP_PX) {
      this.lastTap = { t: 0, x: 0, y: 0 };
      this.zoomBy(2, x, y);
      return;
    }
    this.lastTap = { t: now, x, y };
    // Like a click: tapping a door pin reveals/closes its puzzle, else pins the tapped spawner's group.
    const door = target ? this.toggleDoor(target) : false;
    if (!door && target) this.toggleActionLayout(target);
    const pin: Pin | null = !door && target && (target.t === 'spawner' || target.t === 'enemy') ? { t: target.t, i: target.i } : null;
    if (!door) this.pin = pin && !(this.pin?.t === pin.t && this.pin.i === pin.i) ? pin : null;
    this.hover = target;
    if (target) {
      clearTimeout(this.tipTimer);
      this.tipKey = `${target.t}${target.i}`;
      this.tipShown = true;
      this.onTip({ target, x, y, ...this.size(), touch: true });
    } else this.hideTip();
    this.requestDraw();
  }
}
