import dagre from 'dagre';
import type { Node, Edge } from 'reactflow';
import type { ItemsMap } from '../types/item';
import type { CraftingNode, CraftingTree } from './craftingChain';
import type { ItemNodeData } from '../components/ItemNode';

const NODE_WIDTH = 140;
const NODE_HEIGHT = 120;
const RANK_SEP = 150; // Horizontal spacing between levels
const NODE_SEP = 40; // Vertical spacing between nodes

/**
 * Converts a crafting tree into React Flow nodes and edges (separate mode)
 */
export function buildSeparateGraphs(
  trees: CraftingTree[],
  itemsMap: ItemsMap
): { nodes: Node<ItemNodeData>[]; edges: Edge[] } {
  if (trees.length === 0) {
    return { nodes: [], edges: [] };
  }

  const allNodes: Node<ItemNodeData>[] = [];
  const allEdges: Edge[] = [];
  
  // Build dagre graph with invisible root
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'LR',
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
  });

  // Add invisible root node
  const rootId = 'invisible-root';
  dagreGraph.setNode(rootId, { width: 0, height: 0 });
  
  let nodeCounter = 0;
  
  trees.forEach((tree) => {
    const { nodes, edges, rootNodeId } = buildTreeGraphNodes(tree, itemsMap, nodeCounter, dagreGraph);
    
    // Connect goal node to invisible root
    if (rootNodeId) {
      dagreGraph.setEdge(rootId, rootNodeId);
      allEdges.push({
        id: `edge-root-${rootNodeId}`,
        source: rootId,
        target: rootNodeId,
        type: 'smoothstep',
        animated: false,
        style: { opacity: 0 }, // Make edge invisible
      });
    }
    
    allNodes.push(...nodes);
    allEdges.push(...edges);
    nodeCounter += nodes.length + 100; // Offset for next tree
  });

  // Apply dagre layout
  dagre.layout(dagreGraph);

  // Position all nodes, excluding invisible root
  allNodes.forEach((node) => {
    const dagreNode = dagreGraph.node(node.id);
    if (dagreNode) {
      node.position = {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      };
    }
  });

  return { nodes: allNodes, edges: allEdges };
}

/**
 * Builds nodes and edges for a single crafting tree
 */
function buildTreeGraphNodes(
  tree: CraftingTree,
  itemsMap: ItemsMap,
  startCounter: number,
  dagreGraph: dagre.graphlib.Graph
): { nodes: Node<ItemNodeData>[]; edges: Edge[]; rootNodeId: string | null } {
  const nodes: Node<ItemNodeData>[] = [];
  const edges: Edge[] = [];
  const nodeIdMap = new Map<string, string>();
  let nodeCounter = startCounter;
  let rootNodeId: string | null = null;

  function traverse(craftingNode: CraftingNode, parentNodeId?: string, depth: number = 0) {
    const item = itemsMap[craftingNode.itemId];
    if (!item) return;

    // Create unique node ID
    const nodeKey = `${tree.goalItemId}-${craftingNode.itemId}-${depth}-${nodeCounter}`;
    const nodeId = `node-${nodeCounter++}`;
    nodeIdMap.set(nodeKey, nodeId);
    
    // Track the root (goal) node
    if (depth === 0) {
      rootNodeId = nodeId;
    }

    // Add node to dagre
    dagreGraph.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });

    // Add node to React Flow
    nodes.push({
      id: nodeId,
      type: 'itemNode',
      position: { x: 0, y: 0 }, // Will be set by dagre
      data: {
        item,
        quantity: craftingNode.quantity,
        isGoal: depth === 0, // Root node is the goal
      },
    });

    // Add edge from parent
    if (parentNodeId) {
      const edgeId = `edge-${parentNodeId}-${nodeId}`;
      dagreGraph.setEdge(parentNodeId, nodeId);
      edges.push({
        id: edgeId,
        source: parentNodeId,
        target: nodeId,
        type: 'smoothstep',
        animated: false,
      });
    }

    // Process children
    for (const child of craftingNode.children) {
      traverse(child, nodeId, depth + 1);
    }

    // Add salvageable sources as additional nodes
    if (craftingNode.salvageableFrom && craftingNode.salvageableFrom.length > 0) {
      for (const { itemId: salvageItemId, method } of craftingNode.salvageableFrom) {
        const salvageItem = itemsMap[salvageItemId];
        if (!salvageItem) continue;

        const salvageNodeId = `node-salvage-${nodeCounter++}`;
        dagreGraph.setNode(salvageNodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });

        nodes.push({
          id: salvageNodeId,
          type: 'itemNode',
          position: { x: 0, y: 0 },
          data: {
            item: salvageItem,
            quantity: 1,
            isGoal: false,
            salvageMethod: method,
          },
        });

        // Edge from material to salvage source - different style based on method
        const salvageEdgeId = `edge-salvage-${nodeId}-${salvageNodeId}`;
        dagreGraph.setEdge(nodeId, salvageNodeId);
        
        // Salvage: dashed line, Recycle: dotted line
        const edgeStyle = method === 'salvage'
          ? { strokeDasharray: '8 4', stroke: '#4fc3f7' } // Dashed, cyan
          : { strokeDasharray: '2 4', stroke: '#ffa726' }; // Dotted, orange
        
        edges.push({
          id: salvageEdgeId,
          source: nodeId,
          target: salvageNodeId,
          type: 'smoothstep',
          animated: false,
          style: edgeStyle,
        });
      }
    }
  }

  traverse(tree.root);

  return { nodes, edges, rootNodeId };
}

