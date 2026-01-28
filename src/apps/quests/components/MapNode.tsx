import { Handle, Position } from 'reactflow';
import type { MapNodeData } from '../types/quest';
import { MAP_IMAGES } from '../data/static-data';

export function MapNode({ data }: { data: MapNodeData }) {
  const { quest, isCompleted, onToggle } = data;
  const mapImage = MAP_IMAGES[quest.id];
  const displayName = quest.name.replace('🗺️ ', ''); // Remove emoji

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(quest.id);
  };

  return (
    <div
      className={`map-node ${isCompleted ? 'completed' : ''}`}
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Top} />
      {mapImage && (
        <img src={mapImage} alt={displayName} className="map-node-image" />
      )}
      <div className="map-node-content">
        <div className="map-node-name">{displayName}</div>
        <div className="map-node-status">
          {isCompleted ? '✓ Unlocked' : '🔒 Locked'}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
