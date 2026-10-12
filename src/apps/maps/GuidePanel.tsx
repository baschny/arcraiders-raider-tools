import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import type { GuideAction, PuzzleGuide } from './data/types';
import { available, layoutColor, selectedGuide, stageActionGroups, symbolOf, toggleLayout, visibleGroups, visibleSteps, stepColor, stepTargets, type GuidePin, type GuideTargets, type GuideSelection } from './data/puzzles';
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

/** Use only named volumes containing every verified destination, never a nearest-area guess. */
export function guideDestination(ex: Explorer, guide: PuzzleGuide, actionIds: string[]): string | null {
  const locations = guide.actions.filter((a) => actionIds.includes(a.id) && ['insert-code', 'insert-fuel-cell'].includes(a.type) && available(a, ex.cond))
    .flatMap((a) => a.locations.filter((l) => available(l, ex.cond)));
  if (!locations.length) return null;
  const area = (rings: import('./data/types').UV[][]) => Math.abs(rings.reduce((sum, ring) => sum + ring.reduce((n, p, i) => {
    const next = ring[(i + 1) % ring.length]; return n + p[0] * next[1] - next[0] * p[1];
  }, 0), 0));
  const poi = ex.map.pois.filter((p) => locations.every((l) => p.ids.some((id) => l.poiIds?.includes(id))))
    .sort((a, b) => area(a.outline) - area(b.outline))[0];
  return poi ? ex.names?.poi(poi) ?? poi.title : null;
}

/** One functional title and only the useful item/group/alternative information. */
export function guideActionTooltip(ex: Explorer, guide: PuzzleGuide, pin: GuidePin, tx: MapText) {
  const { action, location } = pin;
  const pool = guide.pools.find((p) => p.id === action.poolId);
  const name = guideItemName(ex, guide, action.outputItem ?? action.inputItem, action);
  const alternatives = action.locations.filter((l) => available(l, ex.cond) && l.candidate).length;
  return {
    title: tx.t(action.type === 'print' ? 'maps.guides.workflow.printer' : actionKey(action.type)),
    body: [name,
      action.type === 'print' && alternatives > 1 ? tx.tm('maps.guides.workflow.printerCandidates', { count: alternatives }) : null,
      pool ? poolLabel(guide, pool, tx) : null,
      location.candidate && action.type !== 'print' ? tx.t('maps.guides.workflow.possibleLocation') : null,
    ],
  };
}

