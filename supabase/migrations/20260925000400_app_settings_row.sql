-- The app_settings singleton row (D-4) is required data, not sample data: the API reads it
-- with a single-row query and has no endpoint that creates it. It lives in a migration so a
-- hosted database set up with `supabase db push` (which never runs seed.sql) still has it.
-- Defaults: reminders on, all five types, three placeholder payment accounts that stay
-- disabled until Bernie fills them in (Settings, R42).
insert into public.app_settings (id, reminders_enabled, reminder_types, payment_accounts) values (
  1,
  true,
  array['due_minus_3', 'due_today', 'overdue_1', 'overdue_3', 'overdue_7'],
  '[
    {"method": "gcash", "enabled": false, "account_name": "Account name (placeholder)", "account_number": "0917 000 0000", "qr_path": null},
    {"method": "maya",  "enabled": false, "account_name": "Account name (placeholder)", "account_number": "0917 000 0000", "qr_path": null},
    {"method": "bpi",   "enabled": false, "account_name": "Account name (placeholder)", "account_number": "0000 0000 00",  "qr_path": null}
  ]'::jsonb
)
on conflict (id) do nothing;
