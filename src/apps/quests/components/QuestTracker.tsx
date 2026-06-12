import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleHelp, RefreshCw } from 'lucide-react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import type { Node, Edge, ReactFlowInstance, Viewport } from 'reactflow';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Quest } from '../types/quest';
import { QuestNode } from './QuestNode';
import { MapNode } from './MapNode';
import { BlueprintRewardsOverlay } from './BlueprintRewardsOverlay';
import { QuestSearchOverlay } from './QuestSearchOverlay';
import { Sidebar } from './Sidebar';
import { ConfirmDialog } from './ConfirmDialog';
import { migrateQuestIds } from '../data/questIdMigration';
import { trackQuestMark } from '../../../shared/utils/analytics';
import { useCognitoAuth } from '../../../shared/context/CognitoAuthContext';
import { useLinkedAccounts } from '../../../shared/context/LinkedAccountsContext';
import { useLocale } from '../../../shared/context/LocaleContext';
import { questsStore, useStore } from '../../../shared/state/stores';
import {
  getCachedLinkedQuestSnapshot,
  getEmbarkQuestSnapshot,
  LinkedQuestApiError,
  syncArctrackerQuestSnapshot,
  syncEmbarkQuestSnapshot,
} from '../../../shared/services/linkedQuestApi';
import { withSyncNow } from '../../../shared/services/syncNowService';
import { getMe } from '../../../shared/services/userApi';
import type { LinkedQuestSnapshot } from '../../../shared/types/linkedQuests';
import {
  buildLinkedCompletedQuestSet,
  getObjectiveProgressSummary,
  getQuestDisplayStatus,
} from '../utils/linkedProgress';
import {
  getAllDependents,
  getAllPrerequisites,
  isQuestAvailable,
} from '../utils/questHelpers';

const BLUEPRINT_OVERLAY_COLLAPSED_STORAGE_KEY =
  'raider-tools:quest-tracker-blueprints-collapsed';
const VIEWPORT_STORAGE_KEY = 'raider-tools:quest-tracker-viewport';
// Node width used by the ELK layout; kept in sync with the `width: 300`
// passed to ELK when building the graph.
const NODE_WIDTH = 300;
// Initial zoom level used when we don't have a saved viewport.
const INITIAL_ZOOM = 0.5;
// Top padding (in flow coordinates after zoom) between the top edge of
// the pane and the top-most node on first load.
const INITIAL_TOP_PADDING = 50;

interface QuestTrackerProps {
  quests: Quest[];
}

