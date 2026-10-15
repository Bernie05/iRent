import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ImageIcon } from './icons';

export interface AmenityPhoto {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
}

interface AmenityCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Cover photo (the first of the amenity's photos). */
  photo: AmenityPhoto;
  /** Alt text of the cover photo. */
  alt: string;
  icon: ReactNode;
  label: string;
  /** Visible photo count, e.g. "4 photos" (top-right chip). */
  countLabel: string;
  /** `sizes` for the photo's srcSet. */
  sizes?: string;
}

/**
 * Amenity as a 4:5 photo button: cover photo, the name in a pill over the bottom edge and a photo-count chip
 * top-right (pills keep AA whatever the photo shows). Clicking opens the amenity's photos (the caller's Lightbox).
 */
export const AmenityCard = forwardRef<HTMLButtonElement, AmenityCardProps>(function AmenityCard(
  { photo, alt, icon, label, countLabel, sizes, className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="dialog"
      className={`group relative block aspect-[4/5] w-full overflow-hidden rounded-2xl bg-muted text-left transition-transform duration-fast ease-out active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
      {...rest}
    >
      <img
        src={photo.src}
        srcSet={photo.srcSet}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      <span className="type-label-s absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-sm bg-surface px-3 py-1 tabular-nums text-primary shadow-elevation-1">
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
        {countLabel}
      </span>
      <span className="type-body-m-strong absolute bottom-3 left-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-sm bg-surface py-1.5 pl-1.5 pr-4 text-primary shadow-elevation-1">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-muted" aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
    </button>
  );
});
