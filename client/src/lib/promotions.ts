import type { Promotion } from '../types/api';

export type PromoStatus = 'visible' | 'hidden' | 'scheduled' | 'expired';

/** Hidden by the admin, not started yet, past its end date, or live. Dates are inclusive Manila business dates. */
export function promoStatus(p: Pick<Promotion, 'visible' | 'starts_on' | 'ends_on'>, today: string): PromoStatus {
  if (!p.visible) return 'hidden';
  if (p.starts_on && p.starts_on > today) return 'scheduled';
  if (p.ends_on && p.ends_on < today) return 'expired';
  return 'visible';
}
