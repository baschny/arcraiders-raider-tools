import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import type { GuideAction, PuzzleGuide } from './data/types';
import { available, layoutColor, selectedGuide, stageActionGroups, symbolOf, type GuideSelection } from './data/puzzles';
import { symbolUrl } from './data/useMapData';
import { GameIcon } from './components';
import type { Explorer } from './model';
import { useMapText, type MapText } from './text';

export const actionKey = (type: GuideAction['type']) => `maps.guides.actions.${type}`;
export function guideItemName(ex: Explorer, guide: PuzzleGuide, item: string | undefined, action: GuideAction): string | null {
  if (!item && !action.itemSlug) return action.itemName ?? null;
  const slug = item ?? action.itemSlug;
  // Names are canonical data; never derive them by prettifying a slug or a blueprint name.
  return guide.actions.find((a) => a.itemSlug === slug && a.itemName)?.itemName
    ?? ex.index.items.find((i) => i.slug === slug)?.name
    ?? (slug === action.itemSlug ? action.itemName : undefined) ?? null;
}
export function poolLabel(guide: PuzzleGuide, pool: PuzzleGuide['pools'][number], tx: MapText): string {
  const action = guide.actions.find((a) => a.id === pool.actionId);
  if (action?.type === 'press' && action.order != null && guide.stages.some((s) => s.id === action.stageId && s.activation === 'ordered')) return tx.tm('maps.guides.button', { count: action.order });
  return action?.type === 'collect-fuel-cell' ? tx.t('maps.guides.fuelCellLocations')
    : tx.tm(action?.type === 'press' ? 'maps.guides.buttonGroup' : 'maps.guides.interactionGroup', { count: guide.pools.indexOf(pool) + 1 });
}
export function actionDescription(ex: Explorer, guide: PuzzleGuide, action: GuideAction, tx: MapText): string[] {
  const required = action.inputItem === 'fuel-cell' ? tx.t('maps.guides.fuelCell') : guideItemName(ex, guide, action.inputItem, action);
  const produced = action.outputItem === 'fuel-cell' ? tx.t('maps.guides.fuelCell') : guideItemName(ex, guide, action.outputItem, action);
  return [tx.t(actionKey(action.type)),
    ...(action.inputItem && required ? [tx.tm('maps.guides.requiresItem', { item: required })] : []),
    ...(action.outputItem && produced ? [tx.tm('maps.guides.producesItem', { item: produced })] : []),
    ...(!action.inputItem && !action.outputItem && required ? [required] : []),
  ];
}

