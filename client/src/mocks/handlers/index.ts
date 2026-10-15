import { controlHandler } from '../control';
import { adminContentHandlers } from './adminContent';
import { adminInsightsHandlers } from './adminInsights';
import { promotionHandlers } from './promotions';
import { scheduleHandlers } from './schedule';
import { maintenanceHandlers } from './maintenance';
import { adminMoneyHandlers } from './adminMoney';
import { adminPeopleHandlers } from './adminPeople';
import { publicHandlers } from './public';
import { renterHandlers } from './renter';
import { supabaseAuthHandlers } from './supabaseAuth';

/** Every endpoint of the frozen API contract, plus the Supabase Auth calls. `controlHandler` goes first. */
export const handlers = [
  controlHandler,
  ...supabaseAuthHandlers,
  ...publicHandlers,
  ...renterHandlers,
  ...adminPeopleHandlers,
  ...adminMoneyHandlers,
  ...adminContentHandlers,
  ...adminInsightsHandlers,
  ...promotionHandlers,
  ...scheduleHandlers,
  ...maintenanceHandlers,
];
