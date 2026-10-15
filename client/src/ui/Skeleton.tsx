export type SkeletonVariant = 'line' | 'card' | 'row';

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  line: 'h-4 w-full rounded',
  card: 'h-32 w-full rounded-lg',
  row: 'h-12 w-full rounded-md',
};

interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
}

/** Loading placeholder (NFR5: only shown after 300ms via useDelayedFlag). Honors reduced motion via CSS. */
export function Skeleton({ variant = 'line', className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-muted motion-reduce:animate-none ${VARIANT_CLASSES[variant]} ${className}`}
    />
  );
}
