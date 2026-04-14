begin;

-- Rate limit para evitar spam em feedback_reports.
-- Regras (ajuste se quiser):
-- - autenticado (user_id != null): max 5 inserts por 10 minutos por user_id
-- - anon (user_id is null): max 3 inserts por 10 minutos por user_agent (se vazio, por page_path)

create index if not exists idx_feedback_reports_user_id_created_at
  on public.feedback_reports (user_id, created_at desc)
  where user_id is not null;

create index if not exists idx_feedback_reports_user_agent_created_at
  on public.feedback_reports (user_agent, created_at desc)
  where user_id is null;

create index if not exists idx_feedback_reports_page_path_created_at
  on public.feedback_reports (page_path, created_at desc)
  where user_id is null;

create or replace function public.enforce_feedback_reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  window_start timestamptz := now() - interval '10 minutes';
  recent_count integer;
  ua_key text;
  path_key text;
begin
  -- Rate limit por usuário autenticado
  if new.user_id is not null then
    select count(*) into recent_count
    from public.feedback_reports fr
    where fr.user_id = new.user_id
      and fr.created_at >= window_start;

    if recent_count >= 5 then
      raise exception 'RATE_LIMIT: too_many_reports' using errcode = 'P0001';
    end if;

    return new;
  end if;

  -- Rate limit para anônimo
  ua_key := left(coalesce(nullif(trim(new.user_agent), ''), ''), 200);
  path_key := left(coalesce(nullif(trim(new.page_path), ''), ''), 200);

  if ua_key <> '' then
    select count(*) into recent_count
    from public.feedback_reports fr
    where fr.user_id is null
      and coalesce(fr.user_agent, '') = ua_key
      and fr.created_at >= window_start;

    if recent_count >= 3 then
      raise exception 'RATE_LIMIT: too_many_reports' using errcode = 'P0001';
    end if;

    return new;
  end if;

  -- Se não tiver user_agent, limita por page_path (fallback)
  if path_key <> '' then
    select count(*) into recent_count
    from public.feedback_reports fr
    where fr.user_id is null
      and coalesce(fr.page_path, '') = path_key
      and fr.created_at >= window_start;

    if recent_count >= 3 then
      raise exception 'RATE_LIMIT: too_many_reports' using errcode = 'P0001';
    end if;

    return new;
  end if;

  -- Último fallback: limite global para anônimos sem identificação
  select count(*) into recent_count
  from public.feedback_reports fr
  where fr.user_id is null
    and fr.created_at >= window_start;

  if recent_count >= 20 then
    raise exception 'RATE_LIMIT: too_many_reports' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_feedback_reports_rate_limit on public.feedback_reports;
create trigger trg_feedback_reports_rate_limit
before insert on public.feedback_reports
for each row
execute function public.enforce_feedback_reports_rate_limit();

commit;
