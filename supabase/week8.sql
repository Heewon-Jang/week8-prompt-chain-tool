-- Week 8: prompt chain tool. Builds on the week 7 prompt_chains tables.
-- Run this in Supabase Dashboard -> SQL Editor (after week7.sql).
-- Safe to run more than once.

-- Whether a step gets the uploaded image alongside its prompt.
alter table public.prompt_chain_steps
  add column if not exists include_image boolean not null default false;
update public.prompt_chain_steps s set include_image = true
from public.prompt_chains c
where s.chain_id = c.id and c.slug = 'photo';

-- Deferred so two steps can swap places inside one transaction.
alter table public.prompt_chain_steps
  drop constraint if exists prompt_chain_steps_chain_id_step_order_key;
alter table public.prompt_chain_steps
  add constraint prompt_chain_steps_chain_id_step_order_key
  unique (chain_id, step_order) deferrable initially deferred;

-- Swap a step with its neighbour (direction -1 = up, 1 = down).
-- security invoker: the superadmin RLS policies still apply.
create or replace function public.move_prompt_chain_step(step_id bigint, direction int)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cur public.prompt_chain_steps;
  other public.prompt_chain_steps;
begin
  select * into cur from public.prompt_chain_steps where id = step_id;
  if not found then raise exception 'Step not found'; end if;

  select * into other from public.prompt_chain_steps
  where chain_id = cur.chain_id
    and case when direction < 0 then step_order < cur.step_order else step_order > cur.step_order end
  order by case when direction < 0 then -step_order else step_order end
  limit 1;
  if not found then return; end if;

  update public.prompt_chain_steps set step_order = other.step_order where id = cur.id;
  update public.prompt_chain_steps set step_order = cur.step_order where id = other.id;
end;
$$;

-- Media made by a chain: generation_requests already links chain -> image.
create index if not exists generation_requests_chain_id_idx on public.generation_requests (chain_id);

notify pgrst, 'reload schema';
