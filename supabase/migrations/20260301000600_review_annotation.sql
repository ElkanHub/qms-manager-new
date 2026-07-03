-- ============================================================================
-- Review annotation + upload rules (REVIEW_ANNOTATION_ADDENDUM).
--
-- Governing principle: the app is NEVER an editor. SOPs are authored and
-- corrected in Word outside the system; content enters only as a Word-family
-- reference, and the annotation layer highlights + comments without touching
-- a single character.
--
--   1. Word-only in: content references must point at .docx/.doc. Enforced as
--      a table-level trigger — one chokepoint that catches every writer
--      (intake, drafts, re-uploads) now and forever. PDF is an OUTPUT of the
--      copy register, never an input.
--   2. review_comments: highlight-anchored comments, per draft version.
--      Anchoring is text-based (quote + surrounding context), never character
--      offsets. Comments are append-only review history; a corrected
--      re-upload is a NEW draft that starts clean — old comments stay with
--      the draft they were made on (§3.2).
--   3. QA and HOD can annotate (both can request changes); the engine
--      transition is unchanged — this enriches changes_requested, it does not
--      add a state.
-- ============================================================================

-- ---- (1) Upload rule: the Word family or nothing ----
create or replace function app.assert_word_ref(p_ref text) returns void
language plpgsql immutable as $$
begin
  if p_ref is null or length(trim(p_ref)) = 0 then return; end if;
  -- Path part only (query strings allowed), case-insensitive.
  if split_part(lower(trim(p_ref)), '?', 1) !~ '\.(docx|doc)$' then
    raise exception 'Only Microsoft Word files (.docx, .doc) can be uploaded — SOPs are authored in Word; PDF exists only as a copy-register output';
  end if;
end; $$;

create or replace function app.enforce_word_content_ref() returns trigger
language plpgsql as $$
begin
  perform app.assert_word_ref(new.content_ref);
  return new;
end; $$;

drop trigger if exists word_only_content on public.document_versions;
create trigger word_only_content before insert or update of content_ref on public.document_versions
  for each row execute function app.enforce_word_content_ref();
drop trigger if exists word_only_content on public.intake_requests;
create trigger word_only_content before insert or update of content_ref on public.intake_requests
  for each row execute function app.enforce_word_content_ref();

-- ---- (2) Anchored review comments ----
create table if not exists public.review_comments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  org_id              uuid,
  document_version_id uuid not null references public.document_versions(id),
  author_id           uuid not null,
  quote               text not null,   -- the highlighted passage
  prefix              text,            -- surrounding context (locates the passage —
  suffix              text,            --   text anchoring, never char positions)
  comment             text not null,
  created_at          timestamptz not null default now()
);
create index if not exists review_comments_version_idx on public.review_comments (document_version_id);
alter table public.review_comments enable row level security;
alter table public.review_comments force row level security;
drop policy if exists review_comments_read on public.review_comments;
create policy review_comments_read on public.review_comments for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.review_comments to authenticated;

-- ---- (3) Commit a comment (QA or HOD, while the draft is reviewable) ----
create or replace function public.add_review_comment(
  p_version uuid, p_quote text, p_comment text,
  p_prefix text default null, p_suffix text default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions; v_caller uuid := auth.uid(); v_id uuid; begin
  select * into v from public.document_versions where id = p_version;
  if v.id is null or v.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'add_review_comment: no such version'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'hod')) then
    raise exception 'add_review_comment: QA or HOD only'; end if;
  if v.status not in ('draft','in_approval') then
    raise exception 'add_review_comment: this version is no longer under review (is %)', v.status; end if;
  if length(trim(coalesce(p_quote,''))) = 0 then
    raise exception 'add_review_comment: highlight a passage first'; end if;
  if length(trim(coalesce(p_comment,''))) = 0 then
    raise exception 'add_review_comment: a comment is required'; end if;

  insert into public.review_comments(tenant_id, org_id, document_version_id, author_id,
      quote, prefix, suffix, comment)
    values (v.tenant_id, v.org_id, p_version, v_caller,
      trim(p_quote), left(p_prefix, 120), left(p_suffix, 120), trim(p_comment))
    returning id into v_id;
  perform app.write_audit('review.comment_added', v_caller, null, v.tenant_id, v.org_id, v.department_id,
    'review_comment', v_id::text, null,
    jsonb_build_object('version', p_version, 'quote', left(trim(p_quote), 200)),
    trim(p_comment), 'D-REVIEW-ANNOTATE');
  return v_id;
end; $$;
revoke all on function public.add_review_comment(uuid,text,text,text,text) from public;
grant execute on function public.add_review_comment(uuid,text,text,text,text) to authenticated, service_role;
