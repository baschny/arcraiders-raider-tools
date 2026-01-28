import { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import type { Node, Edge, ReactFlowInstance } from 'reactflow';
import dagre from 'dagre';
import type { Quest } from '../types/quest';
import { QuestNode } from './QuestNode';
import { MapNode } from './MapNode';
import { Sidebar } from './Sidebar';
import { ConfirmDialog } from './ConfirmDialog';
import { STORAGE_KEY } from '../data/static-data';
import {
  isQuestAvailable,
  getAllDependents,
  getAllPrerequisites,
} from '../utils/questHelpers';

interface QuestTrackerProps {
  quests: Quest[];
}

export function QuestTracker({ quests }: QuestTrackerProps) {
  // Load completed quests from localStorage
  const loadCompletedQuests = (): Set<string> => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load quest progress:', e);
    }
    return new Set();
  };

  const [completedQuests, setCompletedQuests] = useState(loadCompletedQuests);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedQuestId, setHighlightedQuestId] = useState<string | null>(
    null
  );
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);

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

  // Save to localStorage whenever completedQuests changes
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(completedQuests))
      );
    } catch (e) {
      console.error('Failed to save quest progress:', e);
    }
  }, [completedQuests]);

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
      setCompletedQuests((prev) => {
        const quest = quests.find((q) => q.id === questId);
        if (!quest) return prev;

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
              title: 'Mark Quest as Incomplete?',
              message: `Marking "${quest.name}" as incomplete will also mark ${dependents.size} dependent quest(s) as incomplete:`,
              questList: dependentNames.slice(0, 5),
              showMore: dependentNames.length > 5 ? dependentNames.length - 5 : 0,
              onConfirm: () => {
                // Remove quest and all dependents
                setCompletedQuests((current) => {
                  const newSet = new Set(current);
                  newSet.delete(questId);
                  dependents.forEach((id) => newSet.delete(id));
                  return newSet;
                });
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
              },
            });
            return prev;
          } else {
            // No dependents, just uncomplete
            const newSet = new Set(prev);
            newSet.delete(questId);
            return newSet;
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
              title: 'Auto-complete Prerequisites?',
              message: `"${quest.name}" has ${incompleteAll.length} incomplete prerequisite(s):`,
              questList: prereqNames.slice(0, 5),
              showMore: prereqNames.length > 5 ? prereqNames.length - 5 : 0,
              onConfirm: () => {
                // Add quest and all prerequisites
                setCompletedQuests((current) => {
                  const newSet = new Set(current);
                  incompleteAll.forEach((id) => newSet.add(id));
                  newSet.add(questId);
                  return newSet;
                });
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
              },
            });
            return prev;
          } else {
            // All prerequisites complete, just complete this quest
            const newSet = new Set(prev);
            newSet.add(questId);
            return newSet;
          }
        }
      });
    },
    [quests]
  );

  // Create nodes using Dagre layout
  const { nodes, edges } = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70 });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes to dagre with appropriate dimensions
    quests.forEach((quest) => {
      const isMap = quest.trader === 'Map';
      g.setNode(quest.id, {
        width: 300, // Same width for both
        height: isMap ? 110 : 140,
      });
    });

    // Add edges to dagre
    quests.forEach((quest) => {
      quest.previousQuestIds.forEach((prevId) => {
        g.setEdge(prevId, quest.id);
      });
    });

    dagre.layout(g);

    // Create React Flow nodes
    const flowNodes: Node[] = quests.map((quest) => {
      const nodeWithPosition = g.node(quest.id);
      const isMap = quest.trader === 'Map';
      const nodeType = isMap ? 'mapNode' : 'questNode';
      const width = 300; // Same width for both types
      const height = isMap ? 110 : 140;

      return {
        id: quest.id,
        type: nodeType,
        position: {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        },
        data: {
          quest,
          isCompleted: completedQuests.has(quest.id),
          isAvailable: isAvailable(quest),
          isHighlighted: quest.id === highlightedQuestId,
          onToggle: toggleQuest,
        },
        draggable: false,
      };
    });

    // Create React Flow edges
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

        const edge: Edge = {
          id: `${prevId}-${quest.id}`,
          source: prevId,
          target: quest.id,
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
  }, [completedQuests, isAvailable, toggleQuest, highlightedQuestId, quests]);

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

  // Calculate bounds for translateExtent
  const bounds = useMemo(() => {
    if (nodes.length === 0) return [
      [0, 0],
      [1000, 1000],
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
          searchQuery={searchQuery}
          searchResults={searchResults}
          onSearchChange={handleSearchChange}
          onSearchKeyDown={handleSearchKeyDown}
          onQuestClick={focusOnQuest}
          onMapToggle={toggleQuest}
        />

        <div className="graph-container">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{
              type: 'default',
              markerEnd: { type: MarkerType.ArrowClosed },
            }}
            translateExtent={bounds}
            fitView
            minZoom={0.3}
            maxZoom={1.5}
            defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
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
