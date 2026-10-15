import { api } from '../api';
import { toFormData } from '../formData';
import type {
  AdminMethod,
  Announcement,
  AnnouncementKind,
  MaintenanceCategory,
  MaintenanceFilter,
  MaintenanceRequest,
  MaintenanceStatus,
  PhotoUrls,
  AssignBedInput,
  Bed,
  BedStatus,
  Bill,
  BunkType,
  AdminPromotions,
  AnalyticsRange,
  PromoAction,
  PromoSection,
  Promotion,
  ChargeRow,
  CreateExpenseInput,
  DashboardAnalytics,
  Expense,
  RecurringExpense,
  ScheduleViewingInput,
  ScheduleEventInput,
  ScheduleEventResult,
  ScheduleFeed,
  ViewingResult,
  RecurringExpenseInput,
  CreateBillInput,
  CreateRenterInput,
  CreateRenterResult,
  CreditLedger,
  Dashboard,
  ExternalMethod,
  GenerateRentResult,
  Inquiry,
  InquiryStatus,
  ItemType,
  LedgerEntry,
  MoveOutPreview,
  MoveOutResult,
  PayResult,
  Payment,
  Priority,
  RefundInput,
  RejectResult,
  ReminderType,
  RenterRow,
  RentStatusFilter,
  ReviewInput,
  Settings,
  GreetingSettings,
  SignedUrl,
  Tenancy,
  UpdateChargeInput,
  UpdateRenterInput,
  UpdateSharesInput,
  Verification,
} from '../../types/api';

export interface BedInput {
  label: string;
  room: string;
  bunk_type: BunkType;
  monthly_rate: number;
  /** Only `vacant` or `reserved` can be set by hand (BR-6). */
  status: Exclude<BedStatus, 'occupied'>;
  photo?: File | null;
}

export interface RecordPaymentInput {
  item_type: ItemType;
  item_id: string;
  method: AdminMethod;
  amount: number;
  paid_at: string;
  reference_no?: string;
  notes?: string;
  receipt?: File | null;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  priority: Priority;
  pinned: boolean;
  send_email: boolean;
  image?: File | null;
  /** D-25 (R72, R73). `publish_at`: ISO +08:00; "" on a scheduled one = publish now; omitted = unchanged. */
  kind?: AnnouncementKind;
  starts_on?: string;
  ends_on?: string;
  start_time?: string;
  end_time?: string;
  publish_at?: string;
}

/** Proposed (promotions): the Add/Edit form; `image` uploads a file, `image_url` picks a stock photo ('' clears). */
export interface PromotionInput {
  title: string;
  description: string;
  badge: string;
  cta_action: PromoAction;
  cta_label: string;
  cta_section: PromoSection | '';
  starts_on: string;
  ends_on: string;
  visible: boolean;
  image_url?: string;
  image?: File | null;
}

export interface SettingsInput {
  reminders_enabled: boolean;
  reminder_types: ReminderType[];
  payment_accounts: { method: ExternalMethod; enabled: boolean; account_name: string; account_number: string }[];
  qr_files?: Partial<Record<ExternalMethod, File>>;
}

/** Proposed (birthday greeting): the template form; `image` uploads a new picture, `remove_image` clears the saved one. */
export interface GreetingInput {
  enabled: boolean;
  title: string;
  message: string;
  link_label?: string;
  link_url?: string;
  image?: File | null;
  remove_image?: boolean;
}

const id = (value: string) => encodeURIComponent(value);

