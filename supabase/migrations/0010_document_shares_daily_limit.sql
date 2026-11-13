-- 0010: enforce the per-practice daily send limit atomically.
--
-- The API counts an account's document_shares of the last 24 hours before it
-- inserts a new one. Parallel requests of one account all read the same count,
-- so the limit could be exceeded. This trigger repeats the check inside the
-- insert's own transaction, behind a lock per account, so parallel inserts of
-- one account run one after another and the 51st is refused.
--
-- Keep 50 in step with DAILY_LIMIT_PER_PRACTICE in api/src/lib/shares.ts.
-- The API maps the error message 'daily_share_limit' to HTTP 429.
-- Idempotent: safe to run twice.

create or replace function public.document_shares_daily_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Held until the inserting transaction ends; the count below then sees every
  -- row an earlier parallel insert of this account committed.
  perform pg_advisory_xact_lock(hashtext('document_shares_daily:' || new.user_id::text));
  if (select count(*) from public.document_shares
       where user_id = new.user_id and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'daily_share_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function public.document_shares_daily_limit() from public, anon, authenticated;

drop trigger if exists document_shares_daily_limit on public.document_shares;
create trigger document_shares_daily_limit
  before insert on public.document_shares
  for each row execute function public.document_shares_daily_limit();
