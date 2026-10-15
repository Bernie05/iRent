export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-avatar-sm w-avatar-sm type-label-xs',
  md: 'h-avatar-md w-avatar-md type-label-s',
  lg: 'h-avatar-lg w-avatar-lg type-h4',
};

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Initials avatar (no photo support yet). */
export function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-subtle font-heading font-bold text-brand ${SIZE_CLASSES[size]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
