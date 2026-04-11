import { memo } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { Item } from '../types/item';
import { getRarityClass } from '../utils/dataLoader';
import { getItemDisplayName } from '../utils/localization';
import { useLocale } from '../../../shared/context/LocaleContext';

export interface ItemNodeData {
  item: Item;
  quantity?: number;
  isGoal?: boolean;
  isHighlighted?: boolean;
  salvageMethod?: 'salvage' | 'recycle'; // How this item produces materials
}

export const ItemNode = memo(({ data, id }: NodeProps<ItemNodeData>) => {
  const { t } = useLocale();
  const { item, quantity, isGoal, isHighlighted, salvageMethod } = data;
  const rarityClass = getRarityClass(item.rarity);
  const reactFlowInstance = useReactFlow();

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    console.log('Node clicked:', id, getItemDisplayName(item));
    
    const nodes = reactFlowInstance.getNodes();
    const edges = reactFlowInstance.getEdges();
    
    console.log('Total nodes:', nodes.length);
    console.log('Total edges:', edges.length);

    // Find all connected nodes (parents and children)
    const connectedNodeIds = new Set<string>([id]);
    
    // Find parents (traverse edges backwards)
    const findParents = (nodeId: string) => {
      edges.forEach(edge => {
        if (edge.target === nodeId && !connectedNodeIds.has(edge.source)) {
          connectedNodeIds.add(edge.source);
          findParents(edge.source);
        }
      });
    };

    // Find children (traverse edges forwards)
    const findChildren = (nodeId: string) => {
      edges.forEach(edge => {
        if (edge.source === nodeId && !connectedNodeIds.has(edge.target)) {
          connectedNodeIds.add(edge.target);
          findChildren(edge.target);
        }
      });
    };

    findParents(id);
    findChildren(id);
    
    console.log('Connected nodes:', connectedNodeIds.size, Array.from(connectedNodeIds));

    // Update all nodes to set highlight state
    const updatedNodes = nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isHighlighted: connectedNodeIds.has(node.id),
      },
    }));

    // Update all edges to set highlight state
    const updatedEdges = edges.map(edge => ({
      ...edge,
      animated: connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target),
      style: {
        ...edge.style,
        stroke: connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target) 
          ? '#4fc3f7' 
          : edge.style?.stroke || '#555',
        strokeWidth: connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target)
          ? 2.5
          : 2,
      },
    }));

    console.log('Setting updated nodes and edges');
    reactFlowInstance.setNodes(updatedNodes);
    reactFlowInstance.setEdges(updatedEdges);
  };

  // Build class string
  let classes = `item-node ${rarityClass}`;
  if (isGoal) classes += ' goal-item';
  if (isHighlighted === true) classes += ' highlighted';
  if (isHighlighted === false) classes += ' dimmed';
  // if isHighlighted is undefined, no highlight state is applied

  return (
    <div 
      className={classes}
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Left} />
      
      {salvageMethod && (
        <div 
          className={`item-node-method ${salvageMethod}`}
          title={salvageMethod === 'salvage' ? t('lootHelper.actions.salvage') : t('lootHelper.actions.recycle')}
        >
          {salvageMethod === 'salvage' ? '⚡' : '🔧'}
        </div>
      )}
      
      <div className="item-node-icon-wrapper">
        {item.imageFilename && (
          <img
            src={item.imageFilename}
            alt={getItemDisplayName(item)}
            className="item-node-icon"
          />
        )}
        {quantity && quantity > 1 && (
          <div className="item-node-quantity">×{quantity}</div>
        )}
      </div>

      <div className="item-node-name">{getItemDisplayName(item)}</div>
      
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

ItemNode.displayName = 'ItemNode';
