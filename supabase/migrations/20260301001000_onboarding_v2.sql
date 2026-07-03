-- ============================================================================
-- Onboarding v2 — two audiences, locked defaults, digital signatures.
--
--   TWO CATEGORIES: 'org_setup' runs ONCE per tenant — whoever completes the
--   tenant's onboarding first (the founding member) sets up the organization
--   (identity, branding). Everyone after gets the 'member' flow. The server
--   decides the audience; the client cannot choose.
--
--   LOCKED DEFAULTS: the default steps live in app.default_onboarding_steps()
--   — CODE, not editable data — so they cannot be changed or deleted from any
--   builder, ever. They collect what the app needs to set up the profile, the
--   org environment, branding, and the signature. Custom steps (stored per
--   tenant+audience) append after them; reserved keys are refused.
--
--   SIGNATURES: everyone's signature is collected at onboarding (anyone can be
--   promoted later and be required to sign). One active signature per user
--   (drawn on canvas / uploaded image / drawn on the phone via a QR token),
--   stored attached to the user; initials are auto-generated from the name at
--   render time. The phone path uses a single-use, 15-minute token so the
--   phone needs no session. Every capture is audited.
-- ============================================================================

-- ---- Two flows per tenant ----
alter table public.onboarding_flows add column if not exists audience text not null default 'member'
  check (audience in ('org_setup','member'));
alter table public.onboarding_flows drop constraint if exists onboarding_flows_pkey;
alter table public.onboarding_flows add primary key (tenant_id, audience);

alter table public.onboarding_responses add column if not exists audience text not null default 'member'
  check (audience in ('org_setup','member'));

-- ---- The locked defaults (code, not data — undeletable by construction) ----
create or replace function app.default_onboarding_steps(p_audience text) returns jsonb
language sql immutable as $$
  select case when p_audience = 'org_setup' then '[
    {"key":"profile","title":"Your profile","locked":true,"fields":[
      {"key":"full_name","label":"Full name","type":"text","required":true},
      {"key":"phone","label":"Phone number","type":"text","required":false},
      {"key":"job_title","label":"Job title","type":"text","required":true}]},
    {"key":"organization","title":"Your organization","locked":true,"fields":[
      {"key":"branding_display_name","label":"Organization display name (on certificates and documents)","type":"text","required":true},
      {"key":"branding_logo_url","label":"Logo URL (https, PNG/JPEG)","type":"text","required":false},
      {"key":"branding_color_primary","label":"Primary color","type":"color","required":false},
      {"key":"branding_color_secondary","label":"Secondary color","type":"color","required":false},
      {"key":"branding_color_accent","label":"Accent color","type":"color","required":false}]},
    {"key":"signature","title":"Your signature","locked":true,"signature":true,"fields":[]}
  ]'::jsonb else '[
    {"key":"profile","title":"Your profile","locked":true,"fields":[
      {"key":"full_name","label":"Full name","type":"text","required":true},
      {"key":"phone","label":"Phone number","type":"text","required":false},
      {"key":"job_title","label":"Job title","type":"text","required":true}]},
    {"key":"signature","title":"Your signature","locked":true,"signature":true,"fields":[]}
  ]'::jsonb end;
$$;
grant execute on function app.default_onboarding_steps(text) to authenticated, service_role;

-- The full flow a user runs: locked defaults first, tenant's custom steps after.
create or replace function app.onboarding_steps(p_tenant uuid, p_audience text) returns jsonb
language sql stable security definer set search_path = app, public as $$
  select app.default_onboarding_steps(p_audience)
      || coalesce((select steps from public.onboarding_flows
                   where tenant_id = p_tenant and audience = p_audience), '[]'::jsonb);
$$;
grant execute on function app.onboarding_steps(uuid, text) to authenticated, service_role;

-- Server-decided audience: the first to complete the tenant's onboarding does
-- the org setup; everyone after is a member.
create or replace function app.onboarding_audience(p_tenant uuid) returns text
language sql stable security definer set search_path = app, public as $$
  select case when exists (select 1 from public.onboarding_responses
                           where tenant_id = p_tenant and audience = 'org_setup')
              then 'member' else 'org_setup' end;
$$;
grant execute on function app.onboarding_audience(uuid) to authenticated, service_role;

-- The runner's one call: which audience am I, and what are my steps?
create or replace function public.my_onboarding()
returns table (audience text, steps jsonb)
language plpgsql stable security definer set search_path = app, public as $$
declare v_ctx record;
begin
  select * into v_ctx from app.actor_context(auth.uid());
  if v_ctx.tenant_id is null then raise exception 'my_onboarding: not an org user'; end if;
  audience := app.onboarding_audience(v_ctx.tenant_id);
  steps := app.onboarding_steps(v_ctx.tenant_id, audience);
  return next;
end; $$;
revoke all on function public.my_onboarding() from public;
grant execute on function public.my_onboarding() to authenticated, service_role;

