import { type LucideIcon } from 'lucide-react';

interface IconProps {
  icon: LucideIcon;
  size?: number;
  color?: string;
  label?: string;
  className?: string;
}

export default function Icon({ icon: IconComponent, size = 16, color, label, className }: IconProps) {
  return (
    <IconComponent
      size={size}
      color={color}
      aria-label={label}
      className={className}
      role={label ? 'img' : undefined}
    />
  );
}
