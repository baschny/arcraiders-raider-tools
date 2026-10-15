import { useState, type ReactNode } from 'react';
import { ArrowRight, Store } from 'lucide-react';
import { ItemIcon } from '../../../shared/components/ItemIcon';
import { useItemOverlay } from './overlayContext';
import { fieldLabel, useText } from '../text';
import type { UpdateChange, UpdateEntry, UpdateRelease, UpdateSection } from '../types';
import { RefName, RefTile, ValueView } from './Values';

/** Long sections (a major update has hundreds of recipes) show this many records until expanded. */
const COLLAPSED = 30;
/** New/removed items are a tile grid; this many tiles until expanded. */
const COLLAPSED_TILES = 48;

/** Changes that read as a badge (a mode or objective that appeared or vanished), not as before/now. */
const isPresenceChange = (c: UpdateChange) =>
  c.field === 'scenarios' || (c.field === 'objective' && (c.before == null || c.after == null));

function OpBadge({ op }: { op: UpdateEntry['op'] }) {
  const { t } = useText();
  return <span className={`up-op up-op--${op}`}>{t(`updates.ops.${op}`)}</span>;
}

function ShowAll({ total, onClick }: { total: number; onClick: () => void }) {
  const { format } = useText();
  return (
    <button type="button" className="up-more" onClick={onClick}>
      {format('updates.showAll', { n: total })}
    </button>
  );
}

/**
 * The record a panel is about, as one line: icon and name (items open the item overlay), the
 * rewards of an offer, or the record's image and name.
 */
function Subject({ entry, release }: { entry: UpdateEntry; release: UpdateRelease }) {
  const rewards = entry.offer?.rewards;
  if (rewards && typeof rewards === 'object' && 'items' in rewards && rewards.items.length) {
    return (
      <span className="up-subject">
        {rewards.items.map((e, i) => <RefTile key={`${e.ref}-${i}`} refKey={e.ref} release={release} amount={e.amount > 1 ? e.amount : undefined} size={48} layout="inline" />)}
      </span>
    );
  }
  const image = release.refs[entry.ref]?.icon;
  if (entry.ref.startsWith('item:')) return <span className="up-subject"><RefTile refKey={entry.ref} release={release} size={48} layout="inline" /></span>;
  return (
    <span className="up-subject">
      {image && <img className="up-subject__image" src={image} alt="" />}
      <span className="up-subject__name"><RefName refKey={entry.ref} release={release} /></span>
    </span>
  );
}

/** A label line spanning the before and now columns, with its content. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="up-detail">
      <span className="up-detail__label">{label}</span>
      <div className="up-detail__value">{children}</div>
    </div>
  );
}

function formatWindow(start: string | null | undefined, end: string | null | undefined, locale: string): string | null {
  if (!start && !end) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return `${start ? fmt(start) : '…'} – ${end ? fmt(end) : '…'}`;
}

/** What an added or removed offer or quest contains. */
function Details({ entry, release }: { entry: UpdateEntry; release: UpdateRelease }) {
  const { t, locale, format } = useText();
  const rows: ReactNode[] = [];
  const offer = entry.offer;
  if (offer && entry.op !== 'changed') {
    if (offer.cost != null) {
      rows.push(
        <DetailRow key="cost" label={t('updates.fields.cost')}>
          {typeof offer.cost === 'number'
            ? <span className="up-value">{format('updates.offer.scrapValue', { value: offer.cost.toLocaleString(locale) })}</span>
            : <ValueView value={offer.cost} release={release} />}
        </DetailRow>,
      );
    }
    if (offer.trader) rows.push(<DetailRow key="trader" label={t('updates.offer.trader')}><span className="up-value up-value--text"><RefName refKey={offer.trader} release={release} /></span></DetailRow>);
    const period = formatWindow(offer.start, offer.end, locale);
    if (period) rows.push(<DetailRow key="window" label={t('updates.offer.window')}><span className="up-value up-value--text">{period}</span></DetailRow>);
    if (offer.limit != null) rows.push(<DetailRow key="limit" label={t('updates.fields.limit')}><span className="up-value">{offer.limit}</span></DetailRow>);
  }
  const quest = entry.quest;
  if (quest && entry.op === 'added') {
    if (quest.trader) rows.push(<DetailRow key="giver" label={t('updates.quest.giver')}><span className="up-value up-value--text"><RefName refKey={quest.trader} release={release} /></span></DetailRow>);
    if (quest.maps?.length) rows.push(<DetailRow key="maps" label={t('updates.fields.maps')}><ValueView value={{ refs: quest.maps }} release={release} /></DetailRow>);
    if (quest.rewards) rows.push(<DetailRow key="rewards" label={t('updates.fields.completeRewards')}><ValueView value={quest.rewards} release={release} /></DetailRow>);
  }
  return rows.length ? <div className="up-details">{rows}</div> : null;
}

