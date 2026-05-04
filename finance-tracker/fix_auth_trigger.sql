-- =============================================================================
-- Vaultly — Auth Trigger Hardening
-- File: fix_auth_trigger.sql
--
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- Paste the ENTIRE file and click "Run".
--
-- PURPOSE:
--   The current handle_new_user() trigger has no exception handler.
--   If it throws for ANY reason (missing column, constraint, etc.)
--   it rolls back the ENTIRE auth.users INSERT, meaning:
--     - The user is NOT created in Supabase Auth
--     - Supabase silently returns { error: null, data: { user: null } }
--     - The signup form shows no error (because error === null)
--
--   This hardened version catches ALL exceptions and logs them as
--   warnings rather than allowing them to surface as auth failures.
--   The trigger always returns NEW so auth ALWAYS completes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    currency,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'LKR',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Always return NEW — this allows auth.users INSERT to complete
  -- regardless of what happened with the profile insert.
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Log the error but NEVER block signup.
  -- If profile creation fails, the user can still sign in and
  -- the app will handle a missing profile gracefully.
  RAISE WARNING 'handle_new_user failed for user %: % (SQLSTATE: %)',
    NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

-- Ensure the trigger is correctly attached (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Verify it was created correctly
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
