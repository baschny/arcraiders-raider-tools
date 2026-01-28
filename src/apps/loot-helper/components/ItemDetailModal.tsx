import { useEffect } from 'react';
import type { ItemsMap } from '../types/item';
import type { ReverseMap } from '../utils/craftingChain';
import { ItemHierarchy } from './ItemHierarchy';
import { ItemIconWithInfo } from './ItemIconWithInfo';
import { getRarityClass } from '../utils/dataLoader';
import { X } from 'lucide-react';

interface ItemDetailModalProps {
  itemId: string;
  itemsMap: ItemsMap;
  reverseMap: ReverseMap;
  goalItemIds: string[];
  onClose: () => void;
  onNavigateToItem: (itemId: string) => void;
  onToggleStashItem: (itemId: string) => void;
}

export function ItemDetailModal({ 
  itemId, 
  itemsMap, 
  reverseMap, 
  goalItemIds, 
  onClose,
  onNavigateToItem,
  onToggleStashItem
}: ItemDetailModalProps) {
  const item = itemsMap[itemId];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!item) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
           <div className="modal-title-wrapper">
             <ItemIconWithInfo 
               item={item} 
               itemsMap={itemsMap} 
               className={`modal-item-icon ${getRarityClass(item.rarity)}`}
             />
             <h2>{item.name.en}</h2>
           </div>
           <div className="modal-actions">
             <button 
               className="accordion-item-stash-button modal-stash-button" 
               onClick={() => {
                 onToggleStashItem(item.id);
                 onClose();
               }}
               title="I have already enough of this material"
             >
               −
             </button>
             <button className="modal-close" onClick={onClose}><X size={24} /></button>
           </div>
        </div>
        <div className="modal-body">
           <ItemHierarchy 
             itemId={itemId}
             itemsMap={itemsMap}
             reverseMap={reverseMap}
             goalItemIds={goalItemIds}
             onNavigateToItem={onNavigateToItem}
           />
        </div>
      </div>
    </div>
  );
}
