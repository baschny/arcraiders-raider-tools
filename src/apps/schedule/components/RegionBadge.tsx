import type { RegionInfo } from '../types/mapEvents';

interface RegionBadgeProps {
  region: RegionInfo;
  className?: string;
  discrete?: boolean;
  glow?: boolean;
}

const NEUTRAL = '#8a8a8a';

export function RegionBadge({ region, className, discrete, glow }: RegionBadgeProps) {
  const color = discrete ? NEUTRAL : region.color;
  return (
    <span
      className={`schedule-region-badge ${className ?? ''}`}
      style={{
        color,
        borderColor: color,
        backgroundColor: discrete ? 'transparent' : `${color}1f`,
        boxShadow: glow ? `0 0 7px 2px ${color}` : undefined,
      }}
    >
      {region.shortCode}
    </span>
  );
}
