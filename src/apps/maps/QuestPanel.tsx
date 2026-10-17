// Left bar in Quests mode: pick story quests (Quest Tracker quests with located steps), then each picked quest in its
// colour with its steps numbered like the quest details. A step with places on the open map focuses them; a step on
// another map switches to it. The details dialog of the Quest Tracker opens from here, with the same step tracking.
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Crosshair, Info, ListTree, MapPin, Search, X } from 'lucide-react';
import type { ObjectiveView } from '../quests/types/quest';
import { QuestDetailsModal } from '../quests/components/QuestDetailsModal';
import { progressFromDone } from '../quests/utils/stepProgress';
import { questStepsFor } from './data/quests';
import { Help } from './components';
import type { Explorer } from './model';
import { useMapText } from './text';
import '../quests/styles/details.scss';

export interface StepRef {
  q: number;
  key: string;
}

export function QuestPanel({ ex, onHighlight }: { ex: Explorer; onHighlight: (step: StepRef | null) => void }) {
  const tx = useMapText();
  const [details, setDetails] = useState<string | null>(null);
  const { state, index, questCatalog, questById, picked, progress } = ex;
  const located = useMemo(() => new Map(index.quests.map((q) => [q.slug, q.maps])), [index]);
  const mapSlug = index.maps.find((m) => m.map === ex.map.map)?.slug ?? state.map;

  const add = (slug: string) => ex.set((cur) => ({ quests: cur.quests.includes(slug) ? cur.quests : [...cur.quests, slug] }));
  const remove = (slug: string) => ex.set((cur) => ({ quests: cur.quests.filter((q) => q !== slug), step: cur.step?.startsWith(`${slug}:`) ? null : cur.step }));
  /** Focus a step: switch to its map when it is elsewhere (the map view focuses the step once it is shown). */
  const focus = (slug: string, key: string, map?: string) => ex.set((cur) => ({
    quests: cur.quests.includes(slug) ? cur.quests : [...cur.quests, slug],
    step: `${slug}:${key}`,
    ...(map && map !== mapSlug ? { map } : {}),
  }));

  // Quick picks: the tracker's open quests (available or started) with located steps, those on this map first.
  const open = useMemo(() => {
    if (!questCatalog || progress.linked) return [];
    return questCatalog
      .filter((q) => located.has(q.id) && !state.quests.includes(q.id) && ['available', 'active'].includes(progress.statusOf(q)))
      .sort((a, b) => Number(!located.get(a.id)?.[mapSlug]) - Number(!located.get(b.id)?.[mapSlug]) || a.name.localeCompare(b.name));
  }, [questCatalog, located, state.quests, progress, mapSlug]);

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
        {!questCatalog ? <p className="mx-empty">{tx.t('maps.quests.loading')}</p> : (
          <QuestSearch ex={ex} located={located} onPick={add} />
        )}
        {open.length > 0 && (
          <div className="mx-qpicks">
            <div className="mx-qpicks__label">{tx.t('maps.quests.openQuests')}</div>
            {open.slice(0, 10).map((q) => (
              <button key={q.id} onClick={() => add(q.id)} className={located.get(q.id)?.[mapSlug] ? '' : 'is-elsewhere'}>
                <span>{q.name}</span>
                <small>{located.get(q.id)?.[mapSlug] ? tx.plural('maps.quests.stepsHere', located.get(q.id)![mapSlug]) : tx.t('maps.quests.otherMaps')}</small>
              </button>
            ))}
          </div>
        )}
        {progress.linked && <p className="mx-empty">{tx.t('maps.quests.linkedNote')}</p>}
      </section>

      {picked.map((p, q) => (
        <section key={p.slug} className="mx-sec mx-quest" style={{ '--quest': p.color } as CSSProperties}>
          <div className="mx-quest__head">
            <span className="mx-quest__swatch" />
            <button className="mx-quest__name" onClick={() => p.quest && setDetails(p.slug)} title={tx.t('maps.quests.details')}>
              {p.quest?.name ?? p.slug}
            </button>
            {p.quest && (
              <button className="mx-quest__btn" onClick={() => setDetails(p.slug)} title={tx.t('maps.quests.details')} aria-label={tx.t('maps.quests.details')}><Info size={14} /></button>
            )}
            <button className="mx-quest__btn" onClick={() => remove(p.slug)} title={tx.t('maps.quests.remove')} aria-label={tx.t('maps.quests.remove')}><X size={14} /></button>
          </div>
          <div className="mx-quest__maps">
            {index.maps.filter((m) => located.get(p.slug)?.[m.slug]).map((m) => (
              <button key={m.slug} className={m.slug === mapSlug ? 'on' : ''} onClick={() => ex.set({ map: m.slug })}>
                {ex.names.of(m)} <small>{tx.num(located.get(p.slug)![m.slug])}</small>
              </button>
            ))}
          </div>
          {p.quest && (
            <ol className="mx-quest__steps">
              {questStepsFor(p.quest, (key) => !!p.steps[key]).map((leaf) => (
                <StepRow key={leaf.key} ex={ex} q={q} leaf={leaf} mapSlug={mapSlug} onHighlight={onHighlight} onFocus={(map) => focus(p.slug, leaf.key, map)} />
              ))}
            </ol>
          )}
        </section>
      ))}

      {detailsQuest && (
        <QuestDetailsModal
          quest={detailsQuest}
          status={progress.statusOf(detailsQuest)}
          objectiveProgress={progress.linked ? undefined : progressFromDone(detailsQuest.objectiveLeafKeys, progress.doneOf(detailsQuest))}
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

/** Quest search over the located story quests (name, then trader). */
function QuestSearch({ ex, located, onPick }: { ex: Explorer; located: Map<string, Record<string, number>>; onPick: (slug: string) => void }) {
  const tx = useMapText();
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return (ex.questCatalog ?? [])
      .filter((quest) => located.has(quest.id) && !ex.state.quests.includes(quest.id))
      .filter((quest) => quest.name.toLowerCase().includes(n) || (quest.originalNameEn ?? '').toLowerCase().includes(n) || quest.trader.toLowerCase().includes(n))
      .slice(0, 12);
  }, [q, ex.questCatalog, ex.state.quests, located]);
  const pick = (slug: string) => {
    onPick(slug);
    setQ('');
  };
  return (
    <div className="item-search">
      <Search size={15} className="item-search__icon" />
      <input
        value={q}
        placeholder={tx.t('maps.quests.searchPlaceholder')}
        aria-label={tx.t('maps.quests.searchPlaceholder')}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) pick(hits[0].id);
          if (e.key === 'Escape') setQ('');
        }}
      />
      {hits.length > 0 && (
        <ul className="item-search__results">
          {hits.map((quest) => (
            <li key={quest.id}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(quest.id)}>
                <MapPin size={16} />
                <span>{quest.name}</span>
                <small>{quest.trader}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One step of a picked quest: number, done toggle (manual progress), text, and where it is. */
function StepRow({ ex, q, leaf, mapSlug, onHighlight, onFocus }: {
  ex: Explorer; q: number; leaf: ObjectiveView; mapSlug: string; onHighlight: (step: StepRef | null) => void; onFocus: (map?: string) => void;
}) {
  const tx = useMapText();
  const p = ex.picked[q];
  const here = !!p.steps[leaf.key];
  const status = p.states.get(leaf.key)?.status ?? 'locked';
  const done = p.done.has(leaf.key);
  const label = p.labels.get(leaf.key);
  const elsewhere = here ? [] : (leaf.mapIds ?? []).filter((m) => m !== mapSlug);
  const focused = ex.state.step === `${p.slug}:${leaf.key}`;
  const Toggle = done ? CheckCircle2 : Circle;
  return (
    <li
      className={`mx-step mx-step--${status} ${here ? 'is-here' : ''} ${focused ? 'is-focused' : ''}`}
      onMouseEnter={() => here && onHighlight({ q, key: leaf.key })}
      onMouseLeave={() => onHighlight(null)}
    >
      <span className={`mx-step__num ${label ? '' : 'is-bullet'}`}>{label ?? ''}</span>
      {ex.progress.linked ? (
        <span className="mx-step__check"><Toggle size={14} /></span>
      ) : (
        <button className="mx-step__check" role="checkbox" aria-checked={done} aria-label={leaf.text}
          title={tx.t(done ? 'quests.steps.markNotDone' : 'quests.steps.markDone')}
          onClick={() => p.quest && ex.progress.toggleStep(p.quest, leaf.key)}>
          <Toggle size={14} />
        </button>
      )}
      {here ? (
        <button className="mx-step__text" onClick={() => onFocus()} title={tx.t('maps.quests.showStep')}>
          {leaf.text}
          {leaf.prompt && <em> · {leaf.prompt}</em>}
        </button>
      ) : (
        <span className="mx-step__text">{leaf.text}</span>
      )}
      {here && <Crosshair size={13} className="mx-step__here" aria-hidden />}
      {elsewhere.map((m) => (
        <button key={m} className="mx-step__map" onClick={() => onFocus(m)} title={tx.t('maps.quests.showStep')}>
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
