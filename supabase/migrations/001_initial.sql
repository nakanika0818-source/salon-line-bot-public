-- Run once in a NEW Supabase project. All customer tables are private to the owner.
create table public.admin_users(user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admin_users enable row level security;
create function public.is_owner() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_users where user_id=auth.uid()) $$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated, service_role;
create policy owner_read on public.admin_users for select to authenticated using(user_id=auth.uid());

create table public.faqs(
 id uuid primary key default gen_random_uuid(),category text not null check(category in ('hours','price','booking','combination','parking')),
 question text not null check(length(question) between 1 and 200),answer text not null check(length(answer) between 1 and 1000),
 enabled boolean not null default true,updated_at timestamptz not null default now()
);
create table public.menus(
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 80),
 price_yen integer not null check(price_yen between 0 and 1000000),duration_minutes integer not null check(duration_minutes between 1 and 1440),
 notes text not null default '' check(length(notes)<=300),updated_at timestamptz not null default now()
);
create table public.conversations(
 id uuid primary key default gen_random_uuid(),line_user_id text not null unique,
 mode text not null default 'bot' check(mode in ('bot','human')),updated_at timestamptz not null default now()
);
create table public.webhook_events(
 id text primary key,payload jsonb not null,state text not null default 'pending' check(state in ('pending','processing','completed','failed','uncertain')),
 reply_status text not null default 'pending' check(reply_status in ('pending','sending','sent','unknown','skipped')),
 lease_until timestamptz,created_at timestamptz not null default now()
);
create table public.messages(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.conversations(id) on delete cascade,
 event_id text not null references public.webhook_events(id) on delete cascade,direction text not null check(direction in ('in','out')),
 text text not null,created_at timestamptz not null default now(),unique(event_id,direction)
);
create table public.handoffs(
 id uuid primary key default gen_random_uuid(),event_id text not null unique references public.webhook_events(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,question text not null,
 status text not null default 'open' check(status in ('open','closed')),
 notification_status text not null default 'pending' check(notification_status in ('pending','sent','failed')),created_at timestamptz not null default now()
);
create table public.notification_outbox(
 id uuid primary key default gen_random_uuid(),dedupe_key text not null unique,handoff_id uuid references public.handoffs(id) on delete cascade,
 kind text not null check(kind in ('handoff','usage')),status text not null default 'pending' check(status in ('pending','sent','failed')),
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create table public.ai_requests(
 id uuid primary key default gen_random_uuid(),line_user_id text not null,cost_usd numeric(12,6) not null,
 input_tokens integer,output_tokens integer,created_at timestamptz not null default now()
);
create index on public.messages(created_at desc);
create index on public.handoffs(status,created_at desc);
create index on public.webhook_events(state,created_at);
create index on public.ai_requests(created_at,line_user_id);

do $$ declare t text; begin
 foreach t in array array['faqs','menus','conversations','messages','handoffs','webhook_events','notification_outbox','ai_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_select on public.%I for select to authenticated using(public.is_owner())',t);
 end loop;
 foreach t in array array['faqs','menus'] loop
  execute format('create policy owner_write on public.%I for all to authenticated using(public.is_owner()) with check(public.is_owner())',t);
 end loop;
end $$;
grant usage on schema public to authenticated,service_role;
grant select on public.admin_users,public.faqs,public.menus,public.conversations,public.messages,public.handoffs,public.webhook_events,public.notification_outbox,public.ai_requests to authenticated;
grant insert,update,delete on public.faqs,public.menus to authenticated;
grant all on all tables in schema public to service_role;
-- Other writes only through server-side service role. Owners cannot arbitrarily edit jobs or usage.

create function public.claim_event(event_key text) returns setof public.webhook_events
language sql security definer set search_path=public as $$
 update public.webhook_events set state='processing',lease_until=now()+interval '90 seconds'
 where id=event_key and reply_status='pending'
 and (state='pending' or (state='processing' and lease_until<now())) returning *
$$;

create function public.reserve_ai(uid text,reserve_usd numeric,month_limit int,day_limit int,budget_usd numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; month_start timestamptz; day_start timestamptz; begin
 perform pg_advisory_xact_lock(908172);
 month_start:=date_trunc('month',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
 day_start:=date_trunc('day',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
 if reserve_usd<=0 or month_limit<=0 or day_limit<=0 or budget_usd<=0 then return null; end if;
 if (select count(*) from public.ai_requests where created_at>=month_start)>=month_limit
 or (select count(*) from public.ai_requests where created_at>=day_start and line_user_id=uid)>=day_limit
 or coalesce((select sum(cost_usd) from public.ai_requests where created_at>=month_start),0)+reserve_usd>budget_usd then return null; end if;
 insert into public.ai_requests(line_user_id,cost_usd) values(uid,reserve_usd) returning id into rid;
 return rid;
end $$;

create function public.open_handoff(event_key text,conversation_key uuid,question_text text)
returns uuid language plpgsql security definer set search_path=public as $$
declare hid uuid; begin
 update public.conversations set mode='human',updated_at=now() where id=conversation_key;
 insert into public.handoffs(event_id,conversation_id,question) values(event_key,conversation_key,question_text)
 on conflict(event_id) do update set event_id=excluded.event_id returning id into hid;
 insert into public.notification_outbox(dedupe_key,handoff_id,kind) values('handoff:'||event_key,hid,'handoff') on conflict(dedupe_key) do nothing;
 return hid;
end $$;

create function public.resume_conversation(conversation_key uuid)
returns void language plpgsql security definer set search_path=public as $$ begin
 update public.handoffs set status='closed' where conversation_id=conversation_key and status='open';
 update public.conversations set mode='bot',updated_at=now() where id=conversation_key;
end $$;

create function public.retain_recent_data() returns void language plpgsql security definer set search_path=public as $$ begin
 delete from public.webhook_events where created_at<now()-interval '30 days';
 -- Keep only non-identifying monthly cost information until the next full month has passed.
 update public.ai_requests set line_user_id='expired' where created_at<now()-interval '30 days';
 delete from public.ai_requests where created_at<date_trunc('month',now())-interval '2 months';
 delete from public.notification_outbox where created_at<now()-interval '30 days';
 delete from public.conversations where updated_at<now()-interval '30 days'
 and not exists(select 1 from public.messages where conversation_id=public.conversations.id);
end $$;

revoke all on function public.claim_event(text) from public,anon,authenticated;
revoke all on function public.reserve_ai(text,numeric,int,int,numeric) from public,anon,authenticated;
revoke all on function public.open_handoff(text,uuid,text) from public,anon,authenticated;
revoke all on function public.resume_conversation(uuid) from public,anon,authenticated;
revoke all on function public.retain_recent_data() from public,anon,authenticated;
grant execute on function public.claim_event(text),public.reserve_ai(text,numeric,int,int,numeric),public.open_handoff(text,uuid,text),public.resume_conversation(uuid),public.retain_recent_data() to service_role;
