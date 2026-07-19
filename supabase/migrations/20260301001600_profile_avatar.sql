-- ============================================================================
-- Profile avatars — optional, self-managed, audited. The UI falls back to the
-- user's initials whenever avatar_url is null, so a photo is never required.
-- Stored as a small data URL on the user row, mirroring user_signatures.image_data
-- (no storage bucket to provision/secure). Works on BOTH planes — unlike
-- signatures, no tenant is required, so platform operators get one too.
-- ============================================================================

alter table public.users add column if not exists avatar_url text;

-- Same guard shape as assert_signature_image; webp allowed since avatars are
-- downscaled client-side before upload.
create or replace function app.assert_avatar_image(p_image text) returns void
language plpgsql immutable as $$
begin
  if p_image is null or p_image !~ '^data:image/(png|jpeg|webp);base64,' then
    raise exception 'avatar: a PNG, JPEG or WEBP image is required';
  end if;
  if length(p_image) > 400000 then
    raise exception 'avatar: image too large (300 KB max)';
  end if;
end; $$;

create or replace function public.save_user_avatar(p_image text)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_user uuid := auth.uid(); v_ctx record;
begin
  if v_user is null then raise exception 'save_user_avatar: no session'; end if;
  perform app.assert_avatar_image(p_image);
  select * into v_ctx from app.actor_context(v_user);
  update public.users set avatar_url = p_image where id = v_user;
  perform app.write_audit('profile.avatar_set', v_user, null, v_ctx.tenant_id, v_ctx.org_id,
    v_ctx.department_id, 'user', v_user::text, null,
    jsonb_build_object('bytes', length(p_image)), null, 'D-PROFILE');
end; $$;
revoke all on function public.save_user_avatar(text) from public;
grant execute on function public.save_user_avatar(text) to authenticated, service_role;

-- Remove the photo, reverting the UI to initials.
create or replace function public.clear_user_avatar()
returns void language plpgsql security definer set search_path = app, public as $$
declare v_user uuid := auth.uid(); v_ctx record;
begin
  if v_user is null then raise exception 'clear_user_avatar: no session'; end if;
  select * into v_ctx from app.actor_context(v_user);
  update public.users set avatar_url = null where id = v_user;
  perform app.write_audit('profile.avatar_cleared', v_user, null, v_ctx.tenant_id, v_ctx.org_id,
    v_ctx.department_id, 'user', v_user::text, null, '{}'::jsonb, null, 'D-PROFILE');
end; $$;
revoke all on function public.clear_user_avatar() from public;
grant execute on function public.clear_user_avatar() to authenticated, service_role;

-- Add an optional profile-photo step to the locked onboarding defaults (both
-- audiences), right after the profile step so the name is known for the initials
-- fallback. `avatar:true` is the render flag the wizard keys on; it is never
-- required to finish (unlike the signature step). Kept in lockstep with the TS
-- mirror in lib/onboarding-defaults.ts.
create or replace function app.default_onboarding_steps(p_audience text) returns jsonb
language sql immutable as $$
  select case when p_audience = 'org_setup' then '[
    {"key":"profile","title":"Your profile","locked":true,"fields":[
      {"key":"full_name","label":"Full name","type":"text","required":true},
      {"key":"phone","label":"Phone number","type":"text","required":false},
      {"key":"job_title","label":"Job title","type":"text","required":true}]},
    {"key":"avatar","title":"Your profile photo","locked":true,"avatar":true,"fields":[]},
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
    {"key":"avatar","title":"Your profile photo","locked":true,"avatar":true,"fields":[]},
    {"key":"signature","title":"Your signature","locked":true,"signature":true,"fields":[]}
  ]'::jsonb end;
$$;
grant execute on function app.default_onboarding_steps(text) to authenticated, service_role;
