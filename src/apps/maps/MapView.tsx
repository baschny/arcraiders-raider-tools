// The map: canvas (engine/MapEngine.ts) plus its overlays — zoom, layers menu, map layer switch, legend, tooltip.
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react';
import { Layers, Maximize, Minus, Plus } from 'lucide-react';
import { CATEGORY, THREAT, ZONE_COLORS, ZONE_LABELS, className, containerTagLabel, enemyTiming, isFeature, lootZone, tableOptions } from './data/kinds';
import { fmtScore } from './data/scoring';
import type { Level } from './data/types';
import { MapEngine, buildHeat, heightCode, type Padding, type Pin, type TipState } from './engine/MapEngine';
import type { Explorer } from './model';
import type { Prefs } from './state';

export interface MapViewHandle {
  focusPoi: (i: number) => void;
}

export function MapView({ ex, handle, fitPadding }: { ex: Explorer; handle?: Ref<MapViewHandle>; fitPadding?: Padding }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const { map, prefs, score, layer, socketVisible } = ex;
  const heat = useMemo(() => buildHeat(score, map, socketVisible), [score, map, socketVisible]);
  const loot = ex.state.mode === 'loot';

  useEffect(() => {
    const e = new MapEngine(wrap.current!, canvas.current!, setTip);
    setEngine(e);
    return () => e.destroy();
  }, []);
  useEffect(() => {
    engine?.update(ex, heat, fitPadding);
  });
  useImperativeHandle(handle, () => ({
    focusPoi: (i: number) => {
      if (map.layers && map.levels.pois[i] !== layer) ex.set({ layer: map.levels.pois[i] });
      engine?.focusUv(map.pois[i].outline.flat(), 0.02);
    },
  }), [engine, map, layer, ex]);

  const layerToggle = (key: keyof Prefs, label: string, title?: string) => (
    <label title={title}><input type="checkbox" checked={prefs[key]} onChange={(e) => ex.setPrefs({ [key]: e.target.checked })} /> {label}</label>
  );

  return (
    <div ref={wrap} className="mx-map">
      <canvas ref={canvas} />
      {tip && engine && <Tooltip ex={ex} tip={tip} pinned={engine.pinned()} engine={engine} />}
      <div className="mx-zoom">
        <button onClick={() => engine?.zoomCenter(1.6)} title="Zoom in"><Plus size={15} /></button>
        <button onClick={() => engine?.zoomCenter(1 / 1.6)} title="Zoom out"><Minus size={15} /></button>
        <button onClick={() => engine?.fit()} title="Fit map (double-click)"><Maximize size={14} /></button>
      </div>
      <div className={`mx-layers ${layersOpen ? 'open' : ''}`}>
        <button className="mx-layers__toggle" onClick={() => setLayersOpen(!layersOpen)}><Layers size={14} /> Layers</button>
        {layersOpen && (
          <div className="mx-layers__list">
            {loot && score && layerToggle('heat', 'Heat map')}
            {layerToggle('height', 'Height marks', 'A point on top: more than 3.5 m above the estimated ground (upper floor, roof); underneath: more than 3.5 m below (basement, tunnel). Estimated from the heightmap; not on Stella Montis.')}
            {layerToggle('pois', 'Areas & names')}
            {layerToggle('zones', 'Loot zones', 'In-game loot zones: red = abundant, yellow = dense, grey = sparse.')}
            {layerToggle('bounds', 'Playable area')}
          </div>
        )}
      </div>
      {map.layers && (
        <div className="mx-maplayers" title="Map layer: the in-game map switches when you enter these areas">
          {map.layers.map((l, i) => (
            <button key={l.name} className={i === layer ? 'on' : ''} onClick={() => ex.set({ layer: i })}>{l.name}</button>
          ))}
        </div>
      )}
      {loot && score && (
        <div className="mx-legend">
          <span>Item score per spot</span>
          <i />
          <span className="mx-legend__ends"><span>low</span><span>high</span></span>
        </div>
      )}
      {prefs.zones && !(loot && score) && (
        <div className="mx-legend mx-legend--zones">
          {Object.entries(ZONE_LABELS).map(([z, l]) => <span key={z}><b style={{ background: `rgb(${ZONE_COLORS[z]})` }} />{l}</span>)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- tooltip

function Tooltip({ ex, tip, pinned, engine }: { ex: Explorer; tip: TipState; pinned: Pin | null; engine: MapEngine }) {
  const { target, x, y } = tip;
  const groupOf = (kind: 'spawner' | 'enemy', i: number) => engine.groupOf(kind, i);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 14, top: y + 14 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({ left: Math.max(4, Math.min(x + 14, tip.w - el.offsetWidth - 8)), top: Math.max(4, Math.min(y + 14, tip.h - el.offsetHeight - 8)) });
  }, [x, y, tip.w, tip.h, target]);
  const { map, index } = ex;
  const world = (u: number, v: number, z?: number) => {
    const [x0, y0, sx, sy] = map.world ?? [0, 0, 0, 0];
    return sx ? `${Math.round(x0 + u * sx)}, ${Math.round(y0 + v * sy)}${z != null ? `, ${z}` : ''}` : '';
  };
  const heightLine = (lv: Level | undefined) => {
    if (!lv) return null;
    const parts: string[] = [];
    if (map.layers) parts.push(map.layers[lv[0]].name);
    if (lv[1] != null) parts.push(`≈ ${lv[1] > 0 ? '+' : ''}${(lv[1] / 10).toFixed(1)} m vs ground`, lv[2] ? 'covered' : 'open sky');
    return parts.length ? `${['', '▲ ', '▼ '].at(heightCode(lv))}${parts.join(' · ')}` : null;
  };
  let kindLabel = '', color: string | undefined, title = '', body: (string | null)[] = [], keys: string[] | null = null, options: { text: string; share: number | null; tier: number | null }[] = [];
  let hint: string | null = null;

  if (target.t === 'socket') {
    const s = map.sockets[target.i], kind = ex.cls.socketKind[target.i];
    const p = s[5] >= 0 ? map.pois[s[5]] : null, id = p && s[7] >= 0 ? p.ids?.[s[7]] : null;
    color = kind.color;
    kindLabel = kind.key === 'Ground' ? 'Ground loot' : `${CATEGORY.get(kind.cat)?.label} · ${kind.label}`;
    title = s[3] >= 0 ? containerTagLabel(map.containers[s[3]]) : 'Ground loot';
    const server = map.handlerSets[s[4]].reduce((n, h) => n + (map.handlers[h]?.serverTables || 0), 0);
    body = [
      ex.score ? `score ${fmtScore(ex.score.sockets[target.i])}` : null,
      p ? `${p.title}${id ? `  ${id}` : ''}` : null,
      world(s[0], s[1], s[2]),
      heightLine(map.levels.sockets[target.i]),
      server ? `+ ${server} server-side loot table${server > 1 ? 's' : ''} (contents not in the files)` : null,
    ];
  } else if (target.t === 'spawner') {
    const s = map.spawners[target.i], kinds = ex.cls.spawnerKinds[target.i], shown = ex.spawnerKind(target.i) ?? kinds[0][0];
    const feature = kinds.every(([k]) => isFeature(k));
    color = shown.color;
    kindLabel = CATEGORY.get(shown.cat)?.label ?? 'Spawn point';
    title = `${kinds.length > 1 ? 'One of: ' : ''}${kinds.map(([k, sh]) => `${k.label}${kinds.length > 1 ? ` ${Math.round(sh * 100)}%` : ''}`).join(', ')}`;
    keys = ex.cls.spawnerKeys[target.i];
    const at = feature && map.spawnerPois[target.i] >= 0 ? map.pois[map.spawnerPois[target.i]].title : null;
    const detail = map.spawnerClasses[s[2]].split(' | ').filter((c) => !/^(Barricaded|Door|LockedDoor)$|^Key:/.test(c)).map(className);
    const p = ex.spawnP[target.i], g = groupOf('spawner', target.i);
    body = [
      at ? `in ${at}` : null,
      feature && detail.length && detail.join(', ') !== title ? detail.join(', ') : null,
      !feature || p < 1 ? `spawn chance ~${Math.round(p * 100)}%${ex.score && !feature ? ' · contents server-side (not scored)' : ''}` : null,
      g ? `${g.label || 'group'}: ${g.min === g.max ? g.min : `${g.min}–${g.max}`} of ${g.n} spots (ringed)` : null,
      heightLine(map.levels.spawners[target.i]),
      world(s[0], s[1]),
    ];
    if (g) hint = pinned?.t === 'spawner' && pinned.i === target.i ? 'click to unpin the group' : 'click to pin the group';
  } else if (target.t === 'enemy') {
    const s = map.enemySpawners[target.i], en = ex.enemyMatch(target.i);
    color = ex.state.enemies.size && en != null && en >= 0 ? ex.enemyColor(en) : THREAT;
    kindLabel = 'ARC spawner';
    title = s[4] ? s[4].replace(/^StaticWorld_/, '').replace(/_/g, ' ') : 'Enemy spawner';
    options = tableOptions(index, s[4]).slice(0, 8);
    const g = groupOf('enemy', target.i);
    body = [
      map.enemyClasses[s[3]],
      `spawn chance ~${Math.round(ex.enemyP[target.i] * 100)}%${s[6].length ? ' · patrols a path' : ''}`,
      g ? `${g.label || 'group'}: ${g.min === g.max ? g.min : `${g.min}–${g.max}`} of ${g.n} spawners (ringed)` : null,
      ...enemyTiming(map.enemyProfiles[s[5]] ?? {}),
      heightLine(map.levels.enemies[target.i]),
    ];
    if (g) hint = pinned?.t === 'enemy' && pinned.i === target.i ? 'click to unpin the group' : 'click to pin the group';
  } else {
    const p = map.pois[target.i], sc = ex.score?.pois[target.i], z = lootZone(p.threat, p.themes);
    kindLabel = 'Area';
    title = p.title;
    body = [
      p.ids.join(', '),
      sc ? `score ${fmtScore(sc.score)} · ${sc.hits}/${sc.sockets} spots` : null,
      z ? ZONE_LABELS[z] : null,
      p.themes.length ? p.themes.join(', ') : null,
    ];
  }

  return (
    <div ref={ref} className={`mx-tip mx-tip--${target.t}`} style={{ left: pos.left, top: pos.top, ...(color ? { '--tip-c': color } : {}) } as CSSProperties}>
      <div className="mx-tip__kind">{kindLabel}</div>
      <strong>{title}</strong>
      {keys && (keys.length ? keys.map((k) => <div key={k} className="mx-tip__key">🔑 {k}</div>) : <div className="mx-tip__key mx-tip__key--none">no key item (opens another way)</div>)}
      {options.map((o, i) => (
        <div key={i} className="mx-tip__opt">{o.tier != null && <span className="m">tier {o.tier} </span>}{o.text}{o.share != null && <span className="m"> {Math.round(o.share * 100)}%</span>}</div>
      ))}
      {body.filter(Boolean).map((l, i) => <div key={i} className="m">{l}</div>)}
      {hint && <div className="m mx-tip__hint">{hint}</div>}
    </div>
  );
}
