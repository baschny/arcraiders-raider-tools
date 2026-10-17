// Left bar in Quests mode: a list of story quests (Quest Tracker quests with located steps), either the user's open
// quests or the quests with steps on the open map (switch; the search covers all of them). Each quest is a row that
// expands in place: switching it on shows it on the map in its colour and lists its steps right below its name,
// numbered like the quest details. A step with places on the open map focuses them; a step on another map switches to
// it. The details dialog of the Quest Tracker opens from the row, with the same step tracking.
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, ChevronDown, Circle, Crosshair, Info, ListTree, MapPin, Search, X } from 'lucide-react';
import type { ObjectiveView, Quest } from '../quests/types/quest';
import { QuestDetailsModal } from '../quests/components/QuestDetailsModal';
import { progressFromDone } from '../quests/utils/stepProgress';
import { questStepsFor, type PickedQuest } from './data/quests';
import { Help } from './components';
import { radioKeys, radioTab } from './radio';
import type { Explorer } from './model';
import { useMapText } from './text';
import '../quests/styles/details.scss';

export interface StepRef {
  q: number;
  key: string;
}

type ListMode = 'open' | 'map';
const LIST_KEY = 'raider-tools:maps-quest-list';

function storedList(): ListMode | null {
  try {
    const v = localStorage.getItem(LIST_KEY);
    return v === 'open' || v === 'map' ? v : null;
  } catch {
    return null;
  }
}

