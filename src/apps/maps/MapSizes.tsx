// "Map sizes": compare the playable area of every map to scale. The overlay canvas stacks every outline on its
// centroid; the map list on the right shows/hides and highlights them. Site-styled cards, Urbanist headings.
import { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLocale } from '../../shared/context/LocaleContext';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { ErrorDisplay } from '../../shared/components/ErrorDisplay';
import { useMapSizes } from './data/useMapData';
import type { MapSize } from './data/types';

/** A distinct, site-palette colour per map (presentation only, so it is not part of the generated data). */
const COLORS: Record<string, string> = {
  Spaceport_01: '#ffd700',
  TheDam_02: '#e0604f',
  FrozenTrail_01: '#4fc3f7',
  TheBlueGate_01: '#cc3099',
  RivenTides_01: '#4caf50',
  BuriedCity_01: '#e88629',
  MountainCompound: '#b0bec5',
};

/** A measured map plus its colour. */
type SizedMap = MapSize & { color: string };

/** The generated size data (sizes.json) with the per-map colour added; a failure shows the shared error state. */
export function MapSizes() {
  const { t } = useLocale();
  const { sizes, error } = useMapSizes();
  const sized = useMemo<SizedMap[]>(() => (sizes ?? []).map((m) => ({ ...m, color: COLORS[m.map] ?? '#b0bec5' })), [sizes]);
  if (error) return <div className="mx-sizes mx-sizes--loading"><ErrorDisplay message={t('maps.sizes.loadError')} /></div>;
  if (!sizes) return <div className="mx-sizes mx-sizes--loading"><LoadingSpinner message={t('maps.sizes.loading')} /></div>;
  if (!sized.length) return <div className="mx-sizes mx-sizes--loading"><p>{t('maps.sizes.empty')}</p></div>;
  return <SizesView sizes={sized} />;
}