-- ---- Builder writes CUSTOM steps only; reserved keys refused ----
drop function if exists public.set_onboarding_flow(uuid, jsonb);
create or replace function public.set_onboarding_flow(p_tenant uuid, p_steps jsonb, p_audience text default 'member')
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_old jsonb; v_step jsonb; v_field jsonb; v_key text;
begin
  if not app.has_platform_scope(v_caller, 'switchboard') then
    raise exception 'set_onboarding_flow: requires switchboard scope';
  end if;
  if p_audience not in ('org_setup','member') then
    raise exception 'set_onboarding_flow: audience must be org_setup or member';
  end if;
  if jsonb_typeof(p_steps) <> 'array' then
    raise exception 'set_onboarding_flow: steps must be a JSON array';
  end if;
  for v_step in select * from jsonb_array_elements(p_steps) loop
    v_key := lower(coalesce(v_step->>'key',''));
    if v_key in ('profile','organization','signature') then
      raise exception 'set_onboarding_flow: "%" is a locked default step — it cannot be redefined', v_key;
    end if;
    if length(trim(coalesce(v_step->>'title',''))) = 0 then
      raise exception 'set_onboarding_flow: every step needs a title';
    end if;
    for v_field in select * from jsonb_array_elements(coalesce(v_step->'fields','[]'::jsonb)) loop
      v_key := lower(coalesce(v_field->>'key',''));
      if v_key in ('full_name','phone','job_title','signature_data')
         or v_key like 'branding\_%' escape '\' then
        raise exception 'set_onboarding_flow: field key "%" is reserved by the default steps', v_key;
      end if;
      if coalesce(v_field->>'type','') not in ('text','textarea','select','checkbox','date','number','color') then
        raise exception 'set_onboarding_flow: unknown field type "%"', v_field->>'type';
      end if;
    end loop;
  end loop;

  select steps into v_old from public.onboarding_flows where tenant_id = p_tenant and audience = p_audience;
  insert into public.onboarding_flows(tenant_id, audience, steps, updated_by, updated_at)
    values (p_tenant, p_audience, p_steps, v_caller, now())
    on conflict (tenant_id, audience)
    do update set steps = excluded.steps, updated_by = v_caller, updated_at = now();
  perform app.write_audit('onboarding.flow_set', v_caller, null, p_tenant, null, null,
    'onboarding_flow', p_tenant::text || ':' || p_audience, v_old, p_steps, null, 'S-ONBOARDING');
end; $$;
revoke all on function public.set_onboarding_flow(uuid, jsonb, text) from public;
grant execute on function public.set_onboarding_flow(uuid, jsonb, text) to authenticated, service_role;

-- ---- Signatures: one active per user, attached to the user ----
create table if not exists public.user_signatures (
  user_id    uuid primary key references public.users(id),
  tenant_id  uuid not null references public.tenants(id),
  image_data text not null,           -- data:image/png|jpeg;base64 (small)
  source     text not null check (source in ('drawn','uploaded','phone')),
  updated_at timestamptz not null default now()
);
alter table public.user_signatures enable row level security;
alter table public.user_signatures force row level security;
drop policy if exists user_signatures_read on public.user_signatures;
create policy user_signatures_read on public.user_signatures for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.user_signatures to authenticated;

create or replace function app.assert_signature_image(p_image text) returns void
language plpgsql immutable as $$
begin
  if p_image is null or p_image !~ '^data:image/(png|jpeg);base64,' then
    raise exception 'signature: a PNG or JPEG image is required';
  end if;
  if length(p_image) > 400000 then
    raise exception 'signature: image too large (300 KB max)';
  end if;
end; $$;

create or replace function public.save_user_signature(p_image text, p_source text)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_user uuid := auth.uid(); v_ctx record;
begin
  select * into v_ctx from app.actor_context(v_user);
  if v_ctx.tenant_id is null then raise exception 'save_user_signature: not an org user'; end if;
  if p_source not in ('drawn','uploaded','phone') then
    raise exception 'save_user_signature: source must be drawn, uploaded or phone'; end if;
  perform app.assert_signature_image(p_image);
  insert into public.user_signatures(user_id, tenant_id, image_data, source, updated_at)
    values (v_user, v_ctx.tenant_id, p_image, p_source, now())
    on conflict (user_id) do update
      set image_data = excluded.image_data, source = excluded.source,
          tenant_id = excluded.tenant_id, updated_at = now();
  perform app.write_audit('signature.captured', v_user, null, v_ctx.tenant_id, v_ctx.org_id,
    v_ctx.department_id, 'user_signature', v_user::text, null,
    jsonb_build_object('source', p_source, 'bytes', length(p_image)), null, 'D-SIGNATURE');
end; $$;
revoke all on function public.save_user_signature(text, text) from public;
grant execute on function public.save_user_signature(text, text) to authenticated, service_role;

-- ---- Phone signing via QR: single-use, 15-minute token; no session needed ----
create table if not exists public.signature_tokens (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id),
  tenant_id  uuid not null references public.tenants(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  used_at    timestamptz
);
alter table public.signature_tokens enable row level security;
alter table public.signature_tokens force row level security;
-- No select policy for authenticated: tokens are secrets, handled by RPCs only.