/** One record: subject on the left; field changes as Before | Now, or the content of a new record. */
function RecordPanel({ entry, release, section }: { entry: UpdateEntry; release: UpdateRelease; section: Exclude<UpdateSection, 'highlights'> }) {
  const { t, text, format } = useText();
  const changes = entry.changes ?? [];
  const presence = changes.filter(isPresenceChange);
  const compared = changes.filter((c) => !isPresenceChange(c));
  const label = (c: UpdateChange) => (c.label ? `${fieldLabel({ ...c, key: undefined }, t)}: ${text(c.label)}` : fieldLabel(c, t));
  return (
    <article className={`up-record up-record--${entry.op}`}>
      <header className="up-record__head">
        <OpBadge op={entry.op} />
        <Subject entry={entry} release={release} />
        {/* What the record is, so a card keeps its context when the section title is scrolled away. */}
        <span className="up-record__type">{t(`updates.recordType.${section}`)}</span>
      </header>
      {presence.length > 0 && (
        <ul className="up-presence">
          {presence.map((c, i) => (
            <li key={`p-${i}`}>
              <OpBadge op={c.before == null ? 'added' : 'removed'} />
              <span>{label(c)}</span>
            </li>
          ))}
        </ul>
      )}
      {compared.length > 0 && (
        // Field | Before → Now: Before recessed and muted, Now at full contrast.
        <div className="up-diff" role="table">
          <div className="up-diff__row up-diff__row--head" role="row">
            <span role="columnheader" />
            <span role="columnheader" className="up-diff__before">{t('updates.before')}</span>
            <span aria-hidden="true" className="up-diff__arrow" />
            <span role="columnheader" className="up-diff__now">{format('updates.now', { title: release.title })}</span>
          </div>
          {compared.map((c, i) => (
            <div className="up-diff__row" role="row" key={`${c.field}-${c.key ?? ''}-${i}`}>
              <span role="rowheader" className="up-diff__field">{label(c)}</span>
              <div role="cell" className="up-diff__before"><ValueView value={c.before} release={release} change={c} other={c.after} mark="removed" /></div>
              <span aria-hidden="true" className="up-diff__arrow"><ArrowRight size={16} /></span>
              <div role="cell" className="up-diff__now"><ValueView value={c.after} release={release} change={c} other={c.before} mark="added" /></div>
            </div>
          ))}
        </div>
      )}
      <Details entry={entry} release={release} />
    </article>
  );
}


/** Item category of a catalog item ("Backpack charm"), for the offer subtitle. */
function useCategoryOf() {
  const { items } = useItemOverlay();
  return (refKey: string) => (refKey.startsWith('item:') ? items[refKey.slice(5)]?.categoryName : undefined);
}

