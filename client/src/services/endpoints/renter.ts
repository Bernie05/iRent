import { api } from '../api';
import { toFormData } from '../formData';
import type {
  Balance,
  ChargeRow,
  CreditLedger,
  ExternalMethod,
  Greeting,
  ItemType,
  MaintenanceCategory,
  MaintenanceRequest,
  MaintenanceUrgency,
  MyAnnouncements,
  PhotoUrls,
  PayResult,
  Payment,
  PaymentAccount,
  ShareRow,
  SignedUrl,
} from '../../types/api';

export interface SubmitPaymentInput {
  item_type: ItemType;
  item_id: string;
  method: ExternalMethod;
  amount: number;
  reference_no: string;
  proof: File;
}

export interface NewMaintenanceRequest {
  category: MaintenanceCategory;
  urgency: MaintenanceUrgency;
  description: string;
  photos: File[];
}

/** Renter endpoints (`requireRole('renter')`). */
export const renterApi = api.injectEndpoints({
  endpoints: (build) => ({
    getMyCharges: build.query<ChargeRow[], void>({
      query: () => '/me/charges',
      providesTags: ['Charges'],
    }),
    getMyBills: build.query<ShareRow[], void>({
      query: () => '/me/bills',
      providesTags: ['Bills'],
    }),
    getMyBalance: build.query<Balance, void>({
      query: () => '/me/balance',
      providesTags: ['Balance'],
    }),
    getMyCredit: build.query<CreditLedger, void>({
      query: () => '/me/credit',
      providesTags: ['Credit'],
    }),
    getMyPayments: build.query<Payment[], void>({
      query: () => '/me/payments',
      providesTags: ['Payments'],
    }),
    getMyPaymentProof: build.query<SignedUrl, string>({
      query: (paymentId) => `/me/payments/${encodeURIComponent(paymentId)}/proof`,
      // Signed URLs last 5 minutes (NFR1): never serve a stale one from cache.
      keepUnusedDataFor: 0,
    }),
    submitPayment: build.mutation<PayResult, SubmitPaymentInput>({
      query: ({ proof, ...fields }) => ({
        url: '/me/payments',
        method: 'POST',
        body: toFormData({ ...fields, proof }),
      }),
      invalidatesTags: ['Charges', 'Bills', 'Balance', 'Payments', 'Credit'],
    }),
    getMyPaymentAccounts: build.query<PaymentAccount[], void>({
      query: () => '/me/payment-accounts',
      providesTags: ['PaymentAccounts'],
    }),
    getMyAnnouncements: build.query<MyAnnouncements, void>({
      query: () => '/me/announcements',
      providesTags: ['Announcements'],
    }),
    /** Proposed (birthday greeting): the rendered greeting on the renter's birthday (Manila), else null. */
    getMyGreeting: build.query<Greeting | null, void>({
      query: () => '/me/greeting',
      providesTags: ['Greeting'],
    }),
    /** D-26 (R74): own requests, newest first. */
    getMyMaintenanceRequests: build.query<MaintenanceRequest[], void>({
      query: () => '/me/maintenance-requests',
      providesTags: ['Maintenance'],
    }),
    createMaintenanceRequest: build.mutation<MaintenanceRequest, NewMaintenanceRequest>({
      query: ({ photos, ...fields }) => {
        const body = toFormData({ ...fields });
        photos.forEach((p) => body.append('photos', p));
        return { url: '/me/maintenance-requests', method: 'POST', body };
      },
      invalidatesTags: ['Maintenance'],
    }),
    /** Signed URLs last 5 minutes: never cached. */
    getMyMaintenancePhotos: build.query<PhotoUrls, string>({
      query: (id) => `/me/maintenance-requests/${encodeURIComponent(id)}/photos`,
      keepUnusedDataFor: 0,
    }),
    /** R18: optimistic, so the unread indicator, badge and tab dot update at once. */
    markAnnouncementRead: build.mutation<void, string>({
      query: (id) => ({ url: `/me/announcements/${encodeURIComponent(id)}/read`, method: 'POST' }),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          renterApi.util.updateQueryData('getMyAnnouncements', undefined, (draft) => {
            const item = draft.items.find((a) => a.id === id);
            if (item && !item.is_read) {
              item.is_read = true;
              draft.unread_count = Math.max(0, draft.unread_count - 1);
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
  }),
});

export const {
  useGetMyChargesQuery,
  useGetMyBillsQuery,
  useGetMyBalanceQuery,
  useGetMyCreditQuery,
  useGetMyPaymentsQuery,
  useLazyGetMyPaymentProofQuery,
  useSubmitPaymentMutation,
  useGetMyPaymentAccountsQuery,
  useGetMyAnnouncementsQuery,
  useMarkAnnouncementReadMutation,
  useGetMyGreetingQuery,
  useGetMyMaintenanceRequestsQuery,
  useCreateMaintenanceRequestMutation,
  useGetMyMaintenancePhotosQuery,
} = renterApi;