/** Admin endpoints (`requireRole('admin')`). */
export const adminApi = api.injectEndpoints({
  endpoints: (build) => ({
    getDashboard: build.query<Dashboard, void>({
      query: () => '/dashboard',
      providesTags: ['Dashboard'],
    }),

    // ----- Proposed (promotions) -----
    getPromotions: build.query<AdminPromotions, void>({
      query: () => '/promotions',
      providesTags: ['Promotions'],
    }),
    setPromoSection: build.mutation<AdminPromotions, boolean>({
      query: (visible) => ({ url: '/promotions/section', method: 'PUT', body: { visible } }),
      invalidatesTags: ['Promotions'],
    }),
    reorderPromotions: build.mutation<AdminPromotions, string[]>({
      query: (ids) => ({ url: '/promotions/order', method: 'PUT', body: { ids } }),
      invalidatesTags: ['Promotions'],
    }),
    savePromotion: build.mutation<Promotion, { id?: string } & PromotionInput>({
      query: ({ id: promoId, image, visible, ...fields }) => ({
        url: promoId ? `/promotions/${id(promoId)}` : '/promotions',
        method: promoId ? 'PATCH' : 'POST',
        body: toFormData({ ...fields, visible: String(visible), image }),
      }),
      invalidatesTags: ['Promotions'],
    }),
    deletePromotion: build.mutation<void, string>({
      query: (promoId) => ({ url: `/promotions/${id(promoId)}`, method: 'DELETE' }),
      invalidatesTags: ['Promotions'],
    }),

    // ----- Proposed (dashboard design pass): analytics and expenses -----
    getDashboardAnalytics: build.query<DashboardAnalytics, { range: AnalyticsRange; period?: string }>({
      query: ({ range, period }) => ({ url: '/dashboard/analytics', params: { range, ...(period ? { period } : {}) } }),
      providesTags: ['Dashboard', 'Expenses', 'RentCharges', 'Bills'],
    }),
    getExpenses: build.query<Expense[], { from?: string; to?: string }>({
      query: (params) => ({ url: '/expenses', params }),
      providesTags: ['Expenses'],
    }),
    createExpense: build.mutation<Expense, CreateExpenseInput>({
      query: (body) => ({ url: '/expenses', method: 'POST', body }),
      invalidatesTags: ['Expenses'],
    }),
    updateExpense: build.mutation<Expense, { id: string } & CreateExpenseInput>({
      query: ({ id: expenseId, ...body }) => ({ url: `/expenses/${id(expenseId)}`, method: 'PATCH', body }),
      invalidatesTags: ['Expenses'],
    }),
    getRecurringExpenses: build.query<RecurringExpense[], void>({
      query: () => '/recurring-expenses',
      providesTags: ['Expenses'],
    }),
    saveRecurringExpense: build.mutation<RecurringExpense, { id?: string } & RecurringExpenseInput>({
      query: ({ id: recId, ...body }) => ({ url: recId ? `/recurring-expenses/${id(recId)}` : '/recurring-expenses', method: recId ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Expenses'],
    }),
    deleteRecurringExpense: build.mutation<void, string>({
      query: (recId) => ({ url: `/recurring-expenses/${id(recId)}`, method: 'DELETE' }),
      invalidatesTags: ['Expenses'],
    }),
    deleteExpense: build.mutation<void, string>({
      query: (expenseId) => ({ url: `/expenses/${id(expenseId)}`, method: 'DELETE' }),
      invalidatesTags: ['Expenses'],
    }),

    // ----- Beds (R29) -----
    getBeds: build.query<Bed[], void>({
      query: () => '/beds',
      providesTags: ['Beds'],
    }),
    createBed: build.mutation<Bed, BedInput>({
      query: ({ photo, ...fields }) => ({ url: '/beds', method: 'POST', body: toFormData({ ...fields, photo }) }),
      invalidatesTags: ['Beds', 'AvailableBeds', 'Dashboard'],
    }),
    updateBed: build.mutation<Bed, { id: string } & Partial<BedInput>>({
      query: ({ id: bedId, photo, ...fields }) => ({
        url: `/beds/${id(bedId)}`,
        method: 'PATCH',
        body: toFormData({ ...fields, photo }),
      }),
      invalidatesTags: ['Beds', 'AvailableBeds', 'Dashboard', 'RentCharges'],
    }),
    deleteBed: build.mutation<void, string>({
      query: (bedId) => ({ url: `/beds/${id(bedId)}`, method: 'DELETE' }),
      invalidatesTags: ['Beds', 'AvailableBeds', 'Dashboard'],
    }),

    // ----- Renters and tenancies (R30–R34, R51, R57) -----
    getRenters: build.query<RenterRow[], { search?: string } | void>({
      query: (args) => ({ url: '/renters', params: args?.search ? { search: args.search } : undefined }),
      providesTags: ['Renters'],
    }),
    createRenter: build.mutation<CreateRenterResult, CreateRenterInput>({
      query: (body) => ({ url: '/renters', method: 'POST', body }),
      invalidatesTags: ['Renters', 'Beds', 'AvailableBeds', 'Tenancies', 'Dashboard'],
    }),
    updateRenter: build.mutation<RenterRow, { id: string } & UpdateRenterInput>({
      query: ({ id: renterId, ...body }) => ({ url: `/renters/${id(renterId)}`, method: 'PATCH', body }),
      invalidatesTags: ['Renters'],
    }),
    resendInvite: build.mutation<{ ok: true }, string>({
      query: (renterId) => ({ url: `/renters/${id(renterId)}/resend-invite`, method: 'POST' }),
      invalidatesTags: ['Renters'],
    }),
    getRenterCredit: build.query<CreditLedger, string>({
      query: (renterId) => `/renters/${id(renterId)}/credit`,
      providesTags: (_r, _e, renterId) => [{ type: 'Credit', id: renterId }, 'Credit'],
    }),
    recordRefund: build.mutation<LedgerEntry, { renterId: string } & RefundInput>({
      query: ({ renterId, ...body }) => ({ url: `/renters/${id(renterId)}/refunds`, method: 'POST', body }),
      invalidatesTags: ['Renters', 'Credit', 'Dashboard'],
    }),
    assignBed: build.mutation<Tenancy, AssignBedInput>({
      query: (body) => ({ url: '/tenancies', method: 'POST', body }),
      invalidatesTags: ['Renters', 'Beds', 'AvailableBeds', 'Tenancies', 'Dashboard', 'RentCharges'],
    }),
    getMoveOutPreview: build.query<MoveOutPreview, string>({
      query: (tenancyId) => `/tenancies/${id(tenancyId)}/move-out-preview`,
      keepUnusedDataFor: 0,
    }),
    moveOut: build.mutation<MoveOutResult, { tenancyId: string; move_out: string }>({
      query: ({ tenancyId, move_out }) => ({
        url: `/tenancies/${id(tenancyId)}/move-out`,
        method: 'POST',
        body: { move_out },
      }),
      invalidatesTags: ['Renters', 'Beds', 'AvailableBeds', 'Tenancies', 'Dashboard', 'RentCharges', 'Bills', 'Credit'],
    }),
    getActiveTenancies: build.query<Tenancy[], void>({
      query: () => ({ url: '/tenancies', params: { active: 'true' } }),
      providesTags: ['Tenancies'],
    }),

    // ----- Rent (R35, R36) -----
    getRentCharges: build.query<ChargeRow[], { period?: string; status?: RentStatusFilter }>({
      query: ({ period, status }) => ({
        url: '/rent-charges',
        params: { ...(period ? { period } : {}), ...(status ? { status } : {}) },
      }),
      providesTags: ['RentCharges'],
    }),
    generateRent: build.mutation<GenerateRentResult, { period?: string }>({
      query: (body) => ({ url: '/rent-charges/generate', method: 'POST', body }),
      invalidatesTags: ['RentCharges', 'Renters', 'Dashboard', 'Credit'],
    }),
    updateCharge: build.mutation<ChargeRow, { id: string } & UpdateChargeInput>({
      query: ({ id: chargeId, ...body }) => ({ url: `/rent-charges/${id(chargeId)}`, method: 'PATCH', body }),
      invalidatesTags: ['RentCharges', 'Renters', 'Dashboard', 'Credit'],
    }),
    deleteCharge: build.mutation<void, string>({
      query: (chargeId) => ({ url: `/rent-charges/${id(chargeId)}`, method: 'DELETE' }),
      invalidatesTags: ['RentCharges', 'Renters', 'Dashboard'],
    }),

    // ----- Payments (R37, R38) -----
    getPayments: build.query<Payment[], { verification?: Verification } | void>({
      query: (args) => ({
        url: '/payments',
        params: args?.verification ? { verification: args.verification } : undefined,
      }),
      providesTags: ['Payments'],
    }),
    recordPayment: build.mutation<PayResult, RecordPaymentInput>({
      query: ({ receipt, ...fields }) => ({ url: '/payments', method: 'POST', body: toFormData({ ...fields, receipt }) }),
      invalidatesTags: ['RentCharges', 'Bills', 'Renters', 'Dashboard', 'Payments', 'Credit'],
    }),
    reviewPayment: build.mutation<Payment | RejectResult, { id: string } & ReviewInput>({
      query: ({ id: paymentId, ...body }) => ({ url: `/payments/${id(paymentId)}/review`, method: 'PATCH', body }),
      invalidatesTags: ['Payments', 'Dashboard', 'RentCharges', 'Bills', 'Renters', 'Credit'],
    }),
    getPaymentProof: build.query<SignedUrl, string>({
      query: (paymentId) => `/payments/${id(paymentId)}/proof`,
      keepUnusedDataFor: 0,
    }),

    // ----- Bills (R39) -----
    getBills: build.query<Bill[], void>({
      query: () => '/bills',
      providesTags: ['Bills'],
    }),
    createBill: build.mutation<Bill, CreateBillInput>({
      query: (body) => ({ url: '/bills', method: 'POST', body }),
      invalidatesTags: ['Bills', 'Renters', 'Credit'],
    }),
    updateBillShares: build.mutation<Bill, { billId: string } & UpdateSharesInput>({
      query: ({ billId, ...body }) => ({ url: `/bills/${id(billId)}/shares`, method: 'PUT', body }),
      invalidatesTags: ['Bills', 'Renters', 'Credit'],
    }),

    // ----- Inquiries (R40) -----
    getInquiries: build.query<Inquiry[], { status?: InquiryStatus } | void>({
      query: (args) => ({ url: '/inquiries', params: args?.status ? { status: args.status } : undefined }),
      providesTags: ['Inquiries'],
    }),
    updateInquiry: build.mutation<Inquiry, { id: string; status: InquiryStatus }>({
      query: ({ id: inquiryId, status }) => ({ url: `/inquiries/${id(inquiryId)}`, method: 'PATCH', body: { status } }),
      /** R40: optimistic on the unfiltered inbox; rolled back if the save fails. */
      async onQueryStarted({ id: inquiryId, status }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          adminApi.util.updateQueryData('getInquiries', undefined, (draft) => {
            const row = draft.find((i) => i.id === inquiryId);
            if (row) row.status = status;
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ['Inquiries', 'Dashboard'],
    }),

    // Proposed (admin schedule): events + scheduled viewings in one feed
    getSchedule: build.query<ScheduleFeed, { from: string; to: string }>({
      query: (params) => ({ url: '/schedule', params }),
      providesTags: ['Schedule', 'Inquiries'],
    }),
    saveScheduleEvent: build.mutation<ScheduleEventResult, { id?: string } & ScheduleEventInput>({
      query: ({ id: eventId, ...body }) => ({ url: eventId ? `/schedule-events/${id(eventId)}` : '/schedule-events', method: eventId ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Schedule', 'Announcements', 'Maintenance', 'Dashboard'], // a linked renter notice / request fix changes with the item
    }),
    deleteScheduleEvent: build.mutation<ScheduleEventResult, string>({
      query: (eventId) => ({ url: `/schedule-events/${id(eventId)}`, method: 'DELETE' }),
      invalidatesTags: ['Schedule', 'Announcements', 'Maintenance', 'Dashboard'], // a linked renter notice / request fix changes with the item
    }),

    // Proposed (viewings)
    scheduleViewing: build.mutation<ViewingResult, { id: string } & ScheduleViewingInput>({
      query: ({ id: inquiryId, ...body }) => ({ url: `/inquiries/${id(inquiryId)}/schedule`, method: 'PATCH', body }),
      invalidatesTags: ['Inquiries', 'Dashboard'],
    }),
    cancelViewing: build.mutation<ViewingResult, string>({
      query: (inquiryId) => ({ url: `/inquiries/${id(inquiryId)}/schedule`, method: 'DELETE' }),
      invalidatesTags: ['Inquiries', 'Dashboard'],
    }),

    // ----- Announcements (R41) -----
    getAnnouncements: build.query<Announcement[], void>({
      query: () => '/announcements',
      providesTags: ['Announcements'],
    }),
    createAnnouncement: build.mutation<Announcement, AnnouncementInput>({
      query: ({ image, ...fields }) => ({ url: '/announcements', method: 'POST', body: toFormData({ ...fields, image }) }),
      invalidatesTags: ['Announcements'],
    }),
    updateAnnouncement: build.mutation<Announcement, { id: string } & AnnouncementInput>({
      query: ({ id: announcementId, image, ...fields }) => ({
        url: `/announcements/${id(announcementId)}`,
        method: 'PATCH',
        body: toFormData({ ...fields, image }),
      }),
      invalidatesTags: ['Announcements'],
    }),
    /** D-30: every id once, in the new order. Optimistic; a 400 (stale list, E75) rolls back and the tag refetches. */
    reorderAnnouncements: build.mutation<Announcement[], string[]>({
      query: (ids) => ({ url: '/announcements/order', method: 'PUT', body: { ids } }),
      async onQueryStarted(ids, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          adminApi.util.updateQueryData('getAnnouncements', undefined, (draft) => {
            draft.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ['Announcements'],
    }),
    deleteAnnouncement: build.mutation<void, string>({
      query: (announcementId) => ({ url: `/announcements/${id(announcementId)}`, method: 'DELETE' }),
      invalidatesTags: ['Announcements', 'Schedule'], // unlinks a schedule item's notice
    }),

    // ----- Maintenance requests (D-26, R75) -----
    getMaintenanceRequests: build.query<MaintenanceRequest[], { status: MaintenanceFilter; category: MaintenanceCategory | '' }>({
      query: ({ status, category }) => ({ url: '/maintenance-requests', params: { status, ...(category ? { category } : {}) } }),
      providesTags: ['Maintenance'],
    }),
    updateMaintenanceRequest: build.mutation<MaintenanceRequest, { id: string; status?: MaintenanceStatus; admin_note?: string | null; decline_reason?: string }>({
      query: ({ id: requestId, ...body }) => ({ url: `/maintenance-requests/${id(requestId)}`, method: 'PATCH', body }),
      invalidatesTags: ['Maintenance', 'Dashboard'],
    }),
    getMaintenancePhotos: build.query<PhotoUrls, string>({
      query: (requestId) => `/maintenance-requests/${id(requestId)}/photos`,
      keepUnusedDataFor: 0,
    }),

    // ----- Settings (R42) -----
    getSettings: build.query<Settings, void>({
      query: () => '/settings',
      providesTags: ['Settings'],
    }),
    updateSettings: build.mutation<Settings, SettingsInput>({
      query: ({ qr_files, reminder_types, payment_accounts, reminders_enabled }) => ({
        url: '/settings',
        method: 'PUT',
        body: toFormData({
          reminders_enabled,
          reminder_types: JSON.stringify(reminder_types),
          payment_accounts: JSON.stringify(payment_accounts),
          qr_gcash: qr_files?.gcash,
          qr_maya: qr_files?.maya,
          qr_bpi: qr_files?.bpi,
        }),
      }),
      invalidatesTags: ['Settings', 'PaymentAccounts'],
    }),
    getGreetingSettings: build.query<GreetingSettings, void>({
      query: () => '/settings/birthday-greeting',
      providesTags: ['Greeting'],
    }),
    updateGreetingSettings: build.mutation<GreetingSettings, GreetingInput>({
      query: ({ image, remove_image, ...fields }) => ({
        url: '/settings/birthday-greeting',
        method: 'PUT',
        body: toFormData({ ...fields, image, remove_image: remove_image || undefined }),
      }),
      invalidatesTags: ['Greeting'],
    }),
  }),
});

export const {
  useGetDashboardQuery,
  useGetDashboardAnalyticsQuery,
  useGetPromotionsQuery,
  useSetPromoSectionMutation,
  useReorderPromotionsMutation,
  useSavePromotionMutation,
  useDeletePromotionMutation,
  useGetExpensesQuery,
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useUpdateExpenseMutation,
  useGetRecurringExpensesQuery,
  useSaveRecurringExpenseMutation,
  useDeleteRecurringExpenseMutation,
  useGetBedsQuery,
  useCreateBedMutation,
  useUpdateBedMutation,
  useDeleteBedMutation,
  useGetRentersQuery,
  useCreateRenterMutation,
  useUpdateRenterMutation,
  useResendInviteMutation,
  useGetRenterCreditQuery,
  useRecordRefundMutation,
  useAssignBedMutation,
  useGetMoveOutPreviewQuery,
  useMoveOutMutation,
  useGetActiveTenanciesQuery,
  useGetRentChargesQuery,
  useGenerateRentMutation,
  useUpdateChargeMutation,
  useDeleteChargeMutation,
  useGetPaymentsQuery,
  useRecordPaymentMutation,
  useReviewPaymentMutation,
  useGetPaymentProofQuery,
  useLazyGetPaymentProofQuery,
  useGetBillsQuery,
  useCreateBillMutation,
  useUpdateBillSharesMutation,
  useGetInquiriesQuery,
  useUpdateInquiryMutation,
  useScheduleViewingMutation,
  useGetScheduleQuery,
  useSaveScheduleEventMutation,
  useDeleteScheduleEventMutation,
  useCancelViewingMutation,
  useGetAnnouncementsQuery,
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
  useDeleteAnnouncementMutation,
  useReorderAnnouncementsMutation,
  useGetMaintenanceRequestsQuery,
  useUpdateMaintenanceRequestMutation,
  useGetMaintenancePhotosQuery,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useGetGreetingSettingsQuery,
  useUpdateGreetingSettingsMutation,
} = adminApi;
