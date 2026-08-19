import { getLocalIconPath } from '../utils/localization';

interface TintedIconProps {
  iconUrl: string;
  color: string;
  size?: number;
}

export function TintedIcon({ iconUrl, color, size = 24 }: TintedIconProps) {
  const path = getLocalIconPath(iconUrl);
  if (!path) return null;
  return (
    <span
      className="schedule-tinted-icon"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: `url(${path})`,
        maskImage: `url(${path})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}
