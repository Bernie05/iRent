-- Rollback for 20260925000400_app_settings_row.sql
delete from public.app_settings where id = 1;
