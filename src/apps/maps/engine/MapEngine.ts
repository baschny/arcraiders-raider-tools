// Imperative canvas engine for the map (ported from embark-api tools/map-features/index.html): map texture,
// playable area, POIs and loot zones, item heat map, loot sockets as dots (icons when zoomed in), spawned spots
// and map features as game icons, ARC spawners with patrol paths, and the activity group of the hovered or
// pinned spawner (ringed members + area hull). React feeds it the Explorer model; it reports tooltip targets.
import { THREAT, ZONE_COLORS, enemyIcon, isFeature, lootZone } from '../data/kinds';
import { DATA_BASE, reportTileError } from '../data/useMapData';
import type { Level, MapData, UV } from '../data/types';
import type { MapScore } from '../data/scoring';
import { bbox, convexHull, inPoly, inRings, polyArea, ringsArea } from '../geometry';
import type { Explorer } from '../model';
import { onIconsLoaded, tintedIcon } from './iconAtlas';
import { TileLayer } from './tiles';

export type Target = { t: 'socket' | 'spawner' | 'enemy' | 'poi'; i: number };
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
/** Touch: movement (px) below which a touch still counts as a tap; double tap window (ms) and distance (px). */
const TAP_SLOP = 8, DOUBLE_TAP_MS = 300, DOUBLE_TAP_PX = 30;
export const RAMP: [number, number, number][] = [[80, 160, 220], [90, 200, 190], [230, 215, 90], [235, 150, 60], [225, 80, 60]];
export function ramp(t: number, alpha = 1) {
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
  private tiles = new TileLayer(DATA_BASE, () => this.requestDraw(), reportTileError);

  constructor(wrap: HTMLDivElement, canvas: HTMLCanvasElement, onTip: (tip: TipState | null) => void) {
    this.wrap = wrap;
    this.canvas = canvas;
    this.onTip = onTip;
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
    on(window, 'keydown', (e) => {
      if (e.key === 'Escape' && this.pin) {
        this.pin = null;
        this.requestDraw();
      }
    });
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.hoverFrame);
    clearTimeout(this.tipTimer);
    this.cleanup.forEach((fn) => fn());
  }

  update(ex: Explorer, heat: Heat, padding: Padding = {}) {
    const fresh = !this.ex || this.ex.map !== ex.map;
    // A reloaded copy of the same map (new tile folders after a deploy) keeps the view.
    const refit = !this.ex || this.ex.map.map !== ex.map.map;
    const reset = fresh || this.ex.state.mode !== ex.state.mode || this.ex.ci !== ex.ci;
    this.ex = ex;
    this.heat = heat;
    this.padding = padding;
    if (reset) {
      this.pin = null;
      this.hover = null;
      this.hideTip();
    }
    if (refit) this.fit();
    else this.requestDraw();
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
    return Math.min(1.5, Math.max(1, Math.pow(this.view.s, 0.25)));
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
      ctx.lineWidth = 1.1;
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
        if (z) {
          ctx.fillStyle = `rgba(${ZONE_COLORS[z]},.14)`;
          ctx.fill('evenodd');
        }
        if (hoverPoi === i) {
          ctx.fillStyle = 'rgba(255,255,255,.07)';
          ctx.fill('evenodd');
        }
        ctx.lineWidth = hoverPoi === i ? 1.8 : 1.1;
        ctx.strokeStyle = hoverPoi === i ? '#fff' : sc?.score ? ramp(dens, 0.8) : z ? `rgba(${ZONE_COLORS[z]},.7)` : 'rgba(230,227,220,.2)';
        ctx.stroke();
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

    const r = Math.max(2.4, Math.min(6, 2.2 * Math.sqrt(this.view.s)));
    const k = this.markerScale();
    const socketIcons = this.view.s >= 4.5;
    const hcode = (lv: Level | undefined) => (P.height ? heightCode(lv) : 0);
    if (isLoot) {
      this.drawGroups(ctx, 'spawner');
      const drawSpawners = (features: boolean) => m.spawners.forEach((s, i) => {
        const kind = e.spawnerKind(i);
        if (!kind || isFeature(kind) !== features) return;
        const p = e.spawnP[i], [x, y] = toScreen(s[0], s[1]);
        if (x < -20 || y < -20 || x > w + 20 || y > h + 20) return;
        const sz = (kind.major ? 15 : kind.small ? 10 : 12) * k * (features ? 1 : 0.8 + 0.2 * p);
        const grey = !!e.score && !features;
        this.iconMarker(ctx, x, y, sz, kind.icon, grey ? '#8a8a8a' : kind.color, {
          alpha: features ? (p >= 0.995 ? 1 : 0.55) : 0.5 + 0.5 * p,
          hovered: hv?.t === 'spawner' && hv.i === i,
          height: hcode(m.levels.spawners[i]),
          filled: !!kind.major && !grey,
        });
      });
      drawSpawners(false);
      if (e.score) {
        for (const i of this.heat.order) {
          const s = m.sockets[i], [x, y] = toScreen(s[0], s[1]), t = Math.sqrt(e.score.sockets[i] / e.score.max), kind = e.cls.socketKind[i];
          this.dot(ctx, x, y, r * (kind.small ? 0.6 : 0.85) * (0.8 + 0.45 * t), ramp(t, 0.6 + 0.4 * t), hcode(m.levels.sockets[i]));
        }
      } else {
        m.sockets.forEach((s, i) => {
          if (!e.socketVisible(i)) return;
          const [x, y] = toScreen(s[0], s[1]);
          if (x < -10 || y < -10 || x > w + 10 || y > h + 10) return;
          const kind = e.cls.socketKind[i];
          if (socketIcons && !kind.small) this.iconMarker(ctx, x, y, 11 * k, kind.icon, kind.color, { height: hcode(m.levels.sockets[i]) });
          else this.dot(ctx, x, y, r * (kind.small ? 0.6 : 0.85), kind.color, hcode(m.levels.sockets[i]));
        });
      }
      drawSpawners(true);
      if (hv?.t === 'socket') {
        const s = m.sockets[hv.i], [x, y] = toScreen(s[0], s[1]);
        ctx.beginPath();
        ctx.arc(x, y, (socketIcons ? 6 * k : r) + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
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
        const color = e.state.enemies.size && en != null && en >= 0 ? e.enemyColor(en) : THREAT;
        // Patrolling spawners filled, stationary ones dark with a colored ring.
        this.iconMarker(ctx, x, y, 13 * k * (0.8 + 0.35 * p), enemyIcon(name), color, {
          filled: s[6].length > 0, hovered: hv?.t === 'enemy' && hv.i === i, height: hcode(m.levels.enemies[i]),
        });
      });
    }

    if (P.pois) {
      ctx.font = '600 12px Urbanist, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const a of m.areas) {
        if (this.view.s < (a.zoom >= 2 ? 1.8 : a.zoom >= 1 ? 1.2 : 0)) continue;
        if (e.layer != null && (a.layer ?? 0) !== e.layer) continue;
        const [x, y] = toScreen(a.uv[0], a.uv[1]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.strokeText(a.name, x, y);
        ctx.fillStyle = '#f0ebe0';
        ctx.fillText(a.name, x, y);
      }
    }
  }

  /** Socket marker; height above / below ground pulls the circle into a pin pointing up / down. */
  private dot(ctx: CanvasRenderingContext2D, x: number, y: number, rr: number, fill: string, code: -1 | 0 | 1) {
    ctx.beginPath();
    if (!code) ctx.arc(x, y, rr, 0, Math.PI * 2);
    else {
      const point = code > 0 ? -1 : 1, hh = Math.max(3.5, rr * 1.15), dist = rr + hh, theta = point < 0 ? -Math.PI / 2 : Math.PI / 2, a = Math.acos(rr / dist);
      ctx.moveTo(x, y + point * dist);
      ctx.arc(x, y, rr, theta + a, theta - a + Math.PI * 2);
      ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.stroke();
  }

  /** Game icon on a small disc: dark with a colored ring and icon, or filled (major kinds, patrolling enemies). */
  private iconMarker(ctx: CanvasRenderingContext2D, x: number, y: number, sz: number, icon: string, color: string,
    o: { alpha?: number; hovered?: boolean; height?: -1 | 0 | 1; filled?: boolean } = {}) {
    const R = (sz / 2) * (o.hovered ? 1.2 : 1);
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle = o.filled ? color : 'rgba(18,22,26,.92)';
    ctx.fill();
    ctx.lineWidth = o.hovered ? 2 : 1.1;
    ctx.strokeStyle = o.hovered ? '#fff' : o.filled ? 'rgba(0,0,0,.7)' : color;
    ctx.stroke();
    const px = R * 1.3, dpr = window.devicePixelRatio || 1;
    const bmp = tintedIcon(icon, o.filled ? '#14181c' : color, px * dpr);
    if (bmp) ctx.drawImage(bmp, x - px / 2, y - px / 2, px, px);
    if (o.height) {
      const ty = o.height > 0 ? y - R - 2.5 : y + R + 2.5, d = o.height;
      ctx.beginPath();
      ctx.moveTo(x - 3, ty + d * 1.5);
      ctx.lineTo(x + 3, ty + d * 1.5);
      ctx.lineTo(x, ty - d * 2.5);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
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
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x, y, 10 * this.markerScale(), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  private drawGroups(ctx: CanvasRenderingContext2D, kind: 'spawner' | 'enemy') {
    const pinned = this.pin?.t === kind ? this.pin.i : null;
    const hv = this.hover?.t === kind ? this.hover.i : null;
    if (hv != null && hv !== pinned) this.drawGroup(ctx, kind, this.groupMembers(kind, hv), pinned == null);
    if (pinned != null) this.drawGroup(ctx, kind, this.groupMembers(kind, pinned), true);
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
      const i = nearest(m.enemySpawners.length, (j) => e.enemyVisible(j), (j) => [m.enemySpawners[j][0], m.enemySpawners[j][1]], 11 * k);
      if (i != null) return { t: 'enemy', i };
    } else {
      const sp = nearest(m.spawners.length, (j) => !!e.spawnerKind(j), (j) => [m.spawners[j][0], m.spawners[j][1]], 10 * k);
      if (sp != null) return { t: 'spawner', i: sp };
      const so = nearest(m.sockets.length, (j) => e.socketVisible(j), (j) => [m.sockets[j][0], m.sockets[j][1]], 9);
      if (so != null) return { t: 'socket', i: so };
    }
    if (!e.prefs.pois) return null;
    const uv = this.toUv(mx, my);
    if (m.bounds?.length && !m.bounds.some((poly) => inPoly(uv, poly))) return null;
    let poi: number | null = null, bestA = Infinity;
    m.pois.forEach((p, i) => {
      const a = ringsArea(p.outline);
      if (a < bestA && e.onLayer('pois', i) && inRings(uv, p.outline)) {
        bestA = a;
        poi = i;
      }
    });
    return poi != null ? { t: 'poi', i: poi } : null;
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
      }, target.t === 'poi' ? 700 : 120);
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
    // A click pins the hovered spawner's group (click again or on empty map: unpin).
    const hv = this.hover;
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
    if (now - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < DOUBLE_TAP_PX) {
      this.lastTap = { t: 0, x: 0, y: 0 };
      this.zoomBy(2, x, y);
      return;
    }
    this.lastTap = { t: now, x, y };
    const target = this.hitTest(x, y);
    // Like a click: tapping a spawner pins its group (tap it again to unpin); empty map closes and unpins.
    const pin: Pin | null = target && (target.t === 'spawner' || target.t === 'enemy') ? { t: target.t, i: target.i } : null;
    this.pin = pin && !(this.pin?.t === pin.t && this.pin.i === pin.i) ? pin : null;
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
