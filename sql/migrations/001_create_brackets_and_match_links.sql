-- Migration: create brackets table and match linking columns
-- Run this on your Supabase/Postgres instance

-- Create brackets table
CREATE TABLE IF NOT EXISTS brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  config jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add bracket_id to matches
ALTER TABLE IF EXISTS matches
  ADD COLUMN IF NOT EXISTS bracket_id uuid REFERENCES brackets(id);

-- Add next_match_id to matches to link child -> parent
ALTER TABLE IF EXISTS matches
  ADD COLUMN IF NOT EXISTS next_match_id uuid REFERENCES matches(id);
