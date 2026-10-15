// The map: canvas (engine/MapEngine.ts) plus its overlays — zoom, layers menu, map layer switch, legend, tooltip.
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react';
import { Layers, Maximize, Minus, Plus, X } from 'lucide-react';
import { THREAT, ZONE_COLORS, ZONES, enemyTiming, isFeature, lootZone, tableOptions } from './data/kinds';
import type { Level } from './data/types';
import { eligibleEntrances, guideEntranceVisible, guidePins, selectedGuide, resolveSelection, targetCoordinates, type GuideSelection } from './data/puzzles';
import { GuidePanel, guideActionTooltip } from './GuidePanel';
import { radioKeys, radioTab } from './radio';
import { MapEngine, buildHeat, heightCode, type Padding, type Pin, type TipState } from './engine/MapEngine';
import type { Explorer } from './model';
import type { Prefs } from './state';
import { useMapText } from './text';

export interface MapViewHandle {
  focusPoi: (i: number) => void;
}

export function MapView({ ex, handle, fitPadding }: { ex: Explorer; handle?: Ref<MapViewHandle>; fitPadding?: Padding }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  /** Session-only selection; clearing the filter cannot restore it. */
  const [openedPuzzle, setOpenedPuzzle] = useState<GuideSelection | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const layersToggle = useRef<HTMLButtonElement>(null);
  const { map, prefs, score, layer, socketVisible } = ex;
  const heat = useMemo(() => buildHeat(score, map, socketVisible), [score, map, socketVisible]);
  const loot = ex.state.mode === 'loot';
  const selection = resolveSelection(map, ex.cond, prefs.puzzleDoors && loot, openedPuzzle);
  const puzzlesVisible = selection != null;
  const { t, tm, layer: layerName, zone } = useMapText();

  useEffect(() => {
    const e = new MapEngine(wrap.current!, canvas.current!, setTip, setOpenedPuzzle);
    setEngine(e);
    return () => e.destroy();
  }, []);
  // A new map starts with no puzzle open.
  useEffect(() => setOpenedPuzzle(null), [map]);
  useEffect(() => {
    if (selection !== openedPuzzle) setOpenedPuzzle(selection);
    engine?.update(ex, heat, fitPadding, selection);
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
      {/* The canvas is pointer-only; what it shows is listed (and keyboard operable) in the side bar. */}
      <canvas ref={canvas} role="img" aria-label={tm('maps.canvas.label', { map: ex.names.of(map) })} />
      {tip && engine && (tip.target.t !== 'entrance' || (prefs.puzzleDoors && loot && eligibleEntrances(map, ex.cond).some(({ guide, entrance }, i) => i === tip.target.i && guideEntranceVisible(guide, entrance.id, selection)))) && (tip.target.t !== 'action' || (prefs.puzzleDoors && loot && !!guidePins(map, ex.cond, true, selection)[tip.target.i])) && <Tooltip ex={ex} tip={tip} pinned={engine.pinned()} engine={engine} opened={selection} />}
      <div className="mx-zoom">
        <button onClick={() => engine?.zoomCenter(1.6)} title={t('maps.zoom.in')} aria-label={t('maps.zoom.in')}><Plus size={15} /></button>
        <button onClick={() => engine?.zoomCenter(1 / 1.6)} title={t('maps.zoom.out')} aria-label={t('maps.zoom.out')}><Minus size={15} /></button>
        <button onClick={() => engine?.fit()} title={t('maps.zoom.fit')} aria-label={t('maps.zoom.fit')}><Maximize size={14} /></button>
      </div>
      <div className={`mx-layers ${layersOpen ? 'open' : ''}`} onKeyDown={(e) => {
        // Esc closes the menu (before it reaches the map, where it unpins).
        if (e.key !== 'Escape' || !layersOpen) return;
        e.stopPropagation();
        setLayersOpen(false);
        layersToggle.current?.focus();
      }}>
        <button ref={layersToggle} className="mx-layers__toggle" onClick={() => setLayersOpen(!layersOpen)} aria-expanded={layersOpen}><Layers size={14} /> {t('maps.overlays.title')}</button>
        {layersOpen && (
          <div className="mx-layers__list">
            {loot && score && layerToggle('heat', t('maps.overlays.heat'))}
            {layerToggle('height', t('maps.overlays.height'), t('maps.overlays.heightTitle'))}
            {layerToggle('pois', t('maps.overlays.pois'))}
            {layerToggle('zones', t('maps.overlays.zones'), t('maps.overlays.zonesTitle'))}
            {layerToggle('bounds', t('maps.overlays.bounds'))}
          </div>
        )}
      </div>
      {map.layers && (
        <div className="mx-maplayers" title={t('maps.layers.title')} role="radiogroup" aria-label={t('maps.layers.label')} onKeyDown={radioKeys}>
          {map.layers.map((l, i) => (
            <button key={l.name} {...radioTab(i === layer)} className={i === layer ? 'on' : ''} onClick={() => ex.set({ layer: i })}>{layerName(l.name)}</button>
          ))}
        </div>
      )}
      {((loot && !!score) || (prefs.zones && !(loot && score))) && (
        <div className="mx-legend">
          {loot && score && (<>
            <span>{t('maps.legend.score')}</span>
            <i />
            <span className="mx-legend__ends"><span>{t('maps.legend.low')}</span><span>{t('maps.legend.high')}</span></span>
          </>)}
          {prefs.zones && !(loot && score) && (
            <div className="mx-legend__zones">
              {ZONES.map((z) => <span key={z}><b className={z} style={{ '--zone': `rgb(${ZONE_COLORS[z]})` } as CSSProperties} />{zone(z)}</span>)}
            </div>
          )}
        </div>
      )}
      {puzzlesVisible && <GuidePanel ex={ex} selection={selection} onSelection={setOpenedPuzzle}
        onHighlight={(targets) => engine?.highlightGuide(targets)}
        onFocus={(targets) => {
          const guide = selectedGuide(map, ex.cond, prefs.puzzleDoors, selection);
          if (!guide) return;
          const points = targetCoordinates(guide, ex.cond, selection, targets);
          const poi = map.pois.find((p) => p.ids.some((id) => targets.poiIds.includes(id)));
          // Area geometry helps navigation only; exact verified devices remain highlighted.
          engine?.focusUv(poi && targets.poiIds.length === 1 ? poi.outline.flat() : points, 0.025);
        }} />}
    </div>
  );
}

// ---------------------------------------------------------------- tooltip

function Tooltip({ ex, tip, pinned, engine, opened }: { ex: Explorer; tip: TipState; pinned: Pin | null; engine: MapEngine; opened: GuideSelection | null }) {
  const { target, x, y } = tip;
  const groupOf = (kind: 'spawner' | 'enemy', i: number) => engine.groupOf(kind, i);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 14, top: y + 14 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({ left: Math.max(4, Math.min(x + 14, tip.w - el.offsetWidth - 8)), top: Math.max(4, Math.min(y + 14, tip.h - el.offsetHeight - 8)) });
  }, [x, y, tip.w, tip.h, target]);
  const tx = useMapText();
  const { t, tm, plural } = tx;
  const { map, index, names } = ex;
  // Spawner index -> puzzle index, for the door-pin mechanics and the "reveal" hint.
  const world = (u: number, v: number, z?: number) => {
    const [x0, y0, sx, sy] = map.world ?? [0, 0, 0, 0];
    return sx ? `${Math.round(x0 + u * sx)}, ${Math.round(y0 + v * sy)}${z != null ? `, ${z}` : ''}` : '';
  };
  const heightLine = (lv: Level | undefined) => {
    if (!lv) return null;
    const parts: string[] = [];
    if (map.layers) parts.push(tx.layer(map.layers[lv[0]].name));
    if (lv[1] != null) parts.push(tm('maps.tooltip.height', { height: tx.meters(lv[1]) }), t(lv[2] ? 'maps.tooltip.covered' : 'maps.tooltip.openSky'));
    return parts.length ? `${['', '▲ ', '▼ '].at(heightCode(lv))}${parts.join(' · ')}` : null;
  };
  let kindLabel = '', color: string | undefined, title = '', body: (string | null)[] = [], keys: string[] | null = null, options: { text: string; share: number | null; tier: number | null }[] = [], mechanics: string[] = [];
  let hint: string | null = null;
  const groupLine = (g: { label: string; min: number; max: number; n: number }, key: 'maps.tooltip.groupSpots' | 'maps.tooltip.groupSpawners') =>
    plural(key, g.n, { group: g.label || t('maps.tooltip.group'), min: g.min === g.max ? tx.num(g.min) : `${tx.num(g.min)}–${tx.num(g.max)}` });
  const pinHint = (pinnedHere: boolean) => t(`maps.tooltip.${tip.touch ? 'tap' : 'click'}${pinnedHere ? 'Unpin' : 'Pin'}`);
  const chance = (p: number) => tm('maps.tooltip.spawnChance', { chance: tx.pct(p) });

  if (target.t === 'socket') {
    const s = map.sockets[target.i], kind = ex.cls.socketKind[target.i];
    const p = s[5] >= 0 ? map.pois[s[5]] : null, id = p && s[7] >= 0 ? p.ids?.[s[7]] : null;
    color = kind.color;
    kindLabel = kind.key === 'Ground' ? tx.kind(kind) : `${tx.category(kind.cat)} · ${tx.kind(kind)}`;
    title = s[3] >= 0 ? tx.containerTag(map.containers[s[3]]) : tx.kind(kind);
    const server = map.handlerSets[s[4]].reduce((n, h) => n + (map.handlers[h]?.serverTables || 0), 0);
    body = [
      ex.score ? tm('maps.tooltip.score', { score: tx.score(ex.score.sockets[target.i]) }) : null,
      p ? `${names.poi(p)}${id ? `  ${id}` : ''}` : null,
      world(s[0], s[1], s[2]),
      heightLine(map.levels.sockets[target.i]),
      server ? plural('maps.tooltip.serverTables', server) : null,
    ];
  } else if (target.t === 'spawner') {
    const s = map.spawners[target.i], kinds = ex.cls.spawnerKinds[target.i], shown = ex.spawnerKind(target.i) ?? kinds[0][0];
    const feature = kinds.every(([k]) => isFeature(k));
    color = shown.color;
    kindLabel = tx.category(shown.cat);
    const kindList = tx.list(kinds.map(([k, sh]) => `${tx.kind(k)}${kinds.length > 1 ? ` ${tx.pct(sh)}` : ''}`));
    title = kinds.length > 1 ? tm('maps.tooltip.oneOf', { kinds: kindList }) : kindList;
    keys = ex.cls.spawnerKeys[target.i];
    // Kind mechanics (i18n) plus the spawner's area radius when it has one (areas without a brush, e.g. Flash Freeze).
    mechanics = (shown.mechanics ?? []).map((mech) => tm(`maps.mechanics.${mech.key}`, mech.values ?? {}));
    const radius = map.spawnerRadius?.[target.i] ?? 0;
    if (radius > 0) mechanics.push(tm('maps.mechanics.zoneRadius', { radius: tx.num(Math.round(radius / 100)) }));
    const at = feature && map.spawnerPois[target.i] >= 0 ? names.poi(map.pois[map.spawnerPois[target.i]]) : null;
    const detail = tx.list(map.spawnerClasses[s[2]].split(' | ').filter((c) => !/^(Barricaded|Door|LockedDoor)$|^Key:/.test(c)).map(tx.className));
    const p = ex.spawnP[target.i], g = groupOf('spawner', target.i);
    body = [
      at ? tm('maps.tooltip.inArea', { area: at }) : null,
      feature && detail && detail !== title ? detail : null,
      !feature || p < 1 ? `${chance(p)}${ex.score && !feature ? ` · ${t('maps.tooltip.notScored')}` : ''}` : null,
      g ? groupLine(g, 'maps.tooltip.groupSpots') : null,
      heightLine(map.levels.spawners[target.i]),
      world(s[0], s[1]),
    ];
    if (g) hint = pinHint(pinned?.t === 'spawner' && pinned.i === target.i);
  } else if (target.t === 'enemy') {
    const s = map.enemySpawners[target.i], en = ex.enemyMatch(target.i);
    color = en != null && en >= 0 ? ex.enemyColor(en) : THREAT;
    kindLabel = t('maps.tooltip.arcSpawner');
    title = s[4] ? s[4].replace(/^StaticWorld_/, '').replace(/_/g, ' ') : t('maps.tooltip.enemySpawner');
    options = tableOptions(index, s[4], names.enemy).slice(0, 8).map((o) => (o.missing ? { ...o, text: tm('maps.tooltip.tableNotExported', { table: o.text }) } : o));
    const g = groupOf('enemy', target.i);
    body = [
      map.enemyClasses[s[3]],
      `${chance(ex.enemyP[target.i])}${s[6].length ? ` · ${t('maps.tooltip.patrols')}` : ''}`,
      g ? groupLine(g, 'maps.tooltip.groupSpawners') : null,
      ...enemyTiming(map.enemyProfiles[s[5]] ?? {}).map(tx.timing),
      heightLine(map.levels.enemies[target.i]),
    ];
    if (g) hint = pinHint(pinned?.t === 'enemy' && pinned.i === target.i);
  } else if (target.t === 'action') {
    const guide = selectedGuide(map, ex.cond, ex.prefs.puzzleDoors, opened)!;
    const pin = guidePins(map, ex.cond, true, opened)[target.i];
    const { action, location } = pin;
    const layout = guide.layouts.find((l) => l.id === location.layoutId);
    color = pin.color;
    if (guide.id === 'church' && action.type === 'press') {
      kindLabel = t('maps.guides.church.title');
      const layoutLabel = layout ? tx.t(`maps.guides.layouts.${layout.id}`) : '';
      title = tm('maps.guides.church.buttonLayout', { button: pin.order ?? action.order ?? 0, layout: layoutLabel === `maps.guides.layouts.${layout?.id}` ? layout?.label ?? '' : layoutLabel });
    } else {
      const content = guideActionTooltip(ex, guide, pin, tx);
      kindLabel = guide.title;
      title = content.title;
      body = [...content.body, location.level ? tm('maps.guides.approxHeight', { height: heightLine(location.level) ?? t('maps.guides.heightUnknown') }) : null];
    }
  } else if (target.t === 'entrance') {
    const { guide, entrance } = eligibleEntrances(map, ex.cond)[target.i];
    kindLabel = t('maps.guides.doors');
    title = guide.title;
    body = [heightLine(entrance.level)];
    mechanics = [t(entrance.access === 'mixed' ? 'maps.guides.mixed' : 'maps.guides.puzzleAccess')];
    keys = entrance.access === 'mixed' && entrance.spawnerIndex != null ? ex.cls.spawnerKeys[entrance.spawnerIndex] : null;
    hint = t(opened?.entranceId === entrance.id ? 'maps.tooltip.clickPuzzleClose' : 'maps.tooltip.clickPuzzle');
  } else {
    const p = map.pois[target.i], sc = ex.score?.pois[target.i], z = lootZone(p.threat, p.themes);
    kindLabel = t('maps.tooltip.area');
    title = names.poi(p);
    body = [
      p.ids.join(', '),
      sc ? `${tm('maps.tooltip.score', { score: tx.score(sc.score) })} · ${plural('maps.best.spots', sc.sockets, { hits: tx.num(sc.hits) })}` : null,
      z ? tx.zone(z) : null,
      p.themes.length ? tx.list(p.themes.map(tx.location)) : null,
    ];
  }

  return (
    // A tap opens the tooltip as a card (no hover on touch): it takes touches and has a close button.
    <div ref={ref} className={`mx-tip mx-tip--${target.t} ${tip.touch ? 'mx-tip--card' : ''}`}
      style={{ '--tip-x': `${pos.left}px`, '--tip-y': `${pos.top}px`, ...(color ? { '--tip-c': color } : {}) } as CSSProperties}>
      {tip.touch && <button className="mx-tip__close" onClick={() => engine.dismissTip()} aria-label={t('quartermaster.sync.close')}><X size={14} /></button>}
      <div className="mx-tip__kind">{kindLabel}</div>
      <strong>{title}</strong>
      {keys?.map((k) => <div key={k} className="mx-tip__key">🔑 {k}</div>)}
      {mechanics.map((l, i) => <div key={`mech${i}`} className="mx-tip__mech">ⓘ {l}</div>)}
      {options.map((o, i) => (
        <div key={i} className="mx-tip__opt">{o.tier != null && <span className="m">{tm('maps.tooltip.tier', { tier: tx.num(o.tier) })} </span>}{o.text}{o.share != null && <span className="m"> {tx.pct(o.share)}</span>}</div>
      ))}
      {body.filter(Boolean).map((l, i) => <div key={i} className="m">{l}</div>)}
      {hint && <div className="m mx-tip__hint">{hint}</div>}
    </div>
  );
}
