import { createContext, useContext, useState, type CSSProperties } from 'react';
import {
  Bomb,
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Crosshair,
  EyeOff,
  Hand,
  HeartPulse,
  Lock,
  LogOut,
  MapPin,
  MinusCircle,
  Package,
  PackageCheck,
  Radar,
  Timer,
  XCircle,
  Zap,
} from 'lucide-react';
import { useLocale } from '../../../shared/context/LocaleContext';
import { ItemIcon } from '../../../shared/components/ItemIcon';
import type { LinkedQuestObjectiveProgress } from '../../../shared/types/linkedQuests';
import type { ObjectiveView } from '../types/quest';
import {
  evaluateObjectives,
  hasSharedTail,
  isObjectiveSatisfied,
  progressByKey,
  startedBranch,
  type StepState,
  type StepStatus,
} from '../utils/objectiveTree';

/**
 * The quest steps of the quest details as a stepper: sequences as numbered steps, all-of /
 * one-of / n-of groups as boxes, exclusive routes as a route picker, one-round parts framed, and
 * per step its interaction prompt and the items to bring. Status per step comes from the linked
 * progress (or all done for a completed quest), or from `done` when given. With `onToggleStep`,
 * every step can be marked done and not done again (manual progress).
 */
export function QuestSteps({
  tree,
  leafKeys,
  progress,
  completed = false,
  done: doneKeys,
  onToggleStep,
  questMapIds = [],
}: {
  tree: ObjectiveView;
  leafKeys: string[];
  progress?: LinkedQuestObjectiveProgress[];
  completed?: boolean;
  /** Done leaf keys; overrides `progress` and `completed`. */
  done?: ReadonlySet<string>;
  onToggleStep?: (key: string) => void;
  /** The quest's maps: a step on the quest's only map shows no map chip (it would repeat it). */
  questMapIds?: string[];
}) {
  const { t } = useLocale();
  const byKey = progressByKey(leafKeys, progress);
  const done = doneKeys ?? new Set(completed ? leafKeys : leafKeys.filter((key) => byKey.get(key)?.completed));
  const ctx: StepsContext = { states: evaluateObjectives(tree, done), done, progress: byKey, t, onToggleStep, questMapIds };
  return (
    <Ctx.Provider value={ctx}>
      <div className="quest-steps">
        <StepsBody node={tree} isRoot />
      </div>
    </Ctx.Provider>
  );
}

/** Badge for a part (or with `whole`, the whole quest) that has to be done in one round. */
export function OneRoundBadge({ whole = false }: { whole?: boolean }) {
  const { t } = useLocale();
  return (
    <span className="quest-steps__chip quest-steps__chip--round" title={t('quests.steps.oneRoundHint')}>
      <Timer size={11} /> {t(whole ? 'quests.steps.wholeQuestOneRound' : 'quests.objectiveOneRound')}
    </span>
  );
}

interface StepsContext {
  states: Map<string, StepState>;
  done: ReadonlySet<string>;
  progress: Map<string, LinkedQuestObjectiveProgress>;
  t: (key: string) => string;
  onToggleStep?: (key: string) => void;
  questMapIds: string[];
}

const Ctx = createContext<StepsContext | null>(null);
const useSteps = () => useContext(Ctx)!;

function fmt(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}

const ACTION_ICON: Record<string, typeof MapPin> = {
  VisitPOI: MapPin,
  Interact: Hand,
  Photo: Camera,
  Deliver: PackageCheck,
  Obtain: Package,
  KillEnemy: Crosshair,
  MultiKill: Crosshair,
  DestroyConstructablePart: Bomb,
  Damage: Zap,
  Ping: Radar,
  Extract: LogOut,
  HealInstance: HeartPulse,
};

const STATUS_ICON: Record<StepStatus, typeof Circle> = {
  done: CheckCircle2,
  active: Circle,
  locked: Lock,
  closed: XCircle,
  notNeeded: MinusCircle,
};

function stateOf(key: string, states: Map<string, StepState>): StepState {
  return states.get(key) ?? { status: 'locked', revealed: true };
}

function kindLabel(node: ObjectiveView, t: StepsContext['t']): string {
  const count = node.children.length;
  switch (node.kind) {
    case 'sequence':
      return t('quests.steps.inOrder');
    case 'allOf':
      return t('quests.steps.allOf');
    case 'anyOf':
      return count === 2 ? t('quests.steps.eitherOne') : fmt(t('quests.steps.anyOneOf'), { count });
    case 'anyOfExclusive':
      return fmt(t('quests.steps.chooseRoute'), { count });
    case 'nOf':
      return fmt(t('quests.steps.nOf'), { required: node.requiredCount ?? 1, count });
    default:
      return '';
  }
}

function groupCounter(node: ObjectiveView, done: ReadonlySet<string>): string {
  const satisfied = node.children.filter((c) => isObjectiveSatisfied(c, done)).length;
  if (node.kind === 'anyOf' || node.kind === 'anyOfExclusive') return `${Math.min(satisfied, 1)}/1`;
  if (node.kind === 'nOf') return `${Math.min(satisfied, node.requiredCount ?? 1)}/${node.requiredCount ?? 1}`;
  const required = node.children.filter((c) => !c.optional);
  return `${required.filter((c) => isObjectiveSatisfied(c, done)).length}/${required.length}`;
}

