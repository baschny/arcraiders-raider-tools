import type { Quest } from '../types/quest';

interface MapNodeWithStatus extends Quest {
  isCompleted: boolean;
}

interface SidebarProps {
  actualQuests: Quest[];
  mapNodes: MapNodeWithStatus[];
  availableQuests: Quest[];
  completedCount: number;
  searchQuery: string;
  searchResults: Quest[];
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onQuestClick: (questId: string) => void;
  onMapToggle: (mapId: string) => void;
}

export function Sidebar({
  actualQuests,
  mapNodes,
  availableQuests,
  completedCount,
  searchQuery,
  searchResults,
  onSearchChange,
  onSearchKeyDown,
  onQuestClick,
  onMapToggle,
}: SidebarProps) {
  return (
    <div className="available-sidebar">
      <div className="sidebar-stats">
        <div className="sidebar-stat-item">
          <span className="sidebar-stat-icon">✅</span>
          <span className="sidebar-stat-value">
            <span title="Completed Quests">{completedCount}</span>
            <span style={{ margin: '0 4px', color: '#666', fontWeight: 'normal' }}>
              /
            </span>
            <span title="Total Quests">{actualQuests.length}</span>
          </span>
        </div>
        <div className="sidebar-stat-item" title="Available Quests">
          <span className="sidebar-stat-icon">⭐</span>
          <span className="sidebar-stat-value">{availableQuests.length}</span>
        </div>
      </div>

      <div className="available-sidebar-header">
        🗺️ Unlocked Maps ({mapNodes.filter((m) => m.isCompleted).length}/{mapNodes.length})
      </div>

      <div className="available-quests-list">
        {mapNodes.map((mapNode) => (
          <div
            key={mapNode.id}
            className={`available-quest-item ${mapNode.isCompleted ? 'completed' : ''}`}
            onClick={() => mapNode.isCompleted ? onQuestClick(mapNode.id) : onMapToggle(mapNode.id)}
            title={mapNode.isCompleted ? 'Click to view in quest tree' : 'Click to unlock this map'}
          >
            <div className="available-quest-name">{mapNode.name}</div>
            {mapNode.isCompleted && <span className="map-check">✓</span>}
          </div>
        ))}
      </div>

      <div className="available-sidebar-header">
        ⭐ Available Quests ({availableQuests.length})
      </div>

      <div className="available-quests-list">
        {availableQuests.length === 0 ? (
          <div className="no-available-quests">
            No quests available. Complete prerequisites first.
          </div>
        ) : (
          availableQuests.map((quest) => (
            <div
              key={quest.id}
              className="available-quest-item"
              onClick={() => onQuestClick(quest.id)}
              title="Click to focus on this quest"
            >
              <div className="available-quest-name">{quest.name}</div>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          className="search-input"
          placeholder="🔍 Search all quests..."
          value={searchQuery}
          onChange={onSearchChange}
          onKeyDown={onSearchKeyDown}
        />
      </div>

      {searchQuery.trim() && (
        <>
          <div className="available-sidebar-header">
            🔍 Search Results ({searchResults.length})
          </div>
          <div className="search-results-list">
            {searchResults.length === 0 ? (
              <div className="no-available-quests">
                No quests found matching "{searchQuery}"
              </div>
            ) : (
              searchResults.map((quest) => (
                <div
                  key={quest.id}
                  className="available-quest-item"
                  onClick={() => onQuestClick(quest.id)}
                  title="Click to focus on this quest"
                >
                  <div className="available-quest-name">{quest.name}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
