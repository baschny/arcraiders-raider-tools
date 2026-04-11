import { Handle, Position } from 'reactflow';
import type { MapNodeData } from '../types/quest';
import { MAP_IMAGES } from '../data/static-data';
import { useLocale } from '../../../shared/context/LocaleContext';
import { getLocalizedMapNodeName } from '../utils/localization';

export function MapNode({ data }: { data: MapNodeData }) {
  const { locale, t } = useLocale();
  const { quest, isCompleted, onToggle } = data;
  const mapImage = MAP_IMAGES[quest.id];
  const displayName = getLocalizedMapNodeName(
    quest.map[0],
    quest.name.replace('🗺️ ', ''),
    locale
  );

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
          {isCompleted ? `✓ ${t('quests.mapUnlocked')}` : `🔒 ${t('quests.mapLocked')}`}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
