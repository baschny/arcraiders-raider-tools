import { createPortal } from 'react-dom';
import type { Item, ItemsMap } from '../types/item';
import { getRarityClass, getLocationIcon } from '../utils/dataLoader';
import { PackageSearch, Coins, Weight, Wrench, Recycle, MapPin } from 'lucide-react';

interface ItemInfoBoxProps {
  item: Item;
  itemsMap: ItemsMap;
  position: { x: number; y: number };
  visible: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onContextMenu?: () => void;
  maxHeight?: string;
}

export function ItemInfoBox({ item, itemsMap, position, visible, onMouseEnter, onMouseLeave, onContextMenu, maxHeight }: ItemInfoBoxProps) {
  if (!visible) return null;

  const hasRecipe = item.recipe && Object.keys(item.recipe).length > 0;
  const hasRecycles = item.recyclesInto && Object.keys(item.recyclesInto).length > 0;
  const hasSalvages = item.salvagesInto && Object.keys(item.salvagesInto).length > 0;
  const hasLocations = item.foundIn && item.foundIn.length > 0;

  return createPortal(
    <div
      className="item-info-box"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxHeight: maxHeight,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="item-info-header">
        {item.imageFilename && (
          <img
            src={item.imageFilename}
            alt={item.name.en}
            className={`item-info-icon ${getRarityClass(item.rarity)}`}
          />
        )}
        <div className="item-info-title">
          <h3>{item.name.en}</h3>
          <div className="item-info-badges">
            <span className={`badge badge-type ${item.type.toLowerCase().replace(/\s+/g, '-')}`}>
              {item.type}
            </span>
            <span className={`badge badge-rarity ${getRarityClass(item.rarity)}`}>
              {item.rarity}
            </span>
          </div>
        </div>
      </div>

      {item.description?.en && (
        <div className="item-info-description">
          {item.description.en}
        </div>
      )}

      <div className="item-info-stats">
        {item.stackSize !== undefined && item.stackSize !== null && (
          <div className="item-stat">
            <PackageSearch size={16} />
            <span className="stat-label">Stack Size:</span>
            <span className="stat-value">{item.stackSize}</span>
          </div>
        )}
        {item.weightKg !== undefined && item.weightKg !== null && (
          <div className="item-stat">
            <Weight size={16} />
            <span className="stat-label">Weight:</span>
            <span className="stat-value">{item.weightKg} kg</span>
          </div>
        )}
        {item.value !== undefined && item.value !== null && (
          <div className="item-stat">
            <Coins size={16} />
            <span className="stat-label">Worth:</span>
            <span className="stat-value">{item.value} Coins</span>
          </div>
        )}
        {hasLocations && (
          <div className="item-stat">
            <MapPin size={16} />
            <span className="stat-label">Found In:</span>
            <span className="stat-value">
              {item.foundIn!.map((location, index) => {
                const iconFile = getLocationIcon(location);
                return (
                  <span key={location} className="location-tag">
                    {iconFile && (
                      <img 
                        src={`/images/locations/${iconFile}`} 
                        alt={location}
                        className="location-tag-icon"
                      />
                    )}
                    {location}{index < item.foundIn!.length - 1 ? ', ' : ''}
                  </span>
                );
              })}
            </span>
          </div>
        )}
      </div>

      {hasRecipe && (
        <div className="item-info-section">
          <h4>Crafting Recipe</h4>
          <div className="item-info-materials">
            {Object.entries(item.recipe!).map(([materialId, quantity]) => {
              const material = itemsMap[materialId];
              if (!material) return null;
              return (
                <div key={materialId} className="material-item">
                  {material.imageFilename && (
                    <img
                      src={material.imageFilename}
                      alt={material.name.en}
                      className={`material-icon ${getRarityClass(material.rarity)}`}
                    />
                  )}
                  <span className="material-name">{material.name.en}</span>
                  <span className="material-quantity">×{quantity}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasRecycles && (
        <div className="item-info-section">
          <h4>
            <Recycle size={16} />
            Recycles Into
          </h4>
          <div className="item-info-materials">
            {Object.entries(item.recyclesInto!).map(([materialId, quantity]) => {
              const material = itemsMap[materialId];
              if (!material) return null;
              return (
                <div key={materialId} className="material-item">
                  {material.imageFilename && (
                    <img
                      src={material.imageFilename}
                      alt={material.name.en}
                      className={`material-icon ${getRarityClass(material.rarity)}`}
                    />
                  )}
                  <span className="material-name">{material.name.en}</span>
                  <span className="material-quantity">×{quantity}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasSalvages && (
        <div className="item-info-section">
          <h4>
            <Wrench size={16} />
            Salvages Into
          </h4>
          <div className="item-info-materials">
            {Object.entries(item.salvagesInto!).map(([materialId, quantity]) => {
              const material = itemsMap[materialId];
              if (!material) return null;
              return (
                <div key={materialId} className="material-item">
                  {material.imageFilename && (
                    <img
                      src={material.imageFilename}
                      alt={material.name.en}
                      className={`material-icon ${getRarityClass(material.rarity)}`}
                    />
                  )}
                  <span className="material-name">{material.name.en}</span>
                  <span className="material-quantity">×{quantity}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