export function GuidePanel({ ex, selection, onSelection, onFocus, onHighlight }: { ex: Explorer; selection: GuideSelection; onSelection: (selection: GuideSelection | null) => void; onFocus?: (targets: GuideTargets) => void; onHighlight?: (targets: GuideTargets | null) => void }) {
  const tx = useMapText(), guide = selectedGuide(ex.map, ex.cond, ex.prefs.puzzleDoors, selection);
  if (!guide) return null;
  const local = (key: string, fallback: string) => { const text = tx.t(key); return text === key ? fallback : text; };
  const title = guide.titleKey ? local(guide.titleKey, guide.title) : local(`maps.guides.titles.${guide.id}`, guide.title);
  const entrance = guide.entrances.find((e) => e.id === selection.entranceId)!;
  const stages = guide.stages.filter((s) => available(s, ex.cond));
  const layouts = guide.layouts.filter((l) => available(l, ex.cond));
  const symbols = [...new Set(guide.hints.filter((h) => stages.some((s) => s.id === h.stageId)).flatMap((h) => h.symbols))];
  if (guide.id === 'church') {
    const layoutName = (id: string) => local(`maps.guides.layouts.${id}`, layouts.find((l) => l.id === id)?.label ?? id);
    const lightCount = guide.indicators.find((indicator) => indicator.stageId === entrance.stageId && typeof indicator.count === 'number')?.count;
    return <section className="mx-puzzle mx-guide mx-guide--church" aria-label={title}>
      <div className="mx-puzzle__head mx-guide__head"><h2>{local('maps.guides.church.title', 'Santa Sofia Church - Door puzzle')}</h2><button type="button" onClick={() => onSelection(null)} aria-label={tx.t('quartermaster.sync.close')}><X size={18} aria-hidden="true" /></button></div>
      <p className="mx-guide__rooms">{tx.tm('maps.guides.church.opensRooms', { count: guide.rooms.length })}</p>
      {symbols.length > 0 && <div className="mx-guide__graffiti" aria-label={tx.t('maps.guides.sigilOrder')}>
        {symbols.map((key, i) => { const symbol = symbolOf(ex.map, key); return <div className="mx-guide__graffiti-symbol" key={key}>
          {i > 0 && <span className="mx-guide__graffiti-arrow" aria-hidden="true">→</span>}
          <GameIcon {...(symbol?.image ? { url: symbolUrl(symbol.image) } : { icon: 'puzzle' })} color="#f5f0e6" size={64} />
          <b>{i + 1}</b>
        </div>; })}
      </div>}
      <div className="mx-guide__instructions">
        <p>{tx.t('maps.guides.church.pressButtons')}</p>
        <p>{tx.t('maps.guides.church.layoutEachRaid')}</p>
        {lightCount != null && <p>{tx.tm('maps.guides.lights', { count: lightCount })}</p>}
      </div>
      <div className="mx-guide__layout-legend" role="group" aria-label={tx.t('maps.guides.layout')}>
        {layouts.map((layout) => <button key={layout.id} type="button" className={selection.layoutId === layout.id ? 'is-selected' : ''}
          style={{ '--c': layoutColor(guide, layout.id) } as CSSProperties}
          aria-pressed={selection.layoutId === layout.id} onClick={() => onSelection(toggleLayout(selection, layout.id))}>
          <i style={{ '--c': layoutColor(guide, layout.id) } as CSSProperties} />{layoutName(layout.id)}
        </button>)}
      </div>
    </section>;
  }
  if (guide.presentation) {
    const steps = visibleSteps(guide, ex.cond, selection.layoutId);
    const groups = visibleGroups(guide, ex.cond, selection.layoutId).filter((group) => group.kind !== 'layout');
    const instruction = (step: typeof steps[number]) => {
      const required = guide.stages.find((stage) => step.stageIds.includes(stage.id))?.required;
      const activation = guide.stages.find((stage) => step.stageIds.includes(stage.id))?.activation;
      if (step.role === 'find-buttons') return required != null ? tx.tm('maps.guides.workflow.findCount', { count: required }) : tx.t('maps.guides.workflow.findButtons');
      if (step.role === 'activate-buttons' && required != null && activation === 'unordered' && !steps.some((s) => s.role === 'find-buttons')) return tx.tm('maps.guides.workflow.findPressCount', { count: required });
      if (step.role === 'activate-buttons') return tx.t(activation === 'unordered' ? 'maps.guides.workflow.pressAny' : activation === 'ordered' ? 'maps.guides.workflow.pressOrdered' : 'maps.guides.workflow.press');
      if (step.role === 'print-codes') return tx.tm('maps.guides.workflow.printCodes', { count: step.actionIds.length });
      if (step.role === 'deliver-codes') {
        const location = guideDestination(ex, guide, step.actionIds);
        return location ? tx.tm('maps.guides.workflow.insertCodesAt', { location }) : tx.t('maps.guides.workflow.insertCodes');
      }
      if (step.role === 'deliver-fuel') {
        const location = guideDestination(ex, guide, step.actionIds);
        return location ? tx.tm('maps.guides.workflow.fuelAt', { location }) : tx.t('maps.guides.workflow.fuel');
      }
      if (step.role === 'outcome') return tx.t('maps.guides.workflow.open');
      return guide.stages.find((stage) => step.stageIds.includes(stage.id))?.title ?? tx.t('maps.guides.workflow.interact');
    };
    const links = (targets: GuideTargets, label: string) => targets.locationIds.length + targets.entranceIds.length > 0 ? <button type="button" className="mx-guide__map-link"
      onMouseEnter={() => onHighlight?.(targets)} onMouseLeave={() => onHighlight?.(null)} onFocus={() => onHighlight?.(targets)} onBlur={() => onHighlight?.(null)} onClick={() => { onHighlight?.(targets); onFocus?.(targets); }}>
      {label}
    </button> : null;
    return <section className="mx-puzzle mx-guide mx-guide--workflow" aria-label={title}>
      <div className="mx-puzzle__head mx-guide__head"><h2>{title}</h2><button type="button" onClick={() => onSelection(null)} aria-label={tx.t('quartermaster.sync.close')}><X size={18} aria-hidden="true" /></button></div>
      <ol className="mx-guide__steps">{steps.map((step) => {
        const targets = stepTargets(guide, ex.cond, selection, step);
        return <li key={step.id} style={{ '--c': stepColor(step.number) } as CSSProperties} className={step.stageIds.includes(entrance.stageId) && step.role !== 'outcome' ? 'is-focused' : ''} aria-current={step.stageIds.includes(entrance.stageId) && step.role !== 'outcome' ? 'step' : undefined}>
          <b className="mx-guide__step-number" aria-hidden="true">{step.number}</b>
          <div><p>{instruction(step)}</p>{links(targets, tx.t('maps.guides.workflow.showMap'))}</div>
        </li>;
      })}</ol>
      {guide.presentation.pattern === 'staged-fuel' && <p className="mx-guide__note">{tx.t('maps.guides.portableOrder')}</p>}
      {groups.length > 0 && <div className="mx-guide__group-legend" role="group" aria-label={tx.t('maps.guides.workflow.locations')}>
        {groups.map((group) => {
          const label = group.kind === 'item' ? group.itemName ?? guide.actions.find((a) => group.actionIds.includes(a.id) && a.itemName)?.itemName
            : guide.actions.some((a) => group.actionIds.includes(a.id) && a.type === 'collect-fuel-cell') ? tx.t('maps.guides.fuelCellLocations')
            : tx.tm('maps.guides.buttonGroup', { count: group.number });
          if (!label) return null;
          const targets = { locationIds: group.locationIds, entranceIds: [], poiIds: group.poiIds };
          return <div key={group.id} style={{ '--c': stepColor(group.number) } as CSSProperties}>
            {group.kind !== 'item' && <i aria-hidden="true" />}{links(targets, label)}
          </div>;
        })}
      </div>}
    </section>;
  }
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
