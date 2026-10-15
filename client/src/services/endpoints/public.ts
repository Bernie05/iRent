import { api } from '../api';
import type { AvailableRate, Health, InquiryInput, Me, Promotion } from '../../types/api';

/** Public endpoints (no auth) plus `/me`, which every logged-in user can call. */
export const publicApi = api.injectEndpoints({
  endpoints: (build) => ({
    getHealth: build.query<Health, void>({
      query: () => '/health',
    }),
    getAvailableBeds: build.query<AvailableRate[], void>({
      query: () => '/beds/available',
      providesTags: ['AvailableBeds'],
    }),
    // Proposed (promotions): visible, in-date promos; [] when the section is switched off.
    getActivePromotions: build.query<Promotion[], void>({
      query: () => '/promotions/active',
      providesTags: ['Promotions'],
    }),
    createInquiry: build.mutation<{ id: string }, InquiryInput>({
      query: (body) => ({ url: '/inquiries', method: 'POST', body }),
      invalidatesTags: ['Inquiries', 'Dashboard'],
    }),
    forgotPassword: build.mutation<{ ok: true }, { email: string }>({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
    }),
    getMe: build.query<Me, void>({
      query: () => '/me',
      providesTags: ['Me'],
    }),
  }),
});

export const {
  useGetHealthQuery,
  useGetAvailableBedsQuery,
  useGetActivePromotionsQuery,
  useCreateInquiryMutation,
  useForgotPasswordMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
} = publicApi;
