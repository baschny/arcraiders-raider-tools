import type { CSSProperties, ReactNode } from 'react';
import { BookOpen, Check, CircleDot, CircleHelp, ExternalLink, Lock, Satellite, Sparkles } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemIcon } from '../../../shared/components/ItemIcon';
import { TRADER_IMAGES } from '../data/static-data';
import { getTraderClass } from '../utils/helpers';
import { getLocalizedMapName } from '../utils/localization';
import { getMapAccent, getQuestMapIndicator } from '../utils/mapMeta';
import type { QuestDisplayStatus } from '../utils/linkedProgress';
import { questArcTrackerUrl, questWikiUrl, xpTier } from '../utils/questSummary';
import type { Quest, QuestItemEntry } from '../types/quest';

/** Building blocks shared by the quest node, its hover card and the details. */

const STATUS_ICON = { completed: Check, active: CircleDot, available: Sparkles, locked: Lock, unknown: CircleHelp };

export function StatusBadge({ status, large = false }: { status: QuestDisplayStatus; large?: boolean }) {
  const { t } = useLocale();
  const Icon = STATUS_ICON[status];
  return (
    <span className={`quest-card-status quest-card-status--${status}${large ? ' quest-card-status--lg' : ''}`}>
      <Icon size={large ? 14 : 11} strokeWidth={2.5} /> {t(`quests.card.status.${status}`)}
    </span>
  );
}

export function TraderPortrait({ trader, size = 40 }: { trader: string; size?: number }) {
  const image = TRADER_IMAGES[trader];
  return (
    <span className={`quest-card-portrait ${getTraderClass(trader)}`} style={{ width: size, height: size }} title={trader}>
      {image ? (
        <img src={image} alt={trader} />
      ) : (
        trader
          .split(' ')
          .map((w) => w[0])
          .join('')
      )}
    </span>
  );
}

/** The quest's maps with their map colour; with `max`, the rest as "+N". */
export function MapChips({ mapIds, max }: { mapIds: string[]; max?: number }) {
  const { locale, t } = useLocale();
  if (!mapIds.length) return <span className="quest-card-maps quest-card-maps--any">{t('quests.card.anyMap')}</span>;
  const indicator = getQuestMapIndicator(mapIds, locale);
  const maps = indicator
    ? indicator.slugs.map((slug, i) => ({ key: slug, name: indicator.names[i] ?? slug, accent: getMapAccent(slug) }))
    : mapIds.map((id) => ({ key: id, name: getLocalizedMapName(id, locale), accent: undefined }));
  const shown = max === undefined ? maps : maps.slice(0, max);
  const rest = maps.slice(shown.length);
  return (
    <span className="quest-card-maps">
      {shown.map((m) => (
        <span key={m.key} className="quest-card-maps__map" style={m.accent ? ({ '--map-accent': m.accent } as CSSProperties) : undefined}>
          {m.name}
        </span>
      ))}
      {rest.length > 0 && <span title={rest.map((m) => m.name).join(', ')}>+{rest.length}</span>}
    </span>
  );
}

/** XP as a plain value; a higher tier is brighter (no fill: it is a value, not progress). */
export function XpValue({ xp, large = false }: { xp?: number; large?: boolean }) {
  const { t, formatNumber } = useLocale();
  if (!xp) return null;
  const value = formatNumber(xp);
  const unit = t('quests.card.xp');
  return (
    <span className={`quest-card-xp quest-card-xp--t${xpTier(xp)}${large ? ' quest-card-xp--lg' : ''}`} title={`${value} ${unit}`}>
      {value} <small>{unit}</small>
    </span>
  );
}

export function BlueprintThumbs({ quest, size = 28 }: { quest: Quest; size?: number }) {
  const { tm } = useLocale();
  if (!quest.blueprintRewards.length) return null;
  return (
    <span
      className="quest-card-blueprints"
      title={tm('quests.rewardsList', { rewards: quest.blueprintRewards.map((b) => b.name).join(', ') })}
    >
      {quest.blueprintRewards.map((b) => (
        <ItemIcon
          key={b.id}
          itemId={b.id}
          name={b.name}
          icon={b.imageFilename}
          isBlueprint
          showName={false}
          // Enough padding for the blue blueprint grid to show around the paper icon.
          style={{ '--item-icon-size': `${size}px`, '--item-icon-padding': `${Math.round(size * 0.15)}px` } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** One segment per required step, the done ones filled. */
export function StepBar({ done, total }: { done: number; total: number }) {
  const { tm } = useLocale();
  if (!total) return null;
  return (
    <span className="quest-card-stepbar" title={tm('quests.card.stepBar', { done, total })}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < done ? 'is-done' : undefined} />
      ))}
    </span>
  );
}

/** Item icon with amount, name and an optional note below the name. */
export function ItemTile({ item, size = 40, note, isBlueprint = false }: { item: QuestItemEntry; size?: number; note?: ReactNode; isBlueprint?: boolean }) {
  const { formatNumber } = useLocale();
  const amount = item.quantity > 1 ? `${formatNumber(item.quantity)}× ` : '';
  return (
    <div className="quest-card-tile" title={`${amount}${item.name}`}>
      <ItemIcon
        itemId={item.id}
        name={item.name}
        icon={item.imageFilename}
        rarity={item.rarity}
        isBlueprint={isBlueprint}
        showName={false}
        style={{ '--item-icon-size': `${size}px`, '--item-icon-padding': isBlueprint ? `${Math.round(size * 0.15)}px` : '3px' } as CSSProperties}
      />
      <span className="quest-card-tile__label">
        <span className="quest-card-tile__name">
          {amount}
          {item.name}
        </span>
        {note && <span className="quest-card-tile__note">{note}</span>}
      </span>
    </div>
  );
}

/** Wiki and ARCTracker links (new tab). */
export function QuestExternalLinks({ quest, showExternalIcon = false }: { quest: Quest; showExternalIcon?: boolean }) {
  const { t } = useLocale();
  return (
    <>
      <a className="quest-card-btn" href={questWikiUrl(quest)} target="_blank" rel="noopener noreferrer" title={t('quests.wikiTitle')}>
        <BookOpen size={13} /> {t('quests.wikiLabel')}
        {showExternalIcon && <ExternalLink size={11} />}
      </a>
      <a
        className="quest-card-btn"
        href={questArcTrackerUrl(quest)}
        target="_blank"
        rel="noopener noreferrer"
        title={t('quests.arcTrackerTitle')}
      >
        <Satellite size={13} /> {t('quests.arcTrackerLabel')}
        {showExternalIcon && <ExternalLink size={11} />}
      </a>
    </>
  );
}
