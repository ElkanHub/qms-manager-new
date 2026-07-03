-- ============================================================================
-- Signing v2 — the collected signatures get USED. When a required role signs
-- a change control, the signer chooses WHICH of their two signatures applies:
-- the drawn/uploaded one or the auto-generated initials (both collected at
-- onboarding; the specimen on Users & roles is the reference sheet). The
-- choice is stored on the signature record and audited.
--
-- Hard rule: no captured signature, no signing — mirroring onboarding's
-- "no signature, no completion". Anyone promoted into a signing role already
-- has one on file.
-- ============================================================================

alter table public.signatures add column if not exists signature_kind text
  check (signature_kind is null or signature_kind in ('drawn','initials'));

drop function if exists public.apply_signature(uuid, text);
create or replace function public.apply_signature(p_cc uuid, p_meaning text, p_kind text default 'drawn')
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; v_caller uuid := auth.uid(); v_role text;
begin
  select * into c from public.change_controls where id=p_cc for update;
  if c.status <> 'signatures_pending' then raise exception 'apply_signature: not awaiting signatures'; end if;
  perform app.enforce_sod(v_caller, c.requester_id, 'apply_signature');
  if p_kind not in ('drawn','initials') then
    raise exception 'apply_signature: signature kind must be drawn or initials'; end if;
  if not exists (select 1 from public.user_signatures where user_id = v_caller) then
    raise exception 'apply_signature: capture your signature first (Account → Signature) — signing requires it';
  end if;
  select role_key into v_role from public.signatures s
    where s.change_control_id=p_cc and s.signed_at is null and not s.waived
      and app.has_role(v_caller, s.role_key, c.department_id)
    limit 1;
  if v_role is null then raise exception 'apply_signature: no open signature slot for your role'; end if;
  update public.signatures
    set signatory_id=v_caller, signed_at=now(), meaning=p_meaning, signature_kind=p_kind
    where change_control_id=p_cc and role_key=v_role;
  perform app.write_audit('signature.applied', v_caller, null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null,
    jsonb_build_object('role', v_role, 'meaning', p_meaning, 'kind', p_kind), null, 'D-SIGN');
  perform app.check_cc_completion(p_cc);
end; $$;
revoke all on function public.apply_signature(uuid, text, text) from public;
grant execute on function public.apply_signature(uuid, text, text) to authenticated, service_role;
