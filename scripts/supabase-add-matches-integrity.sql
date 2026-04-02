-- Match integrity hardening for Supabase/Postgres
-- Apply in SQL editor after backup.

BEGIN;

-- 1) Team A and Team B must be different.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_team_a_not_team_b_chk'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_team_a_not_team_b_chk
      CHECK (team_a_id IS DISTINCT FROM team_b_id);
  END IF;
END $$;

-- 2) Validate knockout round codes and prevent same team playing twice in one round.
CREATE OR REPLACE FUNCTION public.validate_match_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.round IS NULL OR NEW.round <= 0 THEN
    RAISE EXCEPTION 'Round must be a positive number.';
  END IF;

  -- Reserved knockout codes are 1000..1004.
  IF NEW.round >= 1000 AND NEW.round NOT IN (1000, 1001, 1002, 1003, 1004) THEN
    RAISE EXCEPTION 'Invalid knockout round code: %', NEW.round;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND m.round = NEW.round
      AND (
        m.team_a_id IN (NEW.team_a_id, NEW.team_b_id)
        OR m.team_b_id IN (NEW.team_a_id, NEW.team_b_id)
      )
  ) THEN
    RAISE EXCEPTION 'A team already has a match in this round.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_match_integrity ON public.matches;
CREATE TRIGGER trg_validate_match_integrity
BEFORE INSERT OR UPDATE OF team_a_id, team_b_id, round
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_match_integrity();

-- 3) Query performance helper for validations.
CREATE INDEX IF NOT EXISTS idx_matches_round_team_a ON public.matches(round, team_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_round_team_b ON public.matches(round, team_b_id);

COMMIT;
