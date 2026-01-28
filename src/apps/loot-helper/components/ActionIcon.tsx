import { useState } from 'react';
import { Inbox, Wrench, Recycle } from 'lucide-react';
import type { ItemAction } from '../utils/itemAction';

interface ActionIconProps {
  action: ItemAction;
  size?: number;
  className?: string;
}

export function ActionIcon({ action, size = 18, className = '' }: ActionIconProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!action) {
    return null;
  }

  const iconProps = {
    size,
    strokeWidth: 2,
  };

  let Icon;
  let tooltipText: string;
  let colorClass: string;

  switch (action) {
    case 'keep':
      Icon = Inbox;
      tooltipText = 'Keep for crafting';
      colorClass = 'action-keep';
      break;
    case 'salvage':
      Icon = Wrench;
      tooltipText = 'Salvage this item';
      colorClass = 'action-salvage';
      break;
    case 'recycle':
      Icon = Recycle;
      tooltipText = 'Recycle this item';
      colorClass = 'action-recycle';
      break;
  }

  return (
    <div
      className={`action-icon-wrapper ${colorClass} ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Icon {...iconProps} />
      {showTooltip && (
        <div className="action-icon-tooltip">
          {tooltipText}
        </div>
      )}
    </div>
  );
}
