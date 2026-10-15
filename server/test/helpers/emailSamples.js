/** Sample data for every email template (B11 snapshot tests). */
export const rent = { type: 'charge', id: 'c1', period: '2026-10-01' };
export const elec = { type: 'bill_share', id: 's1', period: '2026-10-01', bill_type: 'electricity' };

export const SAMPLES = {
  invite: { name: 'Dan Reyes', link: 'http://localhost:5173/set-password#access_token=abc' },
  'password-reset': { name: 'Ana Cruz', link: 'http://localhost:5173/set-password#access_token=def' },
  'payment-received': {
    name: 'Ana Cruz', amount: 5000, item: rent, method: 'gcash', reference_no: 'GC-5K', remaining: 0, item_status: 'paid',
    credit_added: 500, credit_applied: [{ item: elec, amount: 500 }], credit_balance: 0,
  },
  'admin-payment-notice': {
    renter_name: 'Ana Cruz', item: rent, amount: 5000, method: 'gcash', reference_no: 'GC-5K', credit_added: 500,
    review_url: 'http://localhost:5173/admin/payments',
  },
  'payment-rejected': {
    name: 'Ana Cruz', amount: 5000, item: rent, method: 'gcash', reference_no: 'GC-5K', reason: 'The screenshot does not match our GCash history.',
    credit_reversed: 500, items_reopened: [{ item: elec, remaining: 500 }], credit_balance: 0,
  },
  reminder: { name: 'Ana Cruz', item: rent, remaining: 4500, due_date: '2027-02-28', reminder_type: 'due_minus_3', pay_url: 'http://localhost:5173/portal/pay' },
  announcement: { title: 'Water interruption', body: 'No water tomorrow\n9:00 to 12:00.', priority: 'urgent', url: 'http://localhost:5173/portal' },
  'refund-recorded': { name: 'Cai Santos', amount: 400, method: 'gcash', reference_no: 'RF-1', refunded_at: '2026-10-20', credit_balance: 0, note: 'Deposit settled' },
};

