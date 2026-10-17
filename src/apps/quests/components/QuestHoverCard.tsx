import { createPortal } from 'react-dom';
import { ArrowRight, ChevronRight, Maximize2, Package, Shuffle, Timer } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import type { Quest } from '../types/quest';
import type { QuestDisplayStatus } from '../utils/linkedProgress';
import { bringList, doneLeafKeys, otherRewardItems, stepSummary } from '../utils/questSummary';
import { BlueprintThumbs, MiniItem, QuestExternalLinks, StatusBadge, XpValue } from './QuestCardParts';

const MAX_REWARD_ITEMS = 4;

interface QuestHoverCardProps {
  quest: Quest;
  status: QuestDisplayStatus;
  position: { x: number; y: number; maxHeight: number };
  visible: boolean;
  objectiveProgress?: LinkedQuestObjectiveProgress[];
  onOpenDetails: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onContextMenu?: () => void;
}

/**
 * Compact card shown when hovering a quest node: what decides whether to take the quest into the
 * next raid (next step, what to bring, rewards). Everything else is in the details.
 */
export function QuestHoverCard({
  quest,
  status,
  position,
  visible,
  objectiveProgress,
  onOpenDetails,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
}: QuestHoverCardProps) {
  const { locale, t, tm, formatNumber } = useLocale();
  if (!visible) return null;

  const completed = status === 'completed';
  const summary = stepSummary(quest, doneLeafKeys(quest, objectiveProgress, completed));
  const bring = completed ? [] : bringList(quest);
  const rewards = otherRewardItems(quest);
  const plural = (key: string, count: number) =>
    tm(new Intl.PluralRules(locale).select(count) === 'one' ? `${key}One` : key, { count: formatNumber(count) });

  return createPortal(
    <div
      className="quest-hover"
      style={{ left: `${position.x}px`, top: `${position.y}px`, maxHeight: `${position.maxHeight}px` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onMouseUp={(event) => event.stopPropagation()}
    >
      <div className="quest-hover__head">
        <span className="quest-hover__trader">{quest.trader}</span>
        <StatusBadge status={status} />
      </div>

      {summary.required > 0 && (
        <div className="quest-hover__steps">
          <span className="quest-hover__label">
            {plural('quests.card.steps', summary.required)}
            {summary.optional > 0 && ` · ${tm('quests.card.optionalSteps', { count: formatNumber(summary.optional) })}`}
          </span>
          {summary.oneRound && (
            <span className="quest-card-chip quest-card-chip--round" title={t('quests.steps.oneRoundHint')}>
              <Timer size={11} /> {t('quests.objectiveOneRound')}
            </span>
          )}
          {summary.hasChoice && (
            <span className="quest-card-chip" title={t('quests.card.choicesHint')}>
              <Shuffle size={11} /> {t('quests.card.choices')}
            </span>
          )}
        </div>
      )}
      {!completed && summary.next && (
        <button type="button" className="quest-hover__next" onClick={onOpenDetails}>
          <ArrowRight size={13} />
          <span>
            <span className="quest-hover__label">{t(status === 'active' ? 'quests.card.next' : 'quests.card.startsWith')}</span>{' '}
            {summary.next}
          </span>
          <span className="quest-hover__all">
            {t('quests.card.allSteps')} <ChevronRight size={12} />
          </span>
        </button>
      )}

      {bring.length > 0 && (
        <div className="quest-hover__row">
          <span className="quest-hover__label" title={t('quests.card.bringHint')}>
            <Package size={12} /> {t('quests.card.bring')}
          </span>
          <div className="quest-hover__icons">
            {bring.map((b) => (
              <MiniItem
                key={`${b.role}-${b.id}`}
                item={b}
                title={`${formatNumber(b.quantity)}× ${b.name} (${t(`quests.steps.item.${b.role}`)})`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="quest-hover__row">
        <span className="quest-hover__label">{t('quests.card.rewards')}</span>
        <div className="quest-hover__icons">
          <XpValue xp={quest.xp} />
          <BlueprintThumbs quest={quest} size={32} />
          {rewards.slice(0, MAX_REWARD_ITEMS).map((r) => (
            <MiniItem key={r.id} item={r} />
          ))}
          {rewards.length > MAX_REWARD_ITEMS && (
            <span className="quest-hover__more" title={rewards.slice(MAX_REWARD_ITEMS).map((r) => r.name).join(', ')}>
              +{rewards.length - MAX_REWARD_ITEMS}
            </span>
          )}
        </div>
      </div>

      <div className="quest-hover__links">
        <button type="button" className="quest-card-btn quest-card-btn--primary" onClick={onOpenDetails}>
          <Maximize2 size={13} /> {t('quests.card.details')}
        </button>
        <QuestExternalLinks quest={quest} />
      </div>
    </div>,
    document.body,
  );
}