/**
 * Builds a combined graph showing complete trees with merged duplicate nodes
 */
export function buildCombinedGraph(
  trees: CraftingTree[],
  itemsMap: ItemsMap
): { nodes: Node<ItemNodeData>[]; edges: Edge[] } {
  const nodes: Node<ItemNodeData>[] = [];
  const edges: Edge[] = [];
  const nodeMap = new Map<string, string>(); // itemId -> nodeId
  const nodeQuantities = new Map<string, number>(); // itemId -> total quantity
  let nodeCounter = 0;

  // Build dagre graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'LR',
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
  });

  // Process each tree and merge duplicate nodes
  trees.forEach((tree) => {
    function traverse(craftingNode: CraftingNode, parentItemId?: string, isGoal: boolean = false) {
      const itemId = craftingNode.itemId;
      const item = itemsMap[itemId];
      if (!item) return;

      // Get or create node for this item
      let nodeId = nodeMap.get(itemId);
      if (!nodeId) {
        nodeId = `node-${nodeCounter++}`;
        nodeMap.set(itemId, nodeId);
        nodeQuantities.set(itemId, 0);

        // Add to dagre
        dagreGraph.setNode(nodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });

        // Add to React Flow (quantity will be updated)
        nodes.push({
          id: nodeId,
          type: 'itemNode',
          position: { x: 0, y: 0 },
          data: {
            item,
            quantity: 0, // Will be updated
            isGoal,
          },
        });
      }

      // Accumulate quantity
      const currentQty = nodeQuantities.get(itemId) || 0;
      nodeQuantities.set(itemId, currentQty + craftingNode.quantity);

      // Add edge from parent if exists
      if (parentItemId) {
        const parentNodeId = nodeMap.get(parentItemId);
        if (parentNodeId) {
          const edgeId = `edge-${parentNodeId}-${nodeId}`;
          // Only add edge if it doesn't exist yet
          if (!edges.find(e => e.id === edgeId)) {
            dagreGraph.setEdge(parentNodeId, nodeId);
            edges.push({
              id: edgeId,
              source: parentNodeId,
              target: nodeId,
              type: 'smoothstep',
              animated: false,
            });
          }
        }
      }

      // Process children
      for (const child of craftingNode.children) {
        traverse(child, itemId, false);
      }

      // Add salvageable sources
      if (craftingNode.salvageableFrom && craftingNode.salvageableFrom.length > 0) {
        for (const { itemId: salvageItemId, method } of craftingNode.salvageableFrom) {
          const salvageItem = itemsMap[salvageItemId];
          if (!salvageItem) continue;

          // Get or create salvageable node
          let salvageNodeId = nodeMap.get(salvageItemId);
          if (!salvageNodeId) {
            salvageNodeId = `node-${nodeCounter++}`;
            nodeMap.set(salvageItemId, salvageNodeId);
            nodeQuantities.set(salvageItemId, 1);

            dagreGraph.setNode(salvageNodeId, { width: NODE_WIDTH, height: NODE_HEIGHT });
            nodes.push({
              id: salvageNodeId,
              type: 'itemNode',
              position: { x: 0, y: 0 },
              data: {
                item: salvageItem,
                quantity: 1,
                isGoal: false,
                salvageMethod: method,
              },
            });
          }

          // Edge from material to salvage source - different style based on method
          const salvageEdgeId = `edge-salvage-${nodeId}-${salvageNodeId}`;
          if (!edges.find(e => e.id === salvageEdgeId)) {
            dagreGraph.setEdge(nodeId, salvageNodeId);
            
            // Salvage: dashed line, Recycle: dotted line
            const edgeStyle = method === 'salvage'
              ? { strokeDasharray: '8 4', stroke: '#4fc3f7' } // Dashed, cyan
              : { strokeDasharray: '2 4', stroke: '#ffa726' }; // Dotted, orange
            
            edges.push({
              id: salvageEdgeId,
              source: nodeId,
              target: salvageNodeId,
              type: 'smoothstep',
              animated: false,
              style: edgeStyle,
            });
          }
        }
      }
    }

    traverse(tree.root, undefined, true);
  });

  // Update node quantities
  nodes.forEach((node) => {
    const itemId = itemsMap[node.data.item.id]?.id;
    if (itemId) {
      const quantity = nodeQuantities.get(itemId) || node.data.quantity;
      node.data = { ...node.data, quantity };
    }
  });

  // Apply layout
  dagre.layout(dagreGraph);

  // Update positions
  nodes.forEach((node) => {
    const dagreNode = dagreGraph.node(node.id);
    if (dagreNode) {
      node.position = {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      };
    }
  });

  return { nodes, edges };
}
