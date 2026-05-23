# SQL pack for a new Supabase project

Run these files in order:

1. `00_extensions_and_helpers.sql`
2. `01_core_schema.sql`
3. `02_app_columns_and_constraints.sql`
4. `03_rls_policies.sql`

Notes:

- This pack is meant for a fresh Supabase project, but it still assumes Supabase Auth exists and that authenticated users can be linked through `auth.users`.
- The notification stack in this repo is web push / VAPID, not Firebase.
- If you already created any of these tables manually, the scripts use `create table if not exists` and `add column if not exists` where possible.
- The admin UI reads several tables directly, so the RLS policies keep public reads open and restrict writes to admin users.
- If you want a stricter setup later, the safest next step is to narrow the public policies after the new project is confirmed working.