create or replace function public.create_signature_token()
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v_user uuid := auth.uid(); v_ctx record; v_token uuid;
begin
  select * into v_ctx from app.actor_context(v_user);
  if v_ctx.tenant_id is null then raise exception 'create_signature_token: not an org user'; end if;
  insert into public.signature_tokens(user_id, tenant_id) values (v_user, v_ctx.tenant_id)
    returning token into v_token;
  return v_token;
end; $$;
revoke all on function public.create_signature_token() from public;
grant execute on function public.create_signature_token() to authenticated, service_role;

-- Called by the phone page's server action (service role): validates the token,
-- writes the signature AS the token's owner, burns the token, audits.
create or replace function public.save_signature_by_token(p_token uuid, p_image text)
returns void language plpgsql security definer set search_path = app, public as $$
declare t public.signature_tokens; u public.users;
begin
  select * into t from public.signature_tokens where token = p_token for update;
  if t.token is null then raise exception 'save_signature_by_token: invalid link'; end if;
  if t.used_at is not null then raise exception 'save_signature_by_token: this link was already used'; end if;
  if t.expires_at < now() then raise exception 'save_signature_by_token: this link has expired — generate a new QR code'; end if;
  perform app.assert_signature_image(p_image);
  select * into u from public.users where id = t.user_id;
  insert into public.user_signatures(user_id, tenant_id, image_data, source, updated_at)
    values (t.user_id, t.tenant_id, p_image, 'phone', now())
    on conflict (user_id) do update
      set image_data = excluded.image_data, source = 'phone', updated_at = now();
  update public.signature_tokens set used_at = now() where token = p_token;
  perform app.write_audit('signature.captured', t.user_id, u.email, t.tenant_id, u.org_id,
    u.department_id, 'user_signature', t.user_id::text, null,
    jsonb_build_object('source', 'phone', 'bytes', length(p_image)), null, 'D-SIGNATURE');
end; $$;
revoke all on function public.save_signature_by_token(uuid, text) from public;
grant execute on function public.save_signature_by_token(uuid, text) to service_role;

-- Has the phone finished? (polled by the desktop while the QR panel is open)
create or replace function public.my_signature_status()
returns table (has_signature boolean, source text, updated_at timestamptz)
language sql stable security definer set search_path = app, public as $$
  select exists(select 1 from public.user_signatures where user_id = auth.uid()),
         (select s.source from public.user_signatures s where user_id = auth.uid()),
         (select s.updated_at from public.user_signatures s where user_id = auth.uid());
$$;
revoke all on function public.my_signature_status() from public;
grant execute on function public.my_signature_status() to authenticated, service_role;

-- ---- submit_onboarding v2: audience-aware, signature-enforced, profile-stamping ----
create or replace function public.submit_onboarding(p_answers jsonb)
returns void language plpgsql security definer set search_path = app, public as $$
declare
  v_user uuid := auth.uid();
  v_ctx  record;
  v_audience text;
  v_steps jsonb;
  v_step jsonb;
  v_field jsonb;
  v_key text;
begin
  select * into v_ctx from app.actor_context(v_user);
  if v_ctx.tenant_id is null then raise exception 'submit_onboarding: not an org user'; end if;

  v_audience := app.onboarding_audience(v_ctx.tenant_id);
  v_steps := app.onboarding_steps(v_ctx.tenant_id, v_audience);

  -- Required fields across the merged flow (defaults + custom).
  for v_step in select * from jsonb_array_elements(v_steps) loop
    for v_field in select * from jsonb_array_elements(coalesce(v_step->'fields','[]'::jsonb)) loop
      if coalesce((v_field->>'required')::boolean, false) then
        v_key := v_field->>'key';
        if coalesce(p_answers->>v_key, '') = '' then
          raise exception 'submit_onboarding: required field "%" is missing', v_key;
        end if;
      end if;
    end loop;
  end loop;

  -- The signature step is a locked default in BOTH flows: no signature, no completion.
  if not exists (select 1 from public.user_signatures where user_id = v_user) then
    raise exception 'submit_onboarding: capture your signature first — it is required for signing documents';
  end if;

  -- Profile answers stamp the directory (the user record the app runs on).
  if coalesce(p_answers->>'full_name','') <> '' then
    update public.users set full_name = trim(p_answers->>'full_name') where id = v_user;
  end if;

  insert into public.onboarding_responses(user_id, tenant_id, answers, audience)
    values (v_user, v_ctx.tenant_id, coalesce(p_answers, '{}'::jsonb), v_audience)
    on conflict (user_id) do update
      set answers = excluded.answers, audience = excluded.audience, completed_at = now();
  update public.users set onboarded_at = now() where id = v_user;

  perform app.write_audit('onboarding.completed', v_user, null, v_ctx.tenant_id, v_ctx.org_id,
    v_ctx.department_id, 'user', v_user::text, null,
    jsonb_build_object('audience', v_audience, 'fields', p_answers), null, '/onboarding');
end; $$;
