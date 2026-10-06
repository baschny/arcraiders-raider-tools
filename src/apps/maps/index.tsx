// Maps tool (docs/Maps.md). The embark-api map features page (Loot and ARC modes) on a full-bleed map: map and condition
// switchers float at the top, the collapsible left bar holds the mode switch and the filters (on phones: a bottom
// sheet).
// Data: embark-api map features build, generated with npm run generate:maps (data/useMapData.ts). State lives in the
// URL.
import { useEffect, useRef, useState } from 'react';
import { Crosshair, Package, PanelLeftClose, PanelLeftOpen, RotateCw } from 'lucide-react';
import { useLocale } from '../../shared/context/LocaleContext';
import { ItemIcon } from '../../shared/components/ItemIcon';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { loadAllItems } from '../loot-helper/utils/dataLoader';
import type { ItemsMap } from '../loot-helper/types/item';
import { DATA_BASE, MapLoadError, reloadMapData, useMap, useMapIndex } from './data/useMapData';
import type { MapData, MapIndex } from './data/types';
import { useExplorer } from './model';
import { MapView, type MapViewHandle } from './MapView';
import { Sidebar } from './Sidebar';
import { BottomSheet } from './BottomSheet';
import { useMobile } from './useMobile';
import { ConditionBar, MapBar, ModeSwitch } from './Bars';
import { sanitizeState, useMapState, usePrefs, type MapPatch, type MapState } from './state';
import './styles/main.scss';

const DEFAULT_MAP = 'TheDam_02';

export function MapsApp() {
  const { locale } = useLocale();
  const { index, error: indexError } = useMapIndex();
  const [urlState, set] = useMapState(DEFAULT_MAP);
  const [items, setItems] = useState<ItemsMap | null>(null);
  useEffect(() => {
    loadAllItems(locale).then(setItems, (e) => console.error(e));
  }, [locale]);
  // URL values the data does not know: render with the defaults at once, then clean the URL.
  const preFix = index ? sanitizeState(urlState, index, null, items, DEFAULT_MAP) : null;
  const preState = preFix ? { ...urlState, ...preFix } : urlState;
  const { map, error: mapError } = useMap(index, index?.maps.length ? preState.map : null);
  const fix = index ? sanitizeState(urlState, index, map, items, DEFAULT_MAP) : null;
  const state = fix ? { ...urlState, ...fix } : urlState;
  useEffect(() => {
    if (fix) set(fix);
  });

  const error = indexError ?? mapError ?? (index && !index.maps.length ? new MapLoadError('missing', `${DATA_BASE}/index.json`, 'no maps') : null);
  if (error) return <LoadError error={error} mapName={index?.maps.find((m) => m.map === error.map)?.name ?? error.map} />;
  if (!index || !map) return <LoadingSpinner />;
  return <Explorer index={index} map={map} state={state} set={set} items={items} />;
}

/** Load failure with a retry (a page reload when the data format changed: this page is older than the data). */
function LoadError({ error, mapName }: { error: MapLoadError; mapName: string | null }) {
  const { t, tm } = useLocale();
  const message = error.kind === 'schema' ? t('maps.loader.error.schema')
    : error.kind === 'network' ? t('maps.loader.error.network')
      : mapName ? tm('maps.loader.error.missingMap', { map: mapName })
        : t('maps.loader.error.missing');
  return (
    <div className="mx-load-error">
      <ErrorDisplay message={message} />
      <button className="mx-load-error__retry" onClick={() => (error.kind === 'schema' ? window.location.reload() : reloadMapData())}>
        <RotateCw size={14} /> {error.kind === 'schema' ? t('maps.loader.reloadPage') : t('maps.loader.retry')}
      </button>
    </div>
  );
}

function Explorer({ index, map, state, set, items }: { index: MapIndex; map: MapData; state: MapState; set: (p: MapPatch) => void; items: ItemsMap | null }) {
  const { t } = useLocale();
  const [prefs, setPrefs] = usePrefs();
  const ex = useExplorer(index, map, state, set, prefs, setPrefs, items);
  const mapView = useRef<MapViewHandle>(null);
  const focusPoi = (i: number) => mapView.current?.focusPoi(i);
  const open = prefs.side;
  const mobile = useMobile();
  const [sheet, setSheet] = useState(false);
  // Phones: map and condition bars on top, the sheet (collapsed head, or 60 % of the map) at the bottom.
  const fitPadding = mobile
    ? { left: 12, top: 104, right: 12, bottom: sheet ? Math.round(window.innerHeight * 0.6) : 76 }
    : { left: open ? 372 : 64, top: 120, right: 24, bottom: 24 };
  const item = state.mode === 'loot' ? ex.item : null;

  return (
    <div className={`maps-app mx ${open ? '' : 'mx--collapsed'} ${mobile && sheet ? 'mx--sheet-open' : ''}`}>
      <header className="mx-head">
        <h1>{t('shared.tools.maps')}</h1>
        <GameDataVersion index={index} />
      </header>
      <div className="mx-body">
        <div className="mx-area-map"><MapView ex={ex} handle={mapView} fitPadding={fitPadding} /></div>
        <div className="mx-area-top">
          <MapBar ex={ex} />
          <ConditionBar ex={ex} />
        </div>
        {mobile ? (
          <BottomSheet open={sheet} onOpenChange={setSheet} head={(
            <>
              <ModeSwitch ex={ex} />
              {item && (
                <span className="mx-sheet__item">
                  <ItemIcon itemId={item.id} name={item.name.en} icon={item.imageFilename} rarity={item.rarity} showName={false} />
                  <span>{item.name.en}</span>
                </span>
              )}
            </>
          )}>
            <Sidebar ex={ex} onFocusPoi={focusPoi} />
          </BottomSheet>
        ) : open ? (
          <div className="mx-area-side">
            <div className="mx-side-head">
              <ModeSwitch ex={ex} />
              <button className="mx-side-toggle" onClick={() => setPrefs({ side: false })} title="Hide the side bar"><PanelLeftClose size={16} /></button>
            </div>
            <Sidebar ex={ex} onFocusPoi={focusPoi} />
          </div>
        ) : (
          <button className="mx-side-open" onClick={() => setPrefs({ side: true })} title="Show filters">
            <PanelLeftOpen size={18} />
            {state.mode === 'loot' ? <Package size={16} /> : <Crosshair size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Game data version (game version when known, else the Steam manifest) and build date of the map data. */
function GameDataVersion({ index }: { index: MapIndex }) {
  const { tm, formatDate } = useLocale();
  const built = new Date(index.built);
  const ok = !Number.isNaN(built.getTime());
  const date = ok ? formatDate(built, { dateStyle: 'medium' }) : index.built;
  return (
    <span className="mx-head__version" title={tm('maps.header.gameDataTitle', { manifest: index.manifest, date: ok ? formatDate(built, { dateStyle: 'medium', timeStyle: 'short' }) : index.built })}>
      {tm('maps.header.gameData', { version: index.gameVersion ?? index.manifest, date })}
    </span>
  );
}
