# Foundation Invariants — what the Document-Control Core can rely on

This is the stable contract the foundation guarantees. The next plan (document-control
core) builds on these guards and seams without re-implementing them. Each is enforced
server-side (database/RPC) and proven by a `supabase/tests/*.sql` file.

## Guards (never switchable, hold everywhere)

| Guard | Where | How to use it |
|-------|-------|---------------|
| **Total audit** | `app.write_audit(...)` | Call it for every controlled action. It is the *only* sanctioned writer; `audit_trail` rejects all direct writes and all UPDATE/DELETE. |
| **Hash-chained immutability** | `audit_trail` + `app.verify_audit_chain()` | Per-tenant chains; tampering is detectable. Don't touch chain columns. |
| **Tenant isolation** | RLS on every `tenant_id` table + `public.current_tenant_id()` | Add `tenant_id` (never null, never mutated — `app.freeze_tenant_id`) and an RLS policy to every new controlled table. The Phase 7 sweep fails the build if you forget. |
| **Segregation of duties** | `app.enforce_sod(actor, record_owner, action)` | Call at each approval/sign step. Raises if the actor authored/requested the record. |
| **Server-side authority** | SECURITY DEFINER RPCs | Never trust the UI. Model new controlled transitions as RPCs that check role/scope. |
| **Deactivate, not delete** | `app.deactivate_user(...)` | Attribution survives forever; never hard-delete an actor. |

## Identity & roles

- Accounts are born only via `public.accept_invitation(...)` — no self-signup path exists.
- Role helpers: `app.has_role(user, role, department?)`, `app.is_qa(user)`,
  `app.can_provision_users(user)`. Quality-critical roles (`qa`, `approver`, `signatory`)
  are QA-grant-only; enforced in `public.grant_role`.
- Tenant context rides in the signed JWT (`app_metadata.tenant_id` / `platform_role`);
  read it via `current_tenant_id()` / `is_platform()`.

## Governance planes (sealed)

- Org RPCs refuse platform users (no org context); platform RPCs refuse org users
  (no platform scope). Don't cross them.
- Platform access to tenant data is break-glass only: `public.request_tenant_access`,
  `decide_access_request` (consent, default), `has_open_gate`, `log_platform_view`.
  Audit viewing RLS already honors the open gate.

## The seam contract (how modules plug in)

- **Coupling seam** (core asks a module, else safe default): pattern in
  `app.resolve_training(tenant, flow)`. Every seam MUST have a default that keeps the
  flow moving when the module is off/absent.
- **In-flight isolation**: snapshot the module setting with `app.begin_seam_flow(...)`
  at the point the flow engages a seam; resolve against the flow until
  `app.close_seam_flow(...)`. New flows read live state.
- **Trigger seam** (a module starts something in the core): `app.raise_change_request(
  tenant, origin, payload, actor)`. Manual intake and modules call it identically.
- **Connectability**: a module must be `audit_compliant` to be enabled
  (`app.assert_connectable`). A non-auditing module is not connectable.
- **Switchboard**: `public.set_module(...)` (platform, scoped, audited);
  org sees state read-only and files `public.request_module_change(...)`.

## Swap-test (the modularity acceptance)

`app.demo_effective_flow(tenant)` completes correctly whether `training` is on, off, or
absent — only the switch changes. Replicate this shape for every new seam: a stub/default
must let the core run with the real module absent.

---
*Build the document-control state machine on top of these. Do not weaken a guard to make
a workflow simpler — the ease belongs in the workflow layer, the strictness stays here.*
