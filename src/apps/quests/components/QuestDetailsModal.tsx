import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import { isUnlockNode, type Quest } from '../types/quest';
import type { QuestDisplayStatus } from '../utils/linkedProgress';
import { getQuestMapIndicator } from '../utils/mapMeta';
import { bringList, doneLeafKeys, otherRewardItems, stepSummary } from '../utils/questSummary';
import { ItemTile, MapChips, QuestExternalLinks, StatusBadge, StepBar, TraderPortrait, XpValue } from './QuestCardParts';
import { OneRoundBadge, QuestSteps } from './QuestSteps';

interface QuestDetailsModalProps {
  quest: Quest;
  status: QuestDisplayStatus;
  objectiveProgress?: LinkedQuestObjectiveProgress[];
  questById: ReadonlyMap<string, Quest>;
  statusOf: (questId: string) => QuestDisplayStatus;
  /** Marks the quest done / not done; absent when progress comes from a linked account. */
  onToggle?: () => void;
  /** Marks a step done / not done; absent when progress comes from a linked account. */
  onToggleStep?: (key: string) => void;
  onOpenQuest: (questId: string) => void;
  onClose: () => void;
}

/**
 * Everything about a quest: steps with the linked progress on the left; what to bring, rewards
 * and the quest chain on the right.
 */