/** Small icons of the items accepted as payment of a value cost. */
function Accepts({ refs }: { refs: string[] }) {
  const { items, open } = useItemOverlay();
  return (
    <span className="up-accepts">
      {refs.map((r) => {
        const item = r.startsWith('item:') ? items[r.slice(5)] : undefined;
        if (!item) return null;
        return (
          <button
            key={r}
            type="button"
            className="up-accepts__item"
            title={item.name}
            onClick={(e) => {
              e.stopPropagation();
              open(item.id, e.currentTarget);
            }}
          >
            <ItemIcon itemId={item.id} name={item.name} icon={item.icon} rarity={item.rarity} showName={false} />
          </button>
        );
      })}
    </span>
  );
}

/** One offer of a trader card: reward, its category, the cost and the purchase limit. */
function OfferRow({ entry, release }: { entry: UpdateEntry; release: UpdateRelease }) {
  const { t, locale, format } = useText();
  const categoryOf = useCategoryOf();
  const { items } = useItemOverlay();
  const offer = entry.offer!;
  const rewards = offer.rewards && typeof offer.rewards === 'object' && 'items' in offer.rewards ? offer.rewards.items : [];
  const first = rewards[0];
  return (
    <div className="up-offer">
      <div className="up-offer__reward">
        {first && first.ref.startsWith('item:') && items[first.ref.slice(5)]
          ? <RefTile refKey={first.ref} release={release} size={64} hideName />
          : <span className="up-offer__glyph"><Store size={26} /></span>}
      </div>
      <div className="up-offer__text">
        <span className="up-offer__name">
          {rewards.map((e, i) => (
            <span key={`${e.ref}-${i}`}>{i > 0 && ', '}{e.amount > 1 ? `${e.amount}× ` : ''}<RefName refKey={e.ref} release={release} /></span>
          ))}
        </span>
        {first && categoryOf(first.ref) && <span className="up-offer__type">{categoryOf(first.ref)}</span>}
        <span className="up-offer__cost">
          {typeof offer.cost === 'number' ? (
            <>
              <span className="up-offer__value">{format('updates.offer.scrapValue', { value: offer.cost.toLocaleString(locale) })}</span>
              {offer.accepts && <Accepts refs={offer.accepts} />}
            </>
          ) : (
            <ValueView value={offer.cost ?? null} release={release} />
          )}
        </span>
      </div>
      {offer.limit != null && <span className="up-offer__limit">{format('updates.offer.limit', { n: offer.limit })}</span>}
      {entry.op !== 'added' && <span className="up-offer__op">{t(`updates.ops.${entry.op}`)}</span>}
    </div>
  );
}

