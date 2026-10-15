-- iRent seed (B3). Applied by `supabase db reset` after the migrations.
-- The admin user is NOT seeded here (it needs an auth user): see README → "Create the admin user".

-- The 6 sample beds from DESIGN.md (D-3: bunk_type drives the public rate cards).
insert into public.beds (label, room, bunk_type, monthly_rate, status) values
  ('Room 1 – Lower Bunk A', 'Room 1', 'lower', 4500.00, 'vacant'),
  ('Room 1 – Upper Bunk A', 'Room 1', 'upper', 4000.00, 'vacant'),
  ('Room 1 – Lower Bunk B', 'Room 1', 'lower', 4500.00, 'vacant'),
  ('Room 1 – Upper Bunk B', 'Room 1', 'upper', 4000.00, 'vacant'),
  ('Room 2 – Lower Bunk',   'Room 2', 'lower', 4500.00, 'vacant'),
  ('Room 2 – Upper Bunk',   'Room 2', 'upper', 4000.00, 'vacant')
on conflict (label) do nothing;

-- The app_settings singleton row is created by migration 20260925000400_app_settings_row.sql,
-- not here, so hosted databases (which never run this seed) have it too.
