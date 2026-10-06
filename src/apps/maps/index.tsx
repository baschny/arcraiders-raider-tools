// Maps — PROTOTYPE. The embark-api map features page (Loot and ARC modes) on a full-bleed map: map and condition
// switchers float at the top, the collapsible left bar holds the mode switch and the filters.
// Data: embark-api map features build, synced with npm run sync:map-proto. State lives in the URL.
import { useEffect, useRef, useState } from 'react';
import { Crosshair, Package, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useLocale } from '../../shared/context/LocaleContext';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { loadAllItems } from '../loot-helper/utils/dataLoader';
import type { ItemsMap } from '../loot-helper/types/item';
import { useMap, useMapIndex } from './data/useMapData';
import type { MapData, MapIndex } from './data/types';
import { useExplorer } from './model';
import { MapView, type MapViewHandle } from './MapView';
import { Sidebar } from './Sidebar';
import { ConditionBar, MapBar, ModeSwitch } from './Bars';
import { useMapState, usePrefs, type MapPatch, type MapState } from './state';
import './styles/main.scss';

export function MapsApp() {
  const { locale } = useLocale();
  const { index, error } = useMapIndex();
  const [state, set] = useMapState('TheDam_02');
  const map = useMap(index, state.map);
  const [items, setItems] = useState<ItemsMap | null>(null);
  useEffect(() => {
    loadAllItems(locale).then(setItems, (e) => console.error(e));
  }, [locale]);

  if (error) return <ErrorDisplay message={error} />;
  if (!index || !map) return <LoadingSpinner />;
  return <Explorer index={index} map={map} state={state} set={set} items={items} />;
}

function Explorer({ index, map, state, set, items }: { index: MapIndex; map: MapData; state: MapState; set: (p: MapPatch) => void; items: ItemsMap | null }) {
  const [prefs, setPrefs] = usePrefs();
  const ex = useExplorer(index, map, state, set, prefs, setPrefs, items);
  const mapView = useRef<MapViewHandle>(null);
  const focusPoi = (i: number) => mapView.current?.focusPoi(i);
  const open = prefs.side;
  const fitPadding = { left: open ? 372 : 64, top: 120, right: 24, bottom: 24 };

  return (
    <div className={`maps-app mx ${open ? '' : 'mx--collapsed'}`}>
      <header className="mx-head">
        <h1>Maps <span className="mx-head__badge">Prototype</span></h1>
        <span className="mx-head__version">Game data {index.manifest}</span>
      </header>
      <div className="mx-body">
        <div className="mx-area-map"><MapView ex={ex} handle={mapView} fitPadding={fitPadding} /></div>
        <div className="mx-area-top">
          <MapBar ex={ex} />
          <ConditionBar ex={ex} />
        </div>
        {open ? (
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
