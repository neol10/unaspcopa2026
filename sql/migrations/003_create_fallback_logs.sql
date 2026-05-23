-- Migration: create fallback_logs table for telemetry of fallback events
-- Adds a lightweight table to store fallback/telemetry events from serverless handlers

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.fallback_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fallback_logs IS 'Telemetry: records fallback events from server/API to help diagnose outages and fallbacks';
