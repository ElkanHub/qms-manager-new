-- ============================================================================
-- Switchboard v2 — the control center. The module catalogue gains CATEGORIES
-- (the switches group under them), ordering, and an `upcoming` flag; every
-- module planned for the platform is registered NOW so it is controllable per
-- tenant from day one:
--
--   document_control — library, numbering, controlled_copies, periodic_review
--   ai               — training (AI-assisted), ai_audit_insights (upcoming)
--   quality          — capa, deviations, audit_findings, effectiveness_review,
--                      regulatory_filings (all upcoming)
--
-- The switches are REAL for upcoming modules too: set_module writes the same
-- tenant_modules row, app.module_enabled answers the same question, the same
-- audit event fires. When a future module's feature code lands, it consumes
-- the switch that already exists — no retrofit. Tenant-side, module-linked
-- surfaces grey out when the switch is off and nudge toward an upgrade.
-- ============================================================================

alter table public.modules add column if not exists category text not null default 'document_control'
  check (category in ('document_control','ai','quality'));
alter table public.modules add column if not exists sort_order int not null default 0;
alter table public.modules add column if not exists upcoming boolean not null default false;

update public.modules set category='document_control', sort_order=1 where key='library';
update public.modules set category='document_control', sort_order=2 where key='numbering';
update public.modules set category='document_control', sort_order=3 where key='controlled_copies';
update public.modules set category='document_control', sort_order=4 where key='periodic_review';
update public.modules set category='ai', sort_order=1,
  description='AI-assisted training packages (slides + assessments generated through the AI gateway, human-gated), assignment, certificates. Subscribing to training includes the AI gateway.'
  where key='training';

-- The future — registered and switchable today, greyed in the product until
-- their feature code ships (each will consume its existing switch).
insert into public.modules (key, label, description, audit_compliant, category, sort_order, upcoming) values
  ('ai_audit_insights', 'AI Audit Insights',
   'AI-computed insight reports over the audit trail and quality data, through the same metered AI gateway.',
   true, 'ai', 2, true),
  ('capa', 'CAPA',
   'Corrective and preventive actions with their own state machine, raising document work through the intake seam.',
   true, 'quality', 1, true),
  ('deviations', 'Deviations',
   'Deviation capture and processing; document changes enter through the one door.',
   true, 'quality', 2, true),
  ('audit_findings', 'Audit Findings',
   'Internal/external audit findings tracking, feeding CAPA and document change.',
   true, 'quality', 3, true),
  ('effectiveness_review', 'Windowed Effectiveness Review',
   'Scheduled effectiveness-review windows on change controls, with reminders and structured criteria.',
   true, 'quality', 4, true),
  ('regulatory_filings', 'Regulatory Filings Register',
   'Open-filings register; adds a real filings pre-check to retirement.',
   true, 'quality', 5, true)
on conflict (key) do update
  set category = excluded.category, sort_order = excluded.sort_order,
      upcoming = excluded.upcoming, description = excluded.description;