export function GuidePanel({ ex, selection, onSelection }: { ex: Explorer; selection: GuideSelection; onSelection: (selection: GuideSelection | null) => void }) {
  const tx = useMapText(), guide = selectedGuide(ex.map, ex.cond, ex.prefs.puzzleDoors, selection);
  if (!guide) return null;
  const local = (key: string, fallback: string) => { const text = tx.t(key); return text === key ? fallback : text; };
  const title = guide.titleKey ? local(guide.titleKey, guide.title) : local(`maps.guides.titles.${guide.id}`, guide.title);
  const entrance = guide.entrances.find((e) => e.id === selection.entranceId)!;
  const stages = guide.stages.filter((s) => available(s, ex.cond));
  const layouts = guide.layouts.filter((l) => available(l, ex.cond));
  const symbols = [...new Set(guide.hints.filter((h) => stages.some((s) => s.id === h.stageId)).flatMap((h) => h.symbols))];
  return <section className="mx-puzzle mx-guide" aria-label={title}>
    <div className="mx-puzzle__head mx-guide__head"><h2>{title}</h2><button type="button" onClick={() => onSelection(null)} aria-label={tx.t('quartermaster.sync.close')}><X size={18} aria-hidden="true" /></button></div>
    {layouts.length > 0 && <label className="mx-guide__layouts">{tx.t('maps.guides.layout')}
      <select value={selection.layoutId ?? ''} onChange={(e) => onSelection({ ...selection, layoutId: e.target.value || null })}>
        <option value="">{tx.t('maps.guides.allLayouts')}</option>
        {layouts.map((l) => <option key={l.id} value={l.id}>{local(`maps.guides.layouts.${l.id}`, l.label)}</option>)}
      </select>
    </label>}
    {layouts.filter((l) => !selection.layoutId || l.id === selection.layoutId).map((l) => <div key={l.id} className="mx-puzzle__variant"><i style={{ '--c': layoutColor(guide, l.id) } as CSSProperties} />{local(`maps.guides.layouts.${l.id}`, l.label)}</div>)}
    {symbols.length > 0 && <div className="mx-puzzle__symbols" aria-label={tx.t('maps.guides.sigilOrder')}>
      {symbols.map((key, i) => { const symbol = symbolOf(ex.map, key); return <span key={key} title={tx.tm('maps.guides.order', { count: i + 1 })} aria-label={tx.tm('maps.guides.order', { count: i + 1 })}>{i > 0 && '→'}
        <GameIcon {...(symbol?.image ? { url: symbolUrl(symbol.image) } : { icon: 'puzzle' })} color="#f5f0e6" size={18} />{i + 1}</span>; })}
    </div>}
    {stages.map((stage) => {
      const groups = stageActionGroups(guide, stage, ex.cond, selection.layoutId);
      const prerequisites = stage.prerequisites.map((id) => guide.stages.find((s) => s.id === id)?.title).filter((v): v is string => !!v);
      return <section key={stage.id} className={`mx-guide__stage ${stage.id === entrance.stageId ? 'is-focused' : ''}`} aria-current={stage.id === entrance.stageId ? 'step' : undefined}>
        <strong>{local(`maps.guides.stages.${guide.id}.${stage.id}`, stage.title)}</strong>
        {prerequisites.length > 0 && <p>{tx.tm('maps.guides.accessAfter', { stages: tx.list(prerequisites) })}</p>}
        <p>{tx.t(`maps.guides.activation.${stage.activation}`)}{stage.required != null && ` · ${tx.tm('maps.guides.required', { count: stage.required })}`}</p>
        {stage.activation === 'ordered' && <p>{tx.t('maps.guides.orderCues')}</p>}
        {groups.map(({ layout, actions }) => <div key={layout?.id ?? 'common'} className="mx-guide__action-group">
          {layout && <strong className="mx-puzzle__variant"><i style={{ '--c': layoutColor(guide, layout.id) } as CSSProperties} />{local(`maps.guides.layouts.${layout.id}`, layout.label)}</strong>}
          <ul>{actions.map((action) => <li key={action.id}>
          {stage.activation === 'ordered' && action.order != null && <b>{action.order}. </b>}
          {actionDescription(ex, guide, action, tx).join(' · ')}
          <span className="mx-guide__detail">{local(`maps.guides.labels.${guide.id}.${action.id}`, action.label)}</span>
          {action.type === 'insert-fuel-cell' && <span className="mx-guide__detail">{tx.t('maps.guides.portableOrder')}</span>}
          {guide.pools.filter((pool) => pool.actionId === action.id && (pool.selection != null || action.locations.some((location) => location.candidate && available(location, ex.cond) && (layout ? location.layoutId === layout.id : !location.layoutId)))).map((pool) => <span key={pool.id} className="mx-guide__detail">{poolLabel(guide, pool, tx)}</span>)}
        </li>)}</ul>
        </div>)}
        {stage.outputs.length > 0 && <p>{tx.tm('maps.guides.outputs', { count: stage.outputs.length })}</p>}
        {guide.indicators.filter((i) => i.stageId === stage.id).map((i) => <p key={i.id}>{i.count != null ? tx.tm('maps.guides.lights', { count: i.count }) : tx.t('maps.guides.lightsUnknown')}</p>)}
      </section>;
    })}
  </section>;
}