/** Map chips of a step, unless the quest is on that single map anyway. */
function showStepMaps(node: ObjectiveView, questMapIds: string[]): boolean {
  if (!node.mapIds?.length) return false;
  return !(questMapIds.length === 1 && node.mapIds.every((id) => id === questMapIds[0]));
}

/** A sequence drawn without frame or header: just its numbered steps. */
function isBareSequence(node: ObjectiveView): boolean {
  return node.kind === 'sequence' && !node.text && !node.oneRound && !node.optional;
}

function HiddenChip({ node }: { node: ObjectiveView }) {
  const { states, t } = useSteps();
  if (!node.hidden || stateOf(node.key, states).revealed) return null;
  return (
    <span className="quest-steps__chip quest-steps__chip--hidden" title={t('quests.steps.hiddenHint')}>
      <EyeOff size={11} /> {t('quests.steps.hidden')}
    </span>
  );
}

function OptionalChip() {
  const { t } = useSteps();
  return <span className="quest-steps__chip quest-steps__chip--optional">{t('quests.objectiveOptional')}</span>;
}

// ---------------------------------------------------------------------------------------------
// atomic step

function Leaf({ node, compact = false }: { node: ObjectiveView; compact?: boolean }) {
  const { states, progress, t, onToggleStep, questMapIds } = useSteps();
  const { status } = stateOf(node.key, states);
  const StatusIcon = STATUS_ICON[status];
  const ActionIcon = (node.actionType && ACTION_ICON[node.actionType]) || Circle;
  const amount = node.amount ?? 1;
  const current = status === 'done' ? amount : (progress.get(node.key)?.currentAmount ?? 0);
  return (
    <div
      className={[
        'quest-steps__leaf',
        `quest-steps__leaf--${status}`,
        node.optional ? 'quest-steps__leaf--optional' : '',
        compact ? 'quest-steps__leaf--compact' : '',
        onToggleStep ? 'quest-steps__leaf--editable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {onToggleStep ? (
        <button
          type="button"
          className="quest-steps__icon quest-steps__toggle"
          role="checkbox"
          aria-checked={status === 'done'}
          aria-label={node.text}
          title={`${t(`quests.steps.status.${status}`)} · ${t(status === 'done' ? 'quests.steps.markNotDone' : 'quests.steps.markDone')}`}
          onClick={() => onToggleStep(node.key)}
        >
          <StatusIcon size={status === 'locked' ? 14 : 16} className={`quest-steps__status quest-steps__status--${status}`} />
        </button>
      ) : (
        <span className="quest-steps__icon" title={t(`quests.steps.status.${status}`)}>
          <StatusIcon size={status === 'locked' ? 14 : 16} className={`quest-steps__status quest-steps__status--${status}`} />
        </span>
      )}
      {node.actionType && (
        <span className="quest-steps__icon quest-steps__icon--action" title={t(`quests.steps.action.${node.actionType}`)}>
          <ActionIcon size={14} />
        </span>
      )}
      <span className="quest-steps__text" onClick={onToggleStep ? () => onToggleStep(node.key) : undefined}>
        {node.text}
        {(node.prompt || node.holdSeconds) && (
          <span className="quest-steps__prompt" title={t('quests.steps.promptHint')}>
            <Hand size={11} />
            {node.prompt}
            {node.holdSeconds ? (
              <span className="quest-steps__hold">{fmt(t('quests.steps.hold'), { seconds: node.holdSeconds })}</span>
            ) : null}
          </span>
        )}
      </span>
      {amount > 1 && (
        <span className="quest-steps__count">
          {Math.min(current, amount)}/{amount}
        </span>
      )}
      {showStepMaps(node, questMapIds) && node.mapNames?.map((name) => (
        <span key={name} className="quest-steps__chip quest-steps__chip--map">
          {name}
        </span>
      ))}
      {node.optional && <OptionalChip />}
      <HiddenChip node={node} />
      {node.oneRound && <OneRoundBadge />}
      {node.items && (
        <div className="quest-steps__bring">
          {node.items.map((item) => (
            <div
              key={`${item.role}-${item.id}`}
              className="quest-steps__bring-item"
              title={`${item.quantity}× ${item.name}: ${t(`quests.steps.itemHint.${item.role}`)}`}
            >
              <ItemIcon
                itemId={item.id}
                name={item.name}
                icon={item.imageFilename}
                rarity={item.rarity}
                showName={false}
                style={{ '--item-icon-size': '40px', '--item-icon-padding': '3px' } as CSSProperties}
              />
              <span className="quest-steps__bring-label">
                <span className="quest-steps__bring-name">
                  {item.quantity > 1 && `${item.quantity}× `}
                  {item.name}
                </span>
                <span className={`quest-steps__bring-role quest-steps__bring-role--${item.role}`}>
                  {t(`quests.steps.item.${item.role}`)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// groups

function StepsBody({ node, isRoot = false }: { node: ObjectiveView; isRoot?: boolean }) {
  const { states } = useSteps();
  if (node.kind === 'atomic') return <Leaf node={node} />;
  if (node.kind === 'sequence') {
    let n = 0;
    return (
      <ol className="quest-steps__timeline">
        {node.children.map((child) => {
          const { status } = stateOf(child.key, states);
          return (
            <li key={child.key} className={`quest-steps__item quest-steps__item--${status}`}>
              <span className={`quest-steps__num${child.optional ? ' quest-steps__num--optional' : ''}`}>
                {child.optional ? '' : ++n}
              </span>
              <div className="quest-steps__content">
                {child.kind === 'atomic' ? <Leaf node={child} /> : <Group node={child} />}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }
  return isRoot ? <Group node={node} isRoot /> : <GroupBody node={node} />;
}

/** A group box. The root group (the whole quest) gets no frame unless it is one-round or optional. */
function Group({ node, isRoot = false }: { node: ObjectiveView; isRoot?: boolean }) {
  const { states, done, t } = useSteps();
  const { status } = stateOf(node.key, states);
  const header = node.kind !== 'sequence' || node.text || node.oneRound || node.optional;
  return (
    <div
      className={[
        'quest-steps__group',
        `quest-steps__group--${node.kind}`,
        `quest-steps__group--${status}`,
        node.oneRound ? 'quest-steps__group--round' : '',
        node.optional ? 'quest-steps__group--optional' : '',
        isBareSequence(node) ? 'quest-steps__group--bare' : '',
        isRoot && !node.oneRound && !node.optional ? 'quest-steps__group--root' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {header && (
        <div className="quest-steps__group-header">
          {node.text && <span className="quest-steps__group-title">{node.text}</span>}
          <span className="quest-steps__kind">{kindLabel(node, t)}</span>
          {node.oneRound && !isRoot && <OneRoundBadge />}
          {node.optional && <OptionalChip />}
          <HiddenChip node={node} />
          <span className="quest-steps__counter">{groupCounter(node, done)}</span>
        </div>
      )}
      <GroupBody node={node} />
    </div>
  );
}

function GroupBody({ node }: { node: ObjectiveView }) {
  const { states, done, t, onToggleStep } = useSteps();
  const [tab, setTab] = useState<number | null>(null);
  if (node.kind === 'sequence') return <StepsBody node={node} />;

  if (node.kind === 'anyOfExclusive' || hasSharedTail(node)) {
    const chosen = startedBranch(node, done);
    // When steps can be marked, another route can be opened (marking a step there switches to it).
    const picked = tab === null ? null : node.children[Math.min(tab, node.children.length - 1)];
    const branch = (onToggleStep ? (picked ?? chosen) : (chosen ?? picked)) ?? node.children[0];
    if (hasSharedTail(node)) {
      return (
        <div className="quest-steps__routes">
          {node.children.map((b, i) => (
            <div
              key={b.key}
              className={[
                'quest-steps__route',
                b === branch ? 'is-selected' : '',
                chosen && b !== chosen ? 'is-closed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => !chosen && setTab(i)}
            >
              <Leaf node={b.children[0]} compact />
            </div>
          ))}
          <div className="quest-steps__routes-then">
            <ChevronRight size={14} /> {t('quests.steps.thenAtChosenPlace')}
          </div>
          <StepsBody node={{ ...branch, children: branch.children.slice(1) }} />
        </div>
      );
    }
    return (
      <div className="quest-steps__tabs">
        <div className="quest-steps__tab-bar">
          {node.children.map((b, i) => (
            <button
              key={b.key}
              type="button"
              className={`quest-steps__tab${b === branch ? ' is-selected' : ''}${chosen && b !== chosen ? ' is-closed' : ''}`}
              disabled={!onToggleStep && !!chosen && b !== chosen}
              onClick={() => setTab(i)}
            >
              {fmt(t('quests.steps.route'), { n: i + 1 })}
            </button>
          ))}
        </div>
        <StepsBody node={branch} />
      </div>
    );
  }

  const isChoice = node.kind === 'anyOf' || node.kind === 'nOf';
  // A bare sequence among the entries draws numbered bubbles; the other entries get an
  // unnumbered bubble, so all entries line up in one column.
  const bubbles = node.children.some(isBareSequence);
  const content = (child: ObjectiveView) => (child.kind === 'atomic' ? <Leaf node={child} /> : <Group node={child} />);
  return (
    <ul className={`quest-steps__list quest-steps__list--${isChoice ? 'choice' : 'all'}`}>
      {node.children.map((child, i) => (
        <li key={child.key}>
          {i > 0 && isChoice && <span className="quest-steps__or">{t('quests.steps.or')}</span>}
          {bubbles && !isBareSequence(child) ? (
            <div className={`quest-steps__item quest-steps__item--${stateOf(child.key, states).status}`}>
              <span className={`quest-steps__num${child.optional ? ' quest-steps__num--optional' : ''}`} />
              <div className="quest-steps__content">{content(child)}</div>
            </div>
          ) : (
            content(child)
          )}
        </li>
      ))}
    </ul>
  );
}
