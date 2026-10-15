/**
 * Demo photos for the public site, mocks and the admin bed cards (free-license stock, see
 * public/images/demo/CREDITS.md). Local paths, so they work offline and in MSW mock mode.
 * They show a modern house and bedspace-style rooms, NOT the actual DECA Homes unit: swap them for
 * Bernie's own photos before launch (same names and sizes, or update this file).
 */
const DIR = '/images/demo';

export interface DemoPhoto {
  src: string;
  srcSet: string;
  width: number;
  height: number;
  /** i18n key of the alt text. */
  altKey: string;
}

const room = (n: number, height: number): DemoPhoto => ({
  src: `${DIR}/room-${n}-1200.webp`,
  srcSet: `${DIR}/room-${n}-600.webp 600w, ${DIR}/room-${n}-1200.webp 1200w`,
  width: 1200,
  height,
  altKey: `public:photos.room${n}`,
});

export const HERO_PHOTO: DemoPhoto = {
  src: `${DIR}/hero-1920.webp`,
  srcSet: `${DIR}/hero-1024.webp 1024w, ${DIR}/hero-1920.webp 1920w`,
  width: 1920,
  height: 1281,
  altKey: 'public:photos.hero',
};

/** Gallery order: bunk room, wooden bunk, metal bunk, single room, kitchen, bathroom. */
export const UNIT_PHOTOS: DemoPhoto[] = [room(1, 800), room(2, 800), room(3, 800), room(4, 674), room(5, 800), room(6, 801)];

/** Rate cards: the two bunk photos from the gallery. */
export const BUNK_PHOTOS = { lower: UNIT_PHOTOS[1], upper: UNIT_PHOTOS[2] } as const;

/** Small (600w) photo URLs for the mock bed fixtures' photo_url. */
export const BED_PHOTO_URLS = [1, 2, 3].map((n) => `${DIR}/room-${n}-600.webp`);

/**
 * Amenity photo (4:5 portrait): `file` is the name without the width suffix, so the folder must hold
 * `<file>-1200.webp` (1200x1500) and `<file>-600.webp` (600x750). `altKey` is the i18n key of the alt text (en + fil).
 */
const amenity = (file: string, altKey: string): DemoPhoto => ({
  src: `${DIR}/${file}-1200.webp`,
  srcSet: `${DIR}/${file}-600.webp 600w, ${DIR}/${file}-1200.webp 1200w`,
  width: 1200,
  height: 1500,
  altKey,
});

/** Stand-in photos (public/images/demo, CREDITS.md), reused across amenities until the real ones arrive. */
const DEMO = {
  pool: amenity('amenity-pool', 'public:amenities.photos.pool'),
  clubhouse: amenity('amenity-clubhouse', 'public:amenities.photos.clubhouse'),
  playground: amenity('amenity-playground', 'public:amenities.photos.playground'),
  basketball: amenity('amenity-basketball', 'public:amenities.photos.basketball'),
  security: amenity('amenity-security', 'public:amenities.photos.security'),
  chapel: amenity('amenity-chapel', 'public:amenities.photos.chapel'),
  jogging: amenity('amenity-jogging', 'public:amenities.photos.jogging'),
};

/**
 * Photos per amenity, keyed like the amenities copy (public:amenities.<key>). The first photo is the card cover;
 * tapping the card opens all of them in the Lightbox. To use real photos, add files named
 * amenity-<key>-<n>-1200.webp / -600.webp (e.g. amenity-pool-1-1200.webp) and list them here, for example
 * amenity('amenity-pool-1', 'public:amenities.photos.pool1'), with that alt key added to en.json and fil.json.
 * Add or remove entries freely; every amenity needs at least one.
 */
export const AMENITY_PHOTOS: Record<string, DemoPhoto[]> = {
  pool: [DEMO.pool, DEMO.jogging, DEMO.clubhouse, DEMO.chapel],
  clubhouse: [DEMO.clubhouse, DEMO.pool, DEMO.chapel],
  playground: [DEMO.playground, DEMO.basketball],
  basketballCourt: [DEMO.basketball, DEMO.playground, DEMO.jogging],
  security: [DEMO.security, DEMO.jogging],
  chapel: [DEMO.chapel, DEMO.clubhouse],
  joggingPath: [DEMO.jogging, DEMO.pool, DEMO.security, DEMO.playground],
};

/** Stand-in images the admin can pick for a promotion (design pass; real promos upload their own). */
export const PROMO_STOCK = [
  { url: `${DIR}/hero-1024.webp`, label: 'House front' },
  { url: `${DIR}/room-1-1200.webp`, label: 'Bunk room' },
  { url: `${DIR}/room-5-1200.webp`, label: 'Kitchen' },
  { url: `${DIR}/amenity-pool-1200.webp`, label: 'Pool' },
  { url: `${DIR}/amenity-clubhouse-1200.webp`, label: 'Clubhouse' },
] as const;