export function QuestDetailsModal(props: QuestDetailsModalProps) {
  const { quest, onClose } = props;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [quest.id]);

  return createPortal(
    <div className="quest-details-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="quest-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quest-details-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <DetailsHeader {...props} />
        <div className="quest-details__body">
          <div className="quest-details__main">
            <Description quest={quest} />
            <Steps {...props} />
          </div>
          <aside className="quest-details__side">
            <BeforeYouGo quest={quest} />
            <Rewards quest={quest} />
            <Chain {...props} />
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DetailsHeader({ quest, status, objectiveProgress, onToggle, onClose }: QuestDetailsModalProps) {
  const { locale, t, tm } = useLocale();
  const indicator = getQuestMapIndicator(quest.map, locale);
  const completed = status === 'completed';
  const summary = status === 'active' ? stepSummary(quest, doneLeafKeys(quest, objectiveProgress, false)) : null;
  return (
    <header
      className="quest-details__header"
      style={indicator?.backgroundImage ? ({ '--quest-details-bg': `url(${indicator.backgroundImage})` } as CSSProperties) : undefined}
    >
      <TraderPortrait trader={quest.trader} size={56} />
      <div className="quest-details__title">
        <div className="quest-details__meta">
          <span>{quest.trader}</span>
          <MapChips mapIds={quest.map} />
          {quest.category === 'side' && <span className="quest-card-chip">{t('quests.sideQuestBadge')}</span>}
          {quest.isNew && (
            <span className="quest-card-chip quest-card-chip--new">{tm('quests.card.newBadge', { version: quest.addedIn ?? '' })}</span>
          )}
        </div>
        <h2 id="quest-details-title">{quest.name}</h2>
        <div className="quest-details__meta">
          <StatusBadge status={status} large />
          {summary && <StepBar done={summary.done} total={summary.required} />}
        </div>
      </div>
      <div className="quest-details__actions">
        {onToggle && (
          <button type="button" className={`quest-card-btn${completed ? '' : ' quest-card-btn--primary'}`} onClick={onToggle}>
            <CheckCircle2 size={14} /> {t(completed ? 'quests.card.markNotDone' : 'quests.card.markDone')}
          </button>
        )}
        <QuestExternalLinks quest={quest} showExternalIcon />
        <button type="button" className="quest-card-btn quest-card-btn--icon" onClick={onClose} aria-label={t('quests.card.close')}>
          <X size={18} />
        </button>
      </div>
    </header>
  );
}

function Description({ quest }: { quest: Quest }) {
  if (!quest.description.trim()) return null;
  return (
    <blockquote className="quest-details__description">
      {quest.description}
      <cite>— {quest.trader}</cite>
    </blockquote>
  );
}

function Steps({ quest, status, objectiveProgress, onToggleStep }: QuestDetailsModalProps) {
  const { t } = useLocale();
  if (!quest.objectiveTree) return null;
  return (
    <section className="quest-details__section">
      <h3>
        {t('quests.card.stepsTitle')}
        {quest.objectivesOneRound && <OneRoundBadge whole />}
      </h3>
      <div className="quest-details__steps">
        <QuestSteps
          tree={quest.objectiveTree}
          leafKeys={quest.objectiveLeafKeys}
          progress={objectiveProgress}
          done={doneLeafKeys(quest, objectiveProgress, status === 'completed')}
          onToggleStep={onToggleStep}
        />
      </div>
    </section>
  );
}

function BeforeYouGo({ quest }: { quest: Quest }) {
  const { t } = useLocale();
  const bring = bringList(quest);
  if (!bring.length) return null;
  return (
    <section className="quest-details__section">
      <h3 title={t('quests.card.bringHint')}>{t('quests.card.beforeYouGo')}</h3>
      <div className="quest-details__tiles">
        {bring.map((b) => (
          <ItemTile key={`${b.role}-${b.id}`} item={b} note={t(`quests.steps.item.${b.role}`)} />
        ))}
      </div>
    </section>
  );
}

function Rewards({ quest }: { quest: Quest }) {
  const { t } = useLocale();
  const others = otherRewardItems(quest);
  if (!quest.xp && !quest.blueprintRewards.length && !others.length && !quest.optionalRewardItems.length && !quest.grantedItems.length) {
    return null;
  }
  return (
    <section className="quest-details__section">
      <h3>{t('quests.card.rewards')}</h3>
      {(!!quest.xp || quest.blueprintRewards.length > 0) && (
        <div className="quest-details__rewards-head">
          <XpValue xp={quest.xp} large />
          {quest.blueprintRewards.map((b) => (
            <ItemTile
              key={b.id}
              item={{ id: b.id, name: b.name, quantity: 1, imageFilename: b.imageFilename }}
              size={48}
              isBlueprint
              note={t('quests.card.blueprint')}
            />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="quest-details__tiles">
          {others.map((r) => (
            <ItemTile key={r.id} item={r} />
          ))}
        </div>
      )}
      {quest.optionalRewardItems.length > 0 && (
        <>
          <h4>{t('quests.card.optionalRewards')}</h4>
          <div className="quest-details__tiles">
            {quest.optionalRewardItems.map((r) => (
              <ItemTile key={r.id} item={r} />
            ))}
          </div>
        </>
      )}
      {quest.grantedItems.length > 0 && (
        <>
          <h4>{t('quests.card.granted')}</h4>
          <div className="quest-details__tiles">
            {quest.grantedItems.map((r) => (
              <ItemTile key={r.id} item={r} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Chain({ quest, questById, statusOf, onOpenQuest }: QuestDetailsModalProps) {
  const { t } = useLocale();
  const isQuest = (id: string) => {
    const other = questById.get(id);
    return !!other && !isUnlockNode(other);
  };
  const previous = quest.previousQuestIds.filter(isQuest);
  const unlocks = quest.previousQuestIds
    .map((id) => questById.get(id))
    .filter((other): other is Quest => !!other && isUnlockNode(other));
  const next = quest.nextQuestIds.filter(isQuest);
  if (!previous.length && !unlocks.length && !next.length && !quest.otherRequirements.length) return null;
  const chip = (id: string) => {
    const other = questById.get(id)!;
    return (
      <button key={id} type="button" className={`quest-details__chain-quest is-${statusOf(id)}`} onClick={() => onOpenQuest(id)}>
        <TraderPortrait trader={other.trader} size={22} />
        <span>{other.name}</span>
        <ChevronRight size={13} />
      </button>
    );
  };
  const unlockChip = (other: Quest) => (
    <span key={other.id} className={`quest-details__chain-unlock is-${statusOf(other.id)}`} title={t('quests.unlock.hint')}>
      <span className="quest-details__chain-unlock-kind">{t('quests.unlock.kindLabel')}</span>
      <span>
        {other.unlock?.label}
        {other.unlock?.detail && <small> · {other.unlock.detail}</small>}
      </span>
    </span>
  );
  return (
    <section className="quest-details__section">
      <h3>{t('quests.card.chain')}</h3>
      {(previous.length > 0 || unlocks.length > 0 || quest.otherRequirements.length > 0) && (
        <>
          <h4>{t('quests.card.requires')}</h4>
          <div className="quest-details__chain">
            {unlocks.map(unlockChip)}
            {previous.map(chip)}
            {quest.otherRequirements.map((r) => (
              <span key={r} className="quest-card-chip">
                {r}
              </span>
            ))}
          </div>
        </>
      )}
      {next.length > 0 && (
        <>
          <h4>{t('quests.card.unlocks')}</h4>
          <div className="quest-details__chain">{next.map(chip)}</div>
        </>
      )}
    </section>
  );
}