export function QuestPanel({ ex, onHighlight }: { ex: Explorer; onHighlight: (step: StepRef | null) => void }) {
  const tx = useMapText();
  const [details, setDetails] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [chosenList, setChosenList] = useState<ListMode | null>(storedList);
  // Steps of shown quests are listed unless collapsed (session only).
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const { state, index, questCatalog, questById, picked, progress } = ex;
  const located = new Map(index.quests.map((q) => [q.slug, q.maps]));
  const mapSlug = index.maps.find((m) => m.map === ex.map.map)?.slug ?? state.map;
  const here = (slug: string) => located.get(slug)?.[mapSlug] ?? 0;
  // Visitors without any progress start with the quests of the open map.
  const list: ListMode = chosenList ?? (progress.any ? 'open' : 'map');
  const chooseList = (mode: ListMode) => {
    setChosenList(mode);
    try {
      localStorage.setItem(LIST_KEY, mode);
    } catch {
      // private mode: this session only
    }
  };

  const show = (slug: string) => {
    setCollapsed((c) => new Set([...c].filter((s) => s !== slug)));
    ex.set((cur) => ({ quests: cur.quests.includes(slug) ? cur.quests : [...cur.quests, slug] }));
  };
  const hide = (slug: string) => ex.set((cur) => ({ quests: cur.quests.filter((q) => q !== slug), step: cur.step?.startsWith(`${slug}:`) ? null : cur.step }));
  const toggleSteps = (slug: string) => setCollapsed((c) => (c.has(slug) ? new Set([...c].filter((s) => s !== slug)) : new Set([...c, slug])));
  /** Focus a step: switch to its map when it is elsewhere (the map view focuses the step once it is shown). */
  const focus = (slug: string, key: string, map?: string) => ex.set((cur) => ({
    quests: cur.quests.includes(slug) ? cur.quests : [...cur.quests, slug],
    step: `${slug}:${key}`,
    ...(map && map !== mapSlug ? { map } : {}),
  }));

  const all = (questCatalog ?? []).filter((q) => located.has(q.id));
  const byHereThenName = (a: Quest, b: Quest) => Number(!here(a.id)) - Number(!here(b.id)) || a.name.localeCompare(b.name);
  const needle = query.trim().toLowerCase();
  const rows = needle
    ? all.filter((q) => q.name.toLowerCase().includes(needle) || (q.originalNameEn ?? '').toLowerCase().includes(needle) || q.trader.toLowerCase().includes(needle)).sort(byHereThenName)
    : list === 'open'
      ? all.filter((q) => ['available', 'active'].includes(progress.statusOf(q))).sort(byHereThenName)
      : all.filter((q) => here(q.id)).sort((a, b) => a.name.localeCompare(b.name));
  // Shown quests the list does not contain stay reachable above it.
  const extra = state.quests.filter((slug) => !rows.some((q) => q.id === slug)).map((slug) => questById.get(slug)).filter((q): q is Quest => !!q);

  const row = (quest: Quest) => {
    const q = state.quests.indexOf(quest.id);
    return (
      <QuestRow key={quest.id} ex={ex} quest={quest} picked={q >= 0 ? picked[q] : null} q={q} mapSlug={mapSlug} located={located}
        open={q >= 0 && !collapsed.has(quest.id)} onShow={() => show(quest.id)} onHide={() => hide(quest.id)} onToggleSteps={() => toggleSteps(quest.id)}
        onDetails={() => setDetails(quest.id)} onHighlight={onHighlight} onFocus={(key, map) => focus(quest.id, key, map)} />
    );
  };

  const detailsQuest = details ? questById.get(details) : undefined;
  return (
    <>
      <section className="mx-sec">
        <div className="mx-sec__head">
          <h3>{tx.t('maps.quests.title')}</h3>
          <Help label={tx.t('maps.quests.helpLabel')}>{tx.t('maps.quests.help')}</Help>
          {state.quests.length > 0 && (
            <div className="mx-seg">
              <button onClick={() => ex.set({ quests: [], step: null })} title={tx.t('maps.quests.clearTitle')}><X size={12} />{tx.t('maps.quests.clear')}</button>
            </div>
          )}
        </div>
        <div className="item-search">
          <Search size={15} className="item-search__icon" />
          <input value={query} placeholder={tx.t('maps.quests.searchPlaceholder')} aria-label={tx.t('maps.quests.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
          {query && <button className="item-search__clear" onClick={() => setQuery('')} title={tx.t('maps.search.clear')} aria-label={tx.t('maps.search.clear')}><X size={14} /></button>}
        </div>
        {!needle && (
          <div className="mx-qlist-switch" role="radiogroup" aria-label={tx.t('maps.quests.listLabel')} onKeyDown={radioKeys}>
            <button {...radioTab(list === 'map')} className={list === 'map' ? 'on' : ''} onClick={() => chooseList('map')}>{tx.t('maps.quests.listMap')}</button>
            <button {...radioTab(list === 'open')} className={list === 'open' ? 'on' : ''} onClick={() => chooseList('open')}>{tx.t('maps.quests.listOpen')}</button>
          </div>
        )}
        {!needle && list === 'open' && progress.linked && <p className="mx-empty">{tx.t('maps.quests.linkedNote')}</p>}
      </section>

      {!questCatalog ? <p className="mx-empty">{tx.t('maps.quests.loading')}</p> : (
        <>
          {extra.length > 0 && (
            <section className="mx-sec">
              <div className="mx-qlist__label">{tx.t('maps.quests.shown')}</div>
              <div className="mx-qlist">{extra.map(row)}</div>
            </section>
          )}
          <section className="mx-sec">
            {needle && <div className="mx-qlist__label">{tx.plural('maps.quests.matches', rows.length)}</div>}
            <div className="mx-qlist">{rows.map(row)}</div>
            {!rows.length && (
              <p className="mx-empty">{tx.t(needle ? 'maps.quests.noMatches' : list === 'open' ? 'maps.quests.noOpen' : 'maps.quests.noneHere')}</p>
            )}
          </section>
        </>
      )}

      {detailsQuest && (
        <QuestDetailsModal
          quest={detailsQuest}
          status={progress.statusOf(detailsQuest)}
          objectiveProgress={progressFromDone(detailsQuest.objectiveLeafKeys, progress.doneOf(detailsQuest))}
          questById={questById}
          statusOf={(id) => {
            const other = questById.get(id);
            return other ? progress.statusOf(other) : 'unknown';
          }}
          onToggleStep={progress.linked ? undefined : (key) => progress.toggleStep(detailsQuest, key)}
          onOpenQuest={(id) => setDetails(id)}
          onClose={() => setDetails(null)}
          headerAction={(
            <Link className="quest-card-btn" to={`/quests?focus=${encodeURIComponent(detailsQuest.id)}`} title={tx.t('maps.quests.openTracker')}>
              <ListTree size={16} />
            </Link>
          )}
          renderStepMaps={(node) => (
            <StepMapLinks ex={ex} slug={detailsQuest.id} node={node} mapSlug={mapSlug} located={located} onFocus={(map) => {
              setDetails(null);
              focus(detailsQuest.id, node.key, map);
            }} />
          )}
        />
      )}
    </>
  );
}

/**
 * One quest of the list: a check that shows it on the map (in its colour), its name with where its steps are, and,
 * while shown and not collapsed, its steps right below (expanding / collapsing smoothly).
 */
function QuestRow({ ex, quest, picked, q, mapSlug, located, open, onShow, onHide, onToggleSteps, onDetails, onHighlight, onFocus }: {
  ex: Explorer; quest: Quest; picked: PickedQuest | null; q: number; mapSlug: string; located: Map<string, Record<string, number>>; open: boolean;
  onShow: () => void; onHide: () => void; onToggleSteps: () => void; onDetails: () => void; onHighlight: (step: StepRef | null) => void;
  onFocus: (key: string, map?: string) => void;
}) {
  const tx = useMapText();
  const maps = located.get(quest.id) ?? {};
  const n = maps[mapSlug] ?? 0;
  const status = ex.progress.statusOf(quest);
  const elsewhere = ex.index.maps.filter((m) => m.slug !== mapSlug && maps[m.slug]);
  const where = n ? tx.plural('maps.quests.stepsHere', n) : tx.list(elsewhere.map((m) => ex.names.of(m)));
  return (
    <div className={`mx-qrow ${picked ? 'is-on' : ''} ${open ? 'is-open' : ''} ${n ? '' : 'is-elsewhere'} ${status === 'completed' ? 'is-done' : ''}`}
      style={picked ? ({ '--quest': picked.color } as CSSProperties) : undefined}>
      <div className="mx-qrow__head">
        <button className="mx-qrow__check" role="checkbox" aria-checked={!!picked} onClick={picked ? onHide : onShow}
          title={tx.t(picked ? 'maps.quests.remove' : 'maps.quests.showQuest')} aria-label={`${quest.name}: ${tx.t(picked ? 'maps.quests.remove' : 'maps.quests.showQuest')}`}>
          {picked && <Check size={11} strokeWidth={3} />}
        </button>
        <button className="mx-qrow__title" aria-expanded={open} onClick={picked ? onToggleSteps : onShow}
          title={tx.t(!picked ? 'maps.quests.showQuest' : open ? 'maps.quests.hideSteps' : 'maps.quests.showSteps')}>
          <span className="mx-qrow__name">{quest.name}</span>
          <span className="mx-qrow__sub">
            {status === 'completed' && <CheckCircle2 size={11} />}
            {quest.trader}{where ? ` · ${where}` : ''}
          </span>
        </button>
        <ChevronDown size={15} className="mx-qrow__chevron" aria-hidden />
      </div>
      <div className="mx-qrow__body" aria-hidden={!open}>
        <div className="mx-qrow__inner">
          {picked && (
            <>
              <div className="mx-quest__maps">
                {ex.index.maps.filter((m) => maps[m.slug]).map((m) => (
                  <button key={m.slug} className={m.slug === mapSlug ? 'on' : ''} onClick={() => ex.set({ map: m.slug })} tabIndex={open ? 0 : -1}>
                    {ex.names.of(m)} <small>{tx.num(maps[m.slug])}</small>
                  </button>
                ))}
                <button className="mx-qrow__details" onClick={onDetails} tabIndex={open ? 0 : -1} title={tx.t('maps.quests.details')}>
                  <Info size={12} /> {tx.t('maps.quests.detailsShort')}
                </button>
              </div>
              <ol className="mx-quest__steps">
                {questStepsFor(quest, (key) => !!picked.steps[key]).map((leaf) => (
                  <StepRow key={leaf.key} ex={ex} p={picked} q={q} leaf={leaf} mapSlug={mapSlug} tabbable={open} onHighlight={onHighlight} onFocus={(map) => onFocus(leaf.key, map)} />
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** One step of a shown quest: number, done toggle (manual progress), text, and where it is. */
function StepRow({ ex, p, q, leaf, mapSlug, tabbable, onHighlight, onFocus }: {
  ex: Explorer; p: PickedQuest; q: number; leaf: ObjectiveView; mapSlug: string; tabbable: boolean; onHighlight: (step: StepRef | null) => void;
  onFocus: (map?: string) => void;
}) {
  const tx = useMapText();
  const here = !!p.steps[leaf.key];
  const status = p.states.get(leaf.key)?.status ?? 'locked';
  const done = p.done.has(leaf.key);
  const label = p.labels.get(leaf.key);
  const elsewhere = here || p.anywhere.has(leaf.key) ? [] : (leaf.mapIds ?? []).filter((m) => m !== mapSlug);
  const focused = ex.state.step === `${p.slug}:${leaf.key}`;
  const Toggle = done ? CheckCircle2 : Circle;
  const tab = tabbable ? 0 : -1;
  return (
    <li
      className={`mx-step mx-step--${status} ${done ? 'mx-step--done' : ''} ${here ? 'is-here' : ''} ${focused ? 'is-focused' : ''}`}
      onMouseEnter={() => here && onHighlight({ q, key: leaf.key })}
      onMouseLeave={() => onHighlight(null)}
    >
      <span className={`mx-step__num ${label ? '' : 'is-bullet'}`}>{label ?? ''}</span>
      {ex.progress.linked ? (
        <span className="mx-step__check"><Toggle size={14} /></span>
      ) : (
        <button className="mx-step__check" role="checkbox" aria-checked={done} aria-label={leaf.text} tabIndex={tab}
          title={tx.t(done ? 'quests.steps.markNotDone' : 'quests.steps.markDone')}
          onClick={() => p.quest && ex.progress.toggleStep(p.quest, leaf.key)}>
          <Toggle size={14} />
        </button>
      )}
      {here ? (
        <button className="mx-step__text" onClick={() => onFocus()} title={tx.t('maps.quests.showStep')} tabIndex={tab}>
          {leaf.text}
          {leaf.prompt && <em> · {leaf.prompt}</em>}
        </button>
      ) : (
        <span className="mx-step__text">{leaf.text}</span>
      )}
      {here && <Crosshair size={13} className="mx-step__here" aria-hidden />}
      {p.anywhere.has(leaf.key) && <span className="mx-step__anywhere">{tx.t('maps.quests.anywhere')}</span>}
      {elsewhere.map((m) => (
        <button key={m} className="mx-step__map" onClick={() => onFocus(m)} title={tx.t('maps.quests.showStep')} tabIndex={tab}>
          {leaf.mapNames?.[(leaf.mapIds ?? []).indexOf(m)] ?? m}
        </button>
      ))}
    </li>
  );
}

/** Map links of a step in the details dialog: its places on this map, or the other maps it is on. */
function StepMapLinks({ ex, slug, node, mapSlug, located, onFocus }: {
  ex: Explorer; slug: string; node: ObjectiveView; mapSlug: string; located: Map<string, Record<string, number>>; onFocus: (map?: string) => void;
}) {
  const tx = useMapText();
  const here = !!ex.map.questSteps?.[slug]?.[node.key];
  const maps = (node.mapIds ?? []).filter((m) => m !== mapSlug && located.get(slug)?.[m]);
  if (!here && !maps.length) return null;
  return (
    <>
      {here && (
        <button type="button" className="quest-steps__chip quest-steps__chip--map quest-steps__chip--link" onClick={() => onFocus()} title={tx.t('maps.quests.showStep')}>
          <MapPin size={11} /> {ex.names.of(ex.map)}
        </button>
      )}
      {maps.map((m) => (
        <button key={m} type="button" className="quest-steps__chip quest-steps__chip--map quest-steps__chip--link" onClick={() => onFocus(m)} title={tx.t('maps.quests.showStep')}>
          <MapPin size={11} /> {node.mapNames?.[(node.mapIds ?? []).indexOf(m)] ?? m}
        </button>
      ))}
    </>
  );
}