function SizesView({ sizes }: { sizes: SizedMap[] }) {
  const { t, formatNumber } = useLocale();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hover, setHover] = useState<string | null>(null);

  const total = sizes.reduce((a, m) => a + m.areaKm2, 0);
  const largest = sizes[0];
  const smallest = sizes[sizes.length - 1];
  const radius = useMemo(() => {
    let r = 0;
    for (const m of sizes) for (const ring of m.rings) for (const [x, y] of ring) r = Math.max(r, Math.abs(x), Math.abs(y));
    return (r || 1) * 1.08;
  }, [sizes]);

  const toggle = (id: string) => setHidden((h) => {
    const next = new Set(h);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const unit = radius > 1600 ? 1000 : 500;
  const step = radius > 1500 ? 200 : 100;
  const atMost = Math.floor(radius / step) * step;
  const gridLines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  for (let v = -atMost; v <= atMost; v += step) {
    gridLines.push({ x1: v, y1: -radius, x2: v, y2: radius, major: v % 500 === 0 });
    gridLines.push({ x1: -radius, y1: v, x2: radius, y2: v, major: v % 500 === 0 });
  }

  const num = (v: number, d = 0) => formatNumber(v, { minimumFractionDigits: d, maximumFractionDigits: d });
  const maxArea = largest.areaKm2;
  const maxLen = Math.max(...sizes.map((m) => m.lengthM));

  return (
    <div className="mx-sizes">
      <div className="mz-wrap">
        <header className="mz-hero">
          <h2 className="mz-hero__title">{t('maps.sizes.title')}</h2>
          <p className="mz-hero__subtitle">{t('maps.sizes.subtitle')}</p>
        </header>

        <div className="mz-stats">
          <Stat label={t('maps.sizes.statMaps')} value={num(sizes.length)} />
          <Stat label={t('maps.sizes.statTotal')} value={`${num(total, 2)} km²`} />
          <Stat label={t('maps.sizes.statLargest')} value={largest.name} sub={`${num(largest.areaKm2, 2)} km²`} />
          <Stat label={t('maps.sizes.statRatio')} value={`${num(largest.areaKm2 / smallest.areaKm2, 1)}×`} sub={`${smallest.name}`} />
        </div>

        <section className="mz-panel">
          <div className="mz-panel__head">
            <h3 className="mz-panel__title">{t('maps.sizes.overlayTitle')}</h3>
          </div>
          <div className="mz-overlay">
            <svg className="mz-stage" viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`} role="img" aria-label={t('maps.sizes.overlayLabel')}>
              <g>
                {gridLines.map((l, i) => (
                  <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={l.major ? 'mz-gridline mz-gridline--major' : 'mz-gridline'} />
                ))}
              </g>
              <circle cx={0} cy={0} r={radius * 0.004} className="mz-origin" />
              {sizes.map((m) => {
                if (hidden.has(m.map)) return null;
                const dim = hover !== null && hover !== m.map;
                return (
                  <g
                    key={m.map}
                    className={`mz-shape${dim ? ' is-dim' : ''}${hover === m.map ? ' is-hot' : ''}`}
                    onMouseEnter={() => setHover(m.map)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {m.rings.map((ring, i) => (
                      <polygon
                        key={i}
                        points={ring.map((p) => `${p[0]},${p[1]}`).join(' ')}
                        fill={m.color}
                        stroke={m.color}
                      />
                    ))}
                    {hover === m.map && (
                      <text x={(m.bbox[0] + m.bbox[2]) / 2} y={m.bbox[1] - radius * 0.014} className="mz-label" fill={m.color}>
                        {m.name}
                      </text>
                    )}
                  </g>
                );
              })}
              <g className="mz-scalebar">
                <line x1={radius - radius * 0.05 - unit} y1={radius - radius * 0.03} x2={radius - radius * 0.05} y2={radius - radius * 0.03} />
                <line x1={radius - radius * 0.05 - unit} y1={radius - radius * 0.042} x2={radius - radius * 0.05 - unit} y2={radius - radius * 0.018} />
                <line x1={radius - radius * 0.05} y1={radius - radius * 0.042} x2={radius - radius * 0.05} y2={radius - radius * 0.018} />
                <text x={radius - radius * 0.05 - unit / 2} y={radius - radius * 0.052} textAnchor="middle">
                  {unit >= 1000 ? `${unit / 1000} km` : `${unit} m`}
                </text>
              </g>
            </svg>
            <ul className="mz-list">
              {sizes.map((m) => (
                <li key={m.map} className={hidden.has(m.map) ? 'is-off' : ''}>
                  <button
                    type="button"
                    onClick={() => toggle(m.map)}
                    onMouseEnter={() => setHover(m.map)}
                    onMouseLeave={() => setHover(null)}
                    title={t('maps.sizes.overlayToggleHint')}
                  >
                    <span className="mz-swatch" style={{ background: m.color }} />
                    <span className="mz-list__name">{m.name}</span>
                    <span className="mz-list__val">{num(m.areaKm2, 2)}</span>
                    {hidden.has(m.map) ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mz-panel">
          <div className="mz-panel__head">
            <div>
              <h3 className="mz-panel__title">{t('maps.sizes.multiplesTitle')}</h3>
              <p className="mz-panel__hint">{t('maps.sizes.multiplesHint')}</p>
            </div>
          </div>
          <div className="mz-multiples">
            {sizes.map((m) => (
              <figure key={m.map} className="mz-tile">
                <svg viewBox={`${-radius} ${-radius} ${radius * 2} ${radius * 2}`} aria-hidden="true">
                  <rect x={-500} y={-500} width={1000} height={1000} className="mz-ref" />
                  <polygon points={m.rings[0].map((p) => `${p[0]},${p[1]}`).join(' ')} fill={m.color} stroke={m.color} />
                </svg>
                <figcaption>
                  <span className="mz-tile__name">{m.name}</span>
                  <span className="mz-tile__area">{num(m.areaKm2, 2)} km²</span>
                  <span className="mz-tile__dims">{num(m.lengthM)} × {num(m.widthM)} m</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <div className="mz-charts">
          <section className="mz-panel">
            <h3 className="mz-panel__title">{t('maps.sizes.areaTitle')}</h3>
            <p className="mz-panel__hint">{t('maps.sizes.areaHint')}</p>
            <div className="mz-bars">
              {sizes.map((m) => (
                <div key={m.map} className="mz-bar">
                  <span className="mz-bar__label">{m.name}</span>
                  <span className="mz-bar__track">
                    <span className="mz-bar__fill" style={{ width: `${(m.areaKm2 / maxArea) * 100}%`, background: m.color }} />
                  </span>
                  <span className="mz-bar__val">{num(m.areaKm2, 2)} km²</span>
                </div>
              ))}
            </div>
          </section>
          <section className="mz-panel">
            <h3 className="mz-panel__title">{t('maps.sizes.dimTitle')}</h3>
            <p className="mz-panel__hint">{t('maps.sizes.dimHint')}</p>
            <div className="mz-bars">
              {sizes.map((m) => (
                <div key={m.map} className="mz-bar">
                  <span className="mz-bar__label">{m.name}</span>
                  <span className="mz-bar__track">
                    <span className="mz-bar__fill mz-bar__fill--length" style={{ width: `${(m.lengthM / maxLen) * 100}%` }} />
                    <span className="mz-bar__inner" style={{ width: `${(m.widthM / maxLen) * 100}%` }} />
                  </span>
                  <span className="mz-bar__val">{num(m.lengthM)} × {num(m.widthM)}</span>
                </div>
              ))}
            </div>
            <div className="mz-key">
              <span><i className="mz-key__swatch mz-key__swatch--length" />{t('maps.sizes.length')}</span>
              <span><i className="mz-key__swatch mz-key__swatch--width" />{t('maps.sizes.width')}</span>
            </div>
          </section>
        </div>

        <section className="mz-panel">
          <table className="mz-table">
            <thead>
              <tr>
                <th>{t('maps.sizes.colMap')}</th>
                <th>{t('maps.sizes.colArea')}</th>
                <th>{t('maps.sizes.colBbox')}</th>
                <th>{t('maps.sizes.colLw')}</th>
                <th>{t('maps.sizes.colDiameter')}</th>
                <th>{t('maps.sizes.colFill')}</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((m) => (
                <tr key={m.map}>
                  <td><span className="mz-swatch" style={{ background: m.color }} />{m.name}</td>
                  <td className="is-hi">{num(m.areaKm2, 3)}</td>
                  <td>{num(m.bboxW)} × {num(m.bboxH)}</td>
                  <td>{num(m.lengthM)} × {num(m.widthM)}</td>
                  <td>{num(m.diameterM)}</td>
                  <td>{num(m.fillPct)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mz-footnote">{t('maps.sizes.footnote')}</p>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="mz-stat">
      <span className="mz-stat__label">{label}</span>
      <span className="mz-stat__value">{value}</span>
      {sub && <span className="mz-stat__sub">{sub}</span>}
    </div>
  );
}