/** New offers grouped by trader and availability, as the studio announces them (one card per trader week). */
function OfferCards({ entries, release }: { entries: UpdateEntry[]; release: UpdateRelease }) {
  const { t, locale } = useText();
  const groups = new Map<string, UpdateEntry[]>();
  for (const e of entries) {
    const o = e.offer!;
    const key = `${o.trader ?? ''}|${o.start ?? ''}|${o.end ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return (
    <>
      {[...groups.entries()].map(([key, list]) => {
        const o = list[0].offer!;
        const traderName = o.trader ? <RefName refKey={o.trader} release={release} /> : null;
        const portrait = o.trader ? release.refs[o.trader]?.icon : undefined;
        const period = formatWindow(o.start, o.end, locale);
        return (
          <div key={key} className="up-trader">
            <div className="up-trader__head">
              {portrait
                ? <img className="up-trader__portrait" src={portrait} alt="" />
                : <span className="up-trader__portrait up-trader__portrait--glyph"><Store size={26} /></span>}
              <span className="up-trader__title">
                <span className="up-trader__name">{traderName ?? t('updates.offer.trader')}</span>
                {period && <span className="up-trader__period">{period}</span>}
              </span>
              <span className="up-count">{list.length}</span>
            </div>
            <div className="up-trader__offers">
              {list.map((e) => <OfferRow key={e.ref} entry={e} release={release} />)}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** New and removed items: What's New style tile grids. */
function ItemGrids({ entries, release }: { entries: UpdateEntry[]; release: UpdateRelease }) {
  const { t } = useText();
  const [expanded, setExpanded] = useState(false);
  const groups = (['added', 'removed'] as const).map((op) => ({ op, entries: entries.filter((e) => e.op === op) })).filter((g) => g.entries.length);
  return (
    <>
      {groups.map((g) => {
        const shown = expanded ? g.entries : g.entries.slice(0, COLLAPSED_TILES);
        return (
          <div key={g.op} className={`up-grid-group up-grid-group--${g.op}`}>
            <h3 className="up-grid-group__title">
              {t(`updates.ops.${g.op}`)} <span className="up-count">{g.entries.length}</span>
            </h3>
            <div className="up-grid">
              {shown.map((e) => <RefTile key={e.ref} refKey={e.ref} release={release} size={64} layout="stack" />)}
            </div>
            {g.entries.length > shown.length && <ShowAll total={g.entries.length} onClick={() => setExpanded(true)} />}
          </div>
        );
      })}
    </>
  );
}

/** New and removed skills: two compact lists with each skill's description. */
function SkillLists({ entries, release }: { entries: UpdateEntry[]; release: UpdateRelease }) {
  const { t, text } = useText();
  const groups = (['added', 'removed'] as const)
    .map((op) => ({ op, entries: entries.filter((e) => e.op === op) }))
    .filter((g) => g.entries.length);
  return (
    <div className="up-skills">
      {groups.map((g) => (
        <div key={g.op} className={`up-skills__group up-skills__group--${g.op}`}>
          <h3 className="up-grid-group__title">
            {t(`updates.skills.${g.op}`)} <span className="up-count">{g.entries.length}</span>
          </h3>
          <ul className="up-skills__list">
            {g.entries.map((e) => {
              const ref = release.refs[e.ref];
              return (
                <li key={e.ref} className="up-skill">
                  {ref?.icon ? <img className="up-skill__icon" src={ref.icon} alt="" loading="lazy" /> : <span className="up-skill__icon" />}
                  <span className="up-skill__text">
                    <span className="up-skill__name"><RefName refKey={e.ref} release={release} /></span>
                    {ref?.description && <span className="up-skill__desc">{text(ref.description)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function SectionBody({ section, entries, release }: { section: Exclude<UpdateSection, 'highlights'>; entries: UpdateEntry[]; release: UpdateRelease }) {
  const [expanded, setExpanded] = useState(false);
  if (section === 'items') return <ItemGrids entries={entries} release={release} />;
  // New and removed enemies: a tile grid like the items; changed ones as before/now records.
  if (section === 'enemies') {
    const tiles = entries.filter((e) => e.op !== 'changed');
    const changed = entries.filter((e) => e.op === 'changed');
    return (
      <>
        {tiles.length > 0 && <ItemGrids entries={tiles} release={release} />}
        {changed.length > 0 && <div className="up-records">{changed.map((e) => <RecordPanel key={e.ref} entry={e} release={release} section={section} />)}</div>}
      </>
    );
  }
  // Offers: new ones on trader cards; skills: new and removed ones as lists; the rest as records.
  const cards = section === 'offers' ? entries.filter((e) => e.op === 'added' && e.offer) : [];
  const skills = entries.filter((e) => e.op !== 'changed' && release.refs[e.ref]?.kind === 'skillNode');
  const records = entries.filter((e) => !cards.includes(e) && !skills.includes(e));
  const shown = expanded ? records : records.slice(0, COLLAPSED);
  return (
    <div className="up-records">
      {cards.length > 0 && <OfferCards entries={cards} release={release} />}
      {skills.length > 0 && <SkillLists entries={skills} release={release} />}
      {shown.map((e) => <RecordPanel key={e.ref} entry={e} release={release} section={section} />)}
      {records.length > shown.length && <ShowAll total={records.length} onClick={() => setExpanded(true)} />}
    </div>
  );
}