export function QuestTracker({ quests }: QuestTrackerProps) {
  const cognito = useCognitoAuth();
  const { arctracker, embark } = useLinkedAccounts();
  const { t, tm, formatDate, compareText } = useLocale();
  const [questState, setQuestState] = useStore(questsStore);
  const [linkedSnapshot, setLinkedSnapshot] = useState<LinkedQuestSnapshot | null>(null);
  const [embarkEnabled, setEmbarkEnabled] = useState(false);
  const [isSyncingLinkedSnapshot, setIsSyncingLinkedSnapshot] = useState(false);
  const [linkedSyncError, setLinkedSyncError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isLinkedMode = questState.mode === 'linked';

  const manualCompletedQuests = useMemo(() => {
    const ids = questState.manualCompletedQuestIds ?? [];
    return new Set(migrateQuestIds(ids));
  }, [questState.manualCompletedQuestIds]);

  const linkedSource = useMemo(() => {
    const embarkUsable = embarkEnabled && embark.status?.linked === true
      ? embark.status.expired === false
      : false;
    if (embarkUsable) return 'embark' as const;
    if (arctracker.state === 'connected') return 'arctracker' as const;
    return null;
  }, [arctracker.state, embark.status, embarkEnabled]);

  const activeLinkedSnapshot = useMemo(() => {
    if (!linkedSource) return null;
    return linkedSnapshot?.source === linkedSource ? linkedSnapshot : null;
  }, [linkedSnapshot, linkedSource]);

  const completedQuests = useMemo(() => {
    if (!isLinkedMode) return manualCompletedQuests;
    return buildLinkedCompletedQuestSet(quests, activeLinkedSnapshot);
  }, [activeLinkedSnapshot, isLinkedMode, manualCompletedQuests, quests]);

  const readCompletedQuests = useCallback((): Set<string> => {
    const ids = questsStore.get().manualCompletedQuestIds ?? [];
    return new Set(migrateQuestIds(ids));
  }, []);

  const saveCompletedQuests = useCallback(
    (next: Set<string>) => {
      setQuestState({
        ...questsStore.get(),
        manualCompletedQuestIds: Array.from(next),
      });
    },
    [setQuestState]
  );

  const setMode = useCallback(
    (mode: 'manual' | 'linked') => {
      setQuestState({
        ...questsStore.get(),
        mode,
      });
    },
    [setQuestState]
  );

  // Load blueprint overlay collapse state from localStorage
  const loadBlueprintOverlayCollapsed = (): boolean => {
    try {
      const saved = localStorage.getItem(BLUEPRINT_OVERLAY_COLLAPSED_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) === true;
      }
    } catch (e) {
      console.error('Failed to load blueprint overlay state:', e);
    }
    return true;
  };

  // Load the last-known viewport from localStorage.
  const loadViewport = (): Viewport | undefined => {
    try {
      const saved = localStorage.getItem(VIEWPORT_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load viewport:', e);
    }
    return undefined;
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedQuestId, setHighlightedQuestId] = useState<string | null>(
    null
  );
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);
  const [isBlueprintOverlayCollapsed, setIsBlueprintOverlayCollapsed] =
    useState(loadBlueprintOverlayCollapsed);
  // Snapshot of the persisted viewport captured once at mount. When
  // present we pass it to React Flow as `defaultViewport` and skip the
  // top-center positioning done on first load.
  const [savedViewport] = useState<Viewport | undefined>(() => loadViewport());
  // Ref to the graph container so we can read its pixel dimensions when
  // computing the initial top-center viewport.
  const graphContainerRef = useRef<HTMLDivElement>(null);
  // Ensures the initial top-center positioning only runs once per mount.
  const initialViewportAppliedRef = useRef(false);
  const focusParamAppliedRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timerId);
  }, []);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    questList: string[];
    showMore: number;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    questList: [],
    showMore: 0,
    onConfirm: () => {},
  });

  useEffect(() => {
    let cancelled = false;

    async function loadLinkedState() {
      const cachedSnapshot = await getCachedLinkedQuestSnapshot();
      if (!cancelled) {
        setLinkedSnapshot(cachedSnapshot);
      }

      if (!cognito.user) {
        if (!cancelled) {
          setEmbarkEnabled(false);
        }
        return;
      }

      try {
        const me = await getMe();
        if (!cancelled) {
          setEmbarkEnabled(me.features?.embarkEnabled === true);
        }
      } catch (error) {
        console.warn('Failed to load quest linked-mode profile state:', error);
        if (!cancelled) {
          setEmbarkEnabled(false);
        }
      }
    }

    void loadLinkedState();
    return () => {
      cancelled = true;
    };
  }, [cognito.user]);

  // Save blueprint overlay collapse state whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        BLUEPRINT_OVERLAY_COLLAPSED_STORAGE_KEY,
        JSON.stringify(isBlueprintOverlayCollapsed)
      );
    } catch (e) {
      console.error('Failed to save blueprint overlay state:', e);
    }
  }, [isBlueprintOverlayCollapsed]);

  // Persist the viewport on user-driven pan/zoom. React Flow only invokes
  // `onMoveEnd` for interactions that have a DOM sourceEvent, so our own
  // programmatic `setViewport` call for the initial top-center layout
  // does NOT trigger this handler.
  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => {
      try {
        localStorage.setItem(
          VIEWPORT_STORAGE_KEY,
          JSON.stringify(nextViewport)
        );
      } catch (e) {
        console.error('Failed to save viewport:', e);
      }
    },
    []
  );

  useEffect(() => {
    if (!cognito.user || linkedSource !== 'embark' || activeLinkedSnapshot) return;

    let cancelled = false;
    void getEmbarkQuestSnapshot()
      .then((snapshot) => {
        if (!cancelled && snapshot) {
          setLinkedSnapshot(snapshot);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn('Failed to load cached Embark quest snapshot:', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeLinkedSnapshot, cognito.user, linkedSource]);

  const handleSyncLinkedMode = useCallback(async () => {
    if (!linkedSource) return;

    setIsSyncingLinkedSnapshot(true);
    setLinkedSyncError(null);
    try {
      const snapshot = linkedSource === 'embark'
        ? await syncEmbarkQuestSnapshot(linkedSnapshot)
        : await withSyncNow('quests', () => syncArctrackerQuestSnapshot(linkedSnapshot));
      setLinkedSnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('quests.syncUnknownError');
      setLinkedSyncError(message);
      if (error instanceof LinkedQuestApiError && error.snapshot) {
        setLinkedSnapshot(error.snapshot);
      }
    } finally {
      setIsSyncingLinkedSnapshot(false);
    }
  }, [linkedSnapshot, linkedSource, t]);

  // Node types registration
  const nodeTypes = useMemo(
    () => ({
      questNode: QuestNode,
      mapNode: MapNode,
    }),
    []
  );

  // Check if quest is available
  const isAvailable = useCallback(
    (quest: Quest) => isQuestAvailable(quest, completedQuests),
    [completedQuests]
  );

  // Toggle quest completion
  const toggleQuest = useCallback(
    (questId: string) => {
      if (isLinkedMode) return;
      const prev = completedQuests;
      const quest = quests.find((q) => q.id === questId);
      if (!quest) return;

      if (prev.has(questId)) {
        // Uncompleting a quest - check for completed dependents
        const dependents = getAllDependents(questId, quests, prev);

        if (dependents.size > 0) {
          const dependentNames = Array.from(dependents)
            .map((id) => quests.find((q) => q.id === id)?.name)
            .filter(Boolean) as string[];

          // Show confirmation dialog
          setConfirmDialog({
            isOpen: true,
            title: tm('quests.confirmMarkIncompleteTitle', {}),
            message: tm('quests.confirmMarkIncompleteMessage', {
              quest: quest.name,
              count: dependents.size,
            }),
            questList: dependentNames.slice(0, 5),
            showMore: dependentNames.length > 5 ? dependentNames.length - 5 : 0,
            onConfirm: () => {
              // Remove quest and all dependents from the latest store value.
              const newSet = readCompletedQuests();
              newSet.delete(questId);
              dependents.forEach((id) => newSet.delete(id));
              saveCompletedQuests(newSet);
              // Track quest unmarking
              trackQuestMark(quest.name, questId, false);
              setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
            },
          });
        } else {
          // No dependents, just uncomplete
          const newSet = new Set(prev);
          newSet.delete(questId);
          saveCompletedQuests(newSet);
          // Track quest unmarking
          trackQuestMark(quest.name, questId, false);
        }
      } else {
        // Completing a quest - check for incomplete prerequisites
        const incompletePrereqs = quest.previousQuestIds.filter(
          (id) => !prev.has(id)
        );

        if (incompletePrereqs.length > 0) {
          const allPrereqs = getAllPrerequisites(questId, quests);
          const incompleteAll = Array.from(allPrereqs).filter(
            (id) => !prev.has(id)
          );
          const prereqNames = incompleteAll
            .map((id) => quests.find((q) => q.id === id)?.name)
            .filter(Boolean) as string[];

          // Show confirmation dialog
          setConfirmDialog({
            isOpen: true,
            title: tm('quests.confirmAutocompleteTitle', {}),
            message: tm('quests.confirmAutocompleteMessage', {
              quest: quest.name,
              count: incompleteAll.length,
            }),
            questList: prereqNames.slice(0, 5),
            showMore: prereqNames.length > 5 ? prereqNames.length - 5 : 0,
            onConfirm: () => {
              // Add quest and all prerequisites to the latest store value.
              const newSet = readCompletedQuests();
              incompleteAll.forEach((id) => newSet.add(id));
              newSet.add(questId);
              saveCompletedQuests(newSet);
              // Track quest marking
              trackQuestMark(quest.name, questId, true);
              setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
            },
          });
        } else {
          // All prerequisites complete, just complete this quest
          const newSet = new Set(prev);
          newSet.add(questId);
          saveCompletedQuests(newSet);
          // Track quest marking
          trackQuestMark(quest.name, questId, true);
        }
      }
    },
    [
      completedQuests,
      isLinkedMode,
      quests,
      readCompletedQuests,
      saveCompletedQuests,
      tm,
    ]
  );

  // Compute node positions with ELK. The layout only depends on the graph
  // shape (quests + their prerequisite links), so we recompute it only when
  // `quests` changes, not on every completion toggle.
  const [elkPositions, setElkPositions] = useState<Map<
    string,
    { x: number; y: number }
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    const elk = new ELK();

    const graph: ElkNode = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        'elk.spacing.nodeNode': '70',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.mergeEdges': 'true',
        'elk.edgeRouting': 'SPLINES',
      },
      children: quests.map((quest) => ({
        id: quest.id,
        width: 300,
        height: quest.trader === 'Map' ? 110 : 140,
      })),
      edges: quests.flatMap((quest) =>
        quest.previousQuestIds.map((prevId) => ({
          id: `${prevId}-${quest.id}`,
          sources: [prevId],
          targets: [quest.id],
        }))
      ),
    };

    elk
      .layout(graph)
      .then((layouted) => {
        if (cancelled) return;
        const positions = new Map<string, { x: number; y: number }>();
        layouted.children?.forEach((child) => {
          if (child.x != null && child.y != null) {
            positions.set(child.id, { x: child.x, y: child.y });
          }
        });
        setElkPositions(positions);
      })
      .catch((err) => {
        console.error('ELK layout failed:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [quests]);

  // On first load (no saved viewport), position the pane horizontally
  // centered on the graph and aligned with its top edge. We run this
  // once the ReactFlow instance is ready AND ELK has produced positions,
  // so we already know the graph's bounds without having to wait for
  // React Flow to measure the DOM nodes.
  useEffect(() => {
    if (savedViewport) return;
    if (initialViewportAppliedRef.current) return;
    if (!reactFlowInstance || !elkPositions || elkPositions.size === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    elkPositions.forEach((pos) => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + NODE_WIDTH);
      minY = Math.min(minY, pos.y);
    });

    const paneWidth = graphContainerRef.current?.clientWidth ?? 0;
    const graphCenterX = (minX + maxX) / 2;
    const x = paneWidth / 2 - graphCenterX * INITIAL_ZOOM;
    const y = -minY * INITIAL_ZOOM + INITIAL_TOP_PADDING;

    reactFlowInstance.setViewport({ x, y, zoom: INITIAL_ZOOM });
    initialViewportAppliedRef.current = true;
  }, [reactFlowInstance, elkPositions, savedViewport]);

  // Build React Flow nodes/edges from the computed positions and the
  // interactive state (completion, availability, highlight).
  const { nodes, edges } = useMemo(() => {
    if (!elkPositions) return { nodes: [] as Node[], edges: [] as Edge[] };

    // Horizontal threshold for choosing a side handle instead of the bottom
    // handle. Using ~40% of the node width so clearly-offset children exit
    // left/right while nearly-aligned children keep the bottom handle.
    const SIDE_HANDLE_THRESHOLD = 120;
    const NODE_WIDTH = 300;

    const flowNodes: Node[] = [];
    quests.forEach((quest) => {
      const pos = elkPositions.get(quest.id);
      if (!pos) return;
      const isMap = quest.trader === 'Map';
      const status = isLinkedMode
        ? getQuestDisplayStatus({
            quest,
            linkedSnapshot: activeLinkedSnapshot,
            linkedCompletedQuests: completedQuests,
          })
        : completedQuests.has(quest.id)
          ? 'completed'
          : isAvailable(quest)
            ? 'available'
            : 'locked';
      const linkedEntry = activeLinkedSnapshot?.source === 'embark'
        ? activeLinkedSnapshot.questsById[quest.id]
        : undefined;
      flowNodes.push({
        id: quest.id,
        type: isMap ? 'mapNode' : 'questNode',
        position: { x: pos.x, y: pos.y },
        data: {
          quest,
          isCompleted: completedQuests.has(quest.id),
          isAvailable: status === 'available' || status === 'active',
          status,
          isInteractive: !isLinkedMode,
          isHighlighted: quest.id === highlightedQuestId,
          objectiveSummary: linkedEntry ? getObjectiveProgressSummary(linkedEntry) : null,
          objectiveProgress: linkedEntry?.objectives,
          onToggle: toggleQuest,
        },
        draggable: false,
      });
    });

    const flowEdges: Edge[] = [];
    quests.forEach((quest) => {
      quest.previousQuestIds.forEach((prevId) => {
        const sourceCompleted = completedQuests.has(prevId);
        const targetStatus = isLinkedMode
          ? getQuestDisplayStatus({
              quest,
              linkedSnapshot: activeLinkedSnapshot,
              linkedCompletedQuests: completedQuests,
            })
          : completedQuests.has(quest.id)
            ? 'completed'
            : isAvailable(quest)
              ? 'available'
              : 'locked';
        const targetCompleted = targetStatus === 'completed';
        const targetAvailable = targetStatus === 'available' || targetStatus === 'active';

        let className = '';
        if (sourceCompleted && targetCompleted) {
          className = 'completed';
        } else if (sourceCompleted && targetAvailable) {
          className = 'available';
        }

        // Pick a source handle based on where the target sits horizontally
        // relative to the source. ELK positions are top-left corners; compare
        // centers so node width is cancelled out and only the horizontal
        // offset matters. Target handle stays on top since the graph flows
        // top-to-bottom.
        const sourcePos = elkPositions.get(prevId);
        const targetPos = elkPositions.get(quest.id);
        let sourceHandle: string = 'source-bottom';
        if (sourcePos && targetPos) {
          const sourceCenterX = sourcePos.x + NODE_WIDTH / 2;
          const targetCenterX = targetPos.x + NODE_WIDTH / 2;
          const dx = targetCenterX - sourceCenterX;
          if (dx > SIDE_HANDLE_THRESHOLD) {
            sourceHandle = 'source-right';
          } else if (dx < -SIDE_HANDLE_THRESHOLD) {
            sourceHandle = 'source-left';
          }
        }

        const edge: Edge = {
          id: `${prevId}-${quest.id}`,
          source: prevId,
          target: quest.id,
          sourceHandle,
          targetHandle: 'target-top',
          type: 'default',
          className,
          animated: targetAvailable && !targetCompleted,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color:
              className === 'completed'
                ? '#2e7d4e'
                : className === 'available'
                  ? '#888'
                  : '#555',
          },
          style: {
            stroke:
              className === 'completed'
                ? '#2e7d4e'
                : className === 'available'
                  ? '#888'
                  : '#555',
            strokeWidth:
              className === 'completed'
                ? 2.5
                : className === 'available'
                  ? 2.5
                  : 2,
          },
        };
        flowEdges.push(edge);
      });
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [
    elkPositions,
    activeLinkedSnapshot,
    completedQuests,
    isAvailable,
    isLinkedMode,
    toggleQuest,
    highlightedQuestId,
    quests,
  ]);

  // Initialize state hooks with the computed nodes and edges
  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges);

  // Update nodes and edges when completedQuests changes
  useEffect(() => {
    setNodes(nodes);
  }, [nodes, setNodes]);

  useEffect(() => {
    setEdges(edges);
  }, [edges, setEdges]);

  // Handle ?focus= questId param (navigated from Quartermaster)
  useEffect(() => {
    const focusQuestId = searchParams.get('focus');
    if (!focusQuestId || !reactFlowInstance || focusParamAppliedRef.current) return;

    const node = flowNodes.find((n) => n.id === focusQuestId);
    if (node) {
      reactFlowInstance.setCenter(node.position.x + 150, node.position.y + 70, {
        zoom: 1.0,
        duration: 800,
      });
      setHighlightedQuestId(focusQuestId);
      setTimeout(() => {
        setHighlightedQuestId(null);
      }, 2000);

      focusParamAppliedRef.current = true;
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }
  }, [reactFlowInstance, flowNodes, searchParams, setSearchParams]);

  // Filter out map nodes for statistics
  const actualQuests = quests.filter((q) => q.trader !== 'Map');
  const mapNodes = quests
    .filter((q) => q.trader === 'Map')
    .map((q) => ({ ...q, isCompleted: completedQuests.has(q.id) }));
  const availableQuests = actualQuests.filter((quest) => {
    if (isLinkedMode) {
      return getQuestDisplayStatus({
        quest,
        linkedSnapshot: activeLinkedSnapshot,
        linkedCompletedQuests: completedQuests,
      }) === 'active' || getQuestDisplayStatus({
        quest,
        linkedSnapshot: activeLinkedSnapshot,
        linkedCompletedQuests: completedQuests,
      }) === 'available';
    }
    return isAvailable(quest);
  });
  const completedCount = actualQuests.filter((q) =>
    completedQuests.has(q.id)
  ).length;
  const questProgressionOrder = useMemo(() => {
    const questById = new Map(quests.map((quest) => [quest.id, quest]));
    return new Map(
      nodes
        .filter((node) => questById.get(node.id)?.trader !== 'Map')
        .sort((a, b) =>
          a.position.y === b.position.y
            ? a.position.x - b.position.x
            : a.position.y - b.position.y
        )
        .map((node, index) => [node.id, index])
    );
  }, [nodes, quests]);
  const blueprintCompletionById = useMemo(() => {
    const completedByBlueprint = new Map<string, boolean>();
    actualQuests.forEach((quest) => {
      quest.blueprintRewards.forEach((blueprintReward) => {
        if (completedQuests.has(quest.id)) {
          completedByBlueprint.set(blueprintReward.id, true);
        } else if (!completedByBlueprint.has(blueprintReward.id)) {
          completedByBlueprint.set(blueprintReward.id, false);
        }
      });
    });
    return completedByBlueprint;
  }, [actualQuests, completedQuests]);
  const blueprintRewardEntries = useMemo(
    () =>
      actualQuests
        .flatMap((quest) =>
          quest.blueprintRewards.map((blueprintReward, rewardIndex) => ({
            questId: quest.id,
            questName: quest.name,
            blueprintId: blueprintReward.id,
            blueprintName: blueprintReward.name,
            blueprintImageFilename: blueprintReward.imageFilename,
            isCompleted: blueprintCompletionById.get(blueprintReward.id) ?? false,
            progressionIndex:
              questProgressionOrder.get(quest.id) ?? Number.MAX_SAFE_INTEGER,
            rewardIndex,
          }))
        )
        .sort(
          (a, b) =>
            a.progressionIndex - b.progressionIndex ||
            a.rewardIndex - b.rewardIndex ||
            compareText(a.blueprintName, b.blueprintName)
        ),
    [actualQuests, blueprintCompletionById, compareText, questProgressionOrder]
  );

  // Filter quests by search query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return actualQuests.filter((q) => q.name.toLowerCase().includes(query));
  }, [searchQuery, actualQuests]);

  // Handle node clicks
  const onNodeClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_event: any, node: Node) => {
      if (isLinkedMode) return;
      if (node.data.onToggle) {
        node.data.onToggle(node.id);
      }
    },
    [isLinkedMode]
  );

  // Reset all quests
  const handleResetAll = useCallback(() => {
    if (isLinkedMode) return;
    const completedQuestsList = actualQuests
      .filter((q) => completedQuests.has(q.id))
      .map((q) => q.name);

    if (completedQuestsList.length === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: tm('quests.resetAllTitle', {}),
      message: tm('quests.resetAllMessage', {
        count: completedQuestsList.length,
      }),
      questList: completedQuestsList.slice(0, 5),
      showMore: completedQuestsList.length > 5 ? completedQuestsList.length - 5 : 0,
      onConfirm: () => {
        saveCompletedQuests(new Set());
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  }, [actualQuests, completedQuests, isLinkedMode, saveCompletedQuests, tm]);

  // Focus on a specific quest
  const focusOnQuest = useCallback(
    (questId: string) => {
      if (!reactFlowInstance) return;

      const node = flowNodes.find((n) => n.id === questId);
      if (node) {
        reactFlowInstance.setCenter(node.position.x + 150, node.position.y + 70, {
          zoom: 1.0,
          duration: 800,
        });

        // Highlight the quest
        setHighlightedQuestId(questId);

        // Remove highlight after animation completes
        setTimeout(() => {
          setHighlightedQuestId(null);
        }, 2000);
      }
    },
    [reactFlowInstance, flowNodes]
  );

  // Handle search input
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Handle search enter key
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && searchResults.length > 0) {
        focusOnQuest(searchResults[0].id);
      }
    },
    [searchResults, focusOnQuest]
  );

  // Calculate bounds for translateExtent.
  //
  // Before the nodes are known we MUST return an infinite extent. React
  // Flow uses this prop at mount time to build d3-zoom and immediately
  // constrains `defaultViewport` against it, so any restrictive fallback
  // would clamp a restored saved viewport to the top-left corner before
  // the real graph bounds are available.
  const bounds = useMemo(() => {
    if (nodes.length === 0) return [
      [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ] as [[number, number], [number, number]];

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    nodes.forEach((node) => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + 300); // node width
      maxY = Math.max(maxY, node.position.y + 140); // node height
    });

    // Add padding
    const padding = 100;
    return [
      [minX - padding, minY - padding],
      [maxX + padding, maxY + padding],
    ] as [[number, number], [number, number]];
  }, [nodes]);

  const nextAllowedAt = activeLinkedSnapshot?.source === 'embark'
    ? activeLinkedSnapshot.nextAllowedAt ?? null
    : null;
  const nextAllowedMs = nextAllowedAt ? Date.parse(nextAllowedAt) : Number.NaN;
  const syncBlockedUntil = Number.isFinite(nextAllowedMs) && nextAllowedMs > nowMs
    ? nextAllowedAt
    : null;
  const linkedCtaTarget = !cognito.user
    ? '/auth/sign-in'
    : embarkEnabled
      ? '/profile/embark'
      : '/profile/arctracker';
  const linkedCtaLabel = !cognito.user
    ? t('quests.linkedModeSignIn')
    : t('quests.linkedModeLink');
  const linkedModeEmptyBody = !cognito.user
    ? t('quests.linkedModeSignedOutBody')
    : embarkEnabled
      ? t('quests.linkedModeEmbarkBody')
      : t('quests.linkedModeArcTrackerBody');
  const linkedSourceLabel = linkedSource === 'embark' ? 'Embark' : 'ArcTracker';
  const linkedUpdatedAtRaw = activeLinkedSnapshot
    ? activeLinkedSnapshot.source === 'arctracker'
      ? activeLinkedSnapshot.lastModified ?? activeLinkedSnapshot.syncedAt
      : activeLinkedSnapshot.syncedAt
    : null;
  const linkedSnapshotTimestamp = linkedUpdatedAtRaw
    ? formatDate(new Date(linkedUpdatedAtRaw), {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : t('quests.syncNever');
  const syncBlockedUntilLabel = syncBlockedUntil
    ? formatDate(new Date(syncBlockedUntil), {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;
  const formatElapsedTimestamp = useCallback((isoString: string | null): string => {
    if (!isoString) return t('quests.syncNever');
    const syncedMs = Date.parse(isoString);
    if (!Number.isFinite(syncedMs)) return t('quests.syncNever');

    const elapsedSeconds = Math.max(0, Math.floor((nowMs - syncedMs) / 1000));
    if (elapsedSeconds < 60) {
      return t('quests.syncFreshnessNow');
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) {
      return tm('quests.syncFreshnessMinutes', { count: elapsedMinutes });
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return tm('quests.syncFreshnessHours', { count: elapsedHours });
    }

    return tm('quests.syncFreshnessDays', { count: Math.floor(elapsedHours / 24) });
  }, [nowMs, t, tm]);
  const linkedFreshnessLabel = linkedUpdatedAtRaw
    ? formatElapsedTimestamp(linkedUpdatedAtRaw)
    : t('quests.syncNever');
  const shouldDimLinkedTree = isLinkedMode && !linkedSource;
  const isLinkedSyncDisabled =
    !linkedSource || isSyncingLinkedSnapshot || syncBlockedUntil !== null;

  return (
    <>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        questList={confirmDialog.questList}
        showMore={confirmDialog.showMore}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
      <div
        className={`quest-tracker-container ${isLinkedMode ? 'quest-tracker-container--linked' : 'quest-tracker-container--manual'} ${shouldDimLinkedTree ? 'quest-tracker-container--disabled' : ''}`}
      >
        <Sidebar
          actualQuests={actualQuests}
          mapNodes={mapNodes}
          availableQuests={availableQuests}
          completedCount={completedCount}
          readOnly={isLinkedMode}
          onQuestClick={focusOnQuest}
          onMapToggle={toggleQuest}
          onResetAll={handleResetAll}
        />

        <div className="graph-container" ref={graphContainerRef}>
          <div className="quest-mode-toolbar">
            <div className="quest-mode-toolbar__left">
              <QuestSearchOverlay
                searchQuery={searchQuery}
                searchResults={searchResults}
                onSearchChange={handleSearchChange}
                onSearchKeyDown={handleSearchKeyDown}
                onClearSearch={handleClearSearch}
                onQuestClick={focusOnQuest}
              />
              {blueprintRewardEntries.length > 0 && (
                <BlueprintRewardsOverlay
                  entries={blueprintRewardEntries}
                  isCollapsed={isBlueprintOverlayCollapsed}
                  onSetCollapsed={setIsBlueprintOverlayCollapsed}
                  onBlueprintClick={focusOnQuest}
                />
              )}
            </div>
            <div className="quest-mode-toolbar__right">
              <div className="quest-mode-toolbar__status">
                {isLinkedMode ? (
                  linkedSource ? (
                    <>
                      <button
                        type="button"
                        className="quest-mode-toolbar__sync-button"
                        onClick={handleSyncLinkedMode}
                        disabled={isLinkedSyncDisabled}
                        title={`${
                          isSyncingLinkedSnapshot
                            ? t('quests.syncing')
                            : t('quests.sync')
                        }: ${linkedSourceLabel}`}
                      >
                        <RefreshCw size={16} className={isSyncingLinkedSnapshot ? 'animate-spin' : ''} />
                        <span>
                          {isSyncingLinkedSnapshot
                            ? t('quests.syncing')
                            : `${t('quests.sync')}: ${linkedSourceLabel}`}
                        </span>
                      </button>
                      <span
                        className="quest-mode-toolbar__freshness"
                        title={linkedSnapshotTimestamp}
                      >
                        {`${t('quests.syncLastUpdated')}: ${linkedFreshnessLabel}`}
                      </span>
                      {syncBlockedUntilLabel && (
                        <span
                          className="quest-mode-toolbar__freshness quest-mode-toolbar__freshness--warning"
                          title={`${t('quests.syncAvailableAt')}: ${syncBlockedUntilLabel}`}
                        >
                          {t('quests.syncAvailableAt')}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="quest-mode-toolbar__empty">
                      <span
                        className="quest-mode-toolbar__help"
                        title={linkedModeEmptyBody}
                        aria-label={linkedModeEmptyBody}
                      >
                        <CircleHelp size={16} />
                      </span>
                      <Link to={linkedCtaTarget} className="quest-mode-toolbar__cta">
                        {linkedCtaLabel}
                      </Link>
                    </div>
                  )
                ) : (
                  <span
                    className="quest-mode-toolbar__help"
                    title={t('quests.manualModeHint')}
                    aria-label={t('quests.manualModeHint')}
                  >
                    <CircleHelp size={16} />
                  </span>
                )}
              </div>
              <div className="quest-mode-toolbar__switch" role="group" aria-label="Quest mode">
                <button
                  type="button"
                  className={`quest-mode-toolbar__switch-option ${!isLinkedMode ? 'is-active' : ''}`}
                  onClick={() => setMode('manual')}
                >
                  {t('quests.modeManual')}
                </button>
                <button
                  type="button"
                  className={`quest-mode-toolbar__switch-option ${isLinkedMode ? 'is-active' : ''}`}
                  onClick={() => setMode('linked')}
                >
                  {t('quests.modeLinked')}
                </button>
              </div>
            </div>
          </div>
          {linkedSyncError && (
            <div className="quest-mode-toolbar__error">{linkedSyncError}</div>
          )}
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onInit={setReactFlowInstance}
            onMoveEnd={onMoveEnd}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{
              type: 'default',
              markerEnd: { type: MarkerType.ArrowClosed },
            }}
            translateExtent={bounds}
            minZoom={0.1}
            maxZoom={1.5}
            {...(savedViewport ? { defaultViewport: savedViewport } : {})}
            nodesDraggable={false}
            nodesConnectable={false}
          >
            <Controls showInteractive={false} />
            <Background color="#2c2c2c" gap={16} />
          </ReactFlow>
        </div>
      </div>
    </>
  );
}
