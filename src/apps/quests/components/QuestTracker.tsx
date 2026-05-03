import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { useLocale } from '../../../shared/context/LocaleContext';
import { questsStore, useStore } from '../../../shared/state/stores';

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
import {
  isQuestAvailable,
  getAllDependents,
  getAllPrerequisites,
} from '../utils/questHelpers';

interface QuestTrackerProps {
  quests: Quest[];
}

export function QuestTracker({ quests }: QuestTrackerProps) {
  const { tm, compareText } = useLocale();
  // Completed quests live in `questsStore` (phase 2). The store is kept
  // in sync with either localStorage (anonymous) or the server (signed
  // in) by the shared state subsystem.
  const [questState, setQuestState] = useStore(questsStore);
  const completedQuests = useMemo(() => {
    const ids = questState.completedQuestIds ?? [];
    return new Set(migrateQuestIds(ids));
  }, [questState.completedQuestIds]);

  const readCompletedQuests = useCallback((): Set<string> => {
    const ids = questsStore.get().completedQuestIds ?? [];
    return new Set(migrateQuestIds(ids));
  }, []);

  const saveCompletedQuests = useCallback(
    (next: Set<string>) => {
      setQuestState({ completedQuestIds: Array.from(next) });
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
      flowNodes.push({
        id: quest.id,
        type: isMap ? 'mapNode' : 'questNode',
        position: { x: pos.x, y: pos.y },
        data: {
          quest,
          isCompleted: completedQuests.has(quest.id),
          isAvailable: isAvailable(quest),
          isHighlighted: quest.id === highlightedQuestId,
          onToggle: toggleQuest,
        },
        draggable: false,
      });
    });

    const flowEdges: Edge[] = [];
    quests.forEach((quest) => {
      quest.previousQuestIds.forEach((prevId) => {
        const sourceCompleted = completedQuests.has(prevId);
        const targetCompleted = completedQuests.has(quest.id);
        const targetAvailable = isAvailable(quest);

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
    completedQuests,
    isAvailable,
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

  // Filter out map nodes for statistics
  const actualQuests = quests.filter((q) => q.trader !== 'Map');
  const mapNodes = quests
    .filter((q) => q.trader === 'Map')
    .map((q) => ({ ...q, isCompleted: completedQuests.has(q.id) }));
  const availableQuests = actualQuests.filter((q) => isAvailable(q));
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
      if (node.data.onToggle) {
        node.data.onToggle(node.id);
      }
    },
    []
  );

  // Reset all quests
  const handleResetAll = useCallback(() => {
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
  }, [actualQuests, completedQuests, saveCompletedQuests, tm]);

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
      <div className="quest-tracker-container">
        <Sidebar
          actualQuests={actualQuests}
          mapNodes={mapNodes}
          availableQuests={availableQuests}
          completedCount={completedCount}
          onQuestClick={focusOnQuest}
          onMapToggle={toggleQuest}
          onResetAll={handleResetAll}
        />

        <div className="graph-container" ref={graphContainerRef}>
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
          <QuestSearchOverlay
            searchQuery={searchQuery}
            searchResults={searchResults}
            onSearchChange={handleSearchChange}
            onSearchKeyDown={handleSearchKeyDown}
            onQuestClick={focusOnQuest}
          />
          {blueprintRewardEntries.length > 0 && (
            <BlueprintRewardsOverlay
              entries={blueprintRewardEntries}
              isCollapsed={isBlueprintOverlayCollapsed}
              onToggleCollapsed={() =>
                setIsBlueprintOverlayCollapsed((collapsed) => !collapsed)
              }
              onBlueprintClick={focusOnQuest}
            />
          )}
        </div>
      </div>
    </>
  );
}
