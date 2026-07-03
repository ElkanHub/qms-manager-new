# Platform Foundations — settle before the build plan

> **What this document is.** This is *not* the build plan. It is the set of foundational decisions that the build plan will stand on — the things that are expensive to change once code exists. The goal is to resolve them deliberately, up front, so we never have to retrofit a fundamental at the core later. Each section states the principle, how it works, and the **open questions** we need to settle by discussion (marked **▶ DECIDE**).
>
> **How to use it.** Read each section. Most decision points are now **settled** (marked **✓ DECIDED**); a few minor confirmations remain (marked **▶**). The one trust sub-point worth a final word is the platform-admin access gate in §4.3. See §7 for the full ledger.

---

## 1. Modularity — the core runs alone, modules plug in

### 1.1 Principle

The document-control engine is the **core**. Everything else — training/LMS, controlled-copy register, CAPA, deviation, audit-findings intake, periodic-review scheduling — is a **module**. The core must run correctly and completely with **zero modules connected**. A module being absent, turned off, or failing must never break a core flow; it can only remove an *optional capability*.

This is what makes the platform configurable per tenant: the platform admin board exposes each module as a switch, and turning a module off for a tenant simply means the core takes its default path past that seam.

### 1.2 The seam contract

A module connects to the core only through a **defined seam**. It never reads or writes the core's tables directly. There are two kinds of seam:

- **Trigger seams (inbound).** A module asks the core to start something. Example: a CAPA concludes "this SOP must change" and calls the core's "raise a change request" entry point. The core does not know or care that a CAPA raised it — it just receives a well-formed change request with references attached. Any number of modules can use a trigger seam identically.

- **Coupling seams (bidirectional).** The core reaches a point where it *can* defer to a module, and waits for an answer. Example: at the effective window, the core asks "is training required and, if so, is the threshold met?" If the training module is connected, it answers. If it is not connected, the core uses its **default resolution** (see §1.3).

### 1.3 Default resolution — the flow never breaks

Every coupling seam has a **defined default** the core uses when the module is off or absent. The default must be *safe* and must keep the flow moving:

| Seam | Module connected | Module OFF / absent — default |
|------|------------------|-------------------------------|
| Training (at effective window) | Module tracks completion, reports threshold | Core treats training as **not required** → document goes effective directly. (Training simply isn't a gate for this tenant.) |
| Controlled-copy register (at reconciliation) | Register lists copies; all must be accounted | Core treats reconciliation as **nothing to reconcile** → passes directly. (Paperless tenant.) |
| CAPA / deviation / findings (trigger seams) | Module can raise change requests | Core simply never receives triggers from them; users raise changes manually via intake. No flow affected. |
| Periodic review (scheduler) | Surfaces due/overdue, can auto-raise reviews | Core still stores next-review dates; they just aren't proactively surfaced. Manual review still possible. |

The principle: **a module off removes a capability, never a step's ability to complete.** The core always has a way forward.

### 1.4 What is NOT modular — the fixed core

Some things look like they could be modules but must **never** be switchable, because turning them off would make the system non-compliant. These are properties of the engine, hardwired:

- Segregation of duties (author ≠ approver, etc.)
- Atomic supersession (one effective version, ever)
- The retention time-gate before destruction
- The audit trail (every action logged — see §2)
- The state machine itself (no ad-hoc transitions)

**Configurable at the edges, fixed at the core.** The admin board switches *modules*; it can never switch off a *guard*.

### 1.5 The swap-test (how we know modularity is real)

A seam is only truly clean if we can replace its module with a stub and the core still runs. Build target: replace the training module with a stub that always answers "no training required," and the core must complete every flow correctly. If it can't, the seam is leaking — the core is secretly depending on the module. This test is the acceptance criterion for modularity.

### 1.6 Admin board as the switchboard

The platform admin board (see §4) shows, per tenant, every module and its on/off state. Turning a module on/off:
- Takes effect for new flows immediately.
- **✓ DECIDED (recommendation accepted):** When a module is turned off mid-flight, **in-flight flows that already engaged the module continue under the old setting until they close**; the new setting applies only to flows that start after the switch. A module is never yanked out from under a running flow.

### 1.7 Open questions for this section

- **✓ DECIDED:** The trigger-seam modules (CAPA, deviation, findings) are **not** in the first core build. We build the core with the trigger seam **exposed but no modules attached**, ship with manual intake only, and attach those modules in a later phase. The seam's existence is what matters now — its presence is what lets those modules slot in later without touching the core.
- **✓ DECIDED (recommendation accepted):** Modules have per-tenant configuration beyond on/off (training threshold %, retention periods, etc.), and that config lives on the admin board as part of the switchboard. The *core guards* those values feed remain fixed and non-switchable.

---

## 2. Audit trail — compulsory, total, immutable

### 2.1 Principle

**Nothing escapes the audit trail.** Every activity in the system — every state transition, every field edit, every login, every read of a controlled document where read-tracking is required, every signature, every waiver, every override, every module connect/disconnect, every config change, every user invite and role change — writes an audit entry. There is no action in the system that is not auditable. This is not a feature of the document-control core; it is a platform substrate that *every* module and the core alike write to.

### 2.2 What is captured

Every entry captures, at minimum:
- **Who** — the authenticated actor (user id; never a shared/anonymous account for controlled actions).
- **What** — the action or transition, named precisely.
- **When** — a server-generated timestamp at the moment of action (contemporaneous; never client-supplied).
- **Where** — tenant, organization, department context, and the screen/endpoint the action came from.
- **On what** — the entity type and id the action touched.
- **Old value / new value** — for any state or field change.
- **Why** — a reason, required for any discretionary action (waiver, override, rejection, type dispute, destruction).
- **Metadata** — session, request id, and any relevant context to reconstruct the action.

> "It catches all metadata and actions related" — the entry is rich enough that, reading it alone, you can reconstruct exactly what happened, who did it, in what context, and (for discretionary acts) why.

### 2.3 Immutability and robustness

- **Append-only.** No updates, no deletes, ever, by anyone — including platform admins. Enforced at the database privilege level (no UPDATE/DELETE grants on the audit store) and ideally reinforced by a trigger that rejects modification attempts.
- **Tamper-evident.** **✓ DECIDED (recommendation accepted):** The audit store uses **cryptographic chaining** — each entry hashes the previous, so any alteration is detectable — built in **from day one**. It's cheap insurance and inspectors increasingly expect it; retrofitting a hash chain onto existing data is awkward, so we do it at the start.
- **Enduring.** Audit data survives for the full retention period of whatever it describes, and beyond. It is never purged with the records it documents — when a document is destroyed, its audit history remains.

### 2.4 Displayed and sortable

The audit trail is not just stored — it is **surfaced**:
- A read-only audit viewer that displays entries.
- **Sortable and filterable** by who, what, when, entity, tenant, org, department, action type.
- Exportable (read-only export for inspectors).
- **✓ DECIDED:** Audit **viewing** is access-controlled (the audit *captures* everything; *seeing* it is scoped). Org-level QA sees their own org's audit trail. Platform admins do **not** see org-level audit by default — they reach it only through the gated, logged break-glass path (§4.3). The org additionally sees, in its own audit trail, every instance of platform-admin access.

### 2.5 Audit is a platform substrate, not a core feature

Because every module must write to it, the audit trail is built **first** and lives **below** both core and modules. The contract is: no code path anywhere in the system performs a controlled action without writing an audit entry. A module that doesn't write audit entries is not connectable. This is the one rule with no exceptions.

### 2.6 Decisions for this section

- **✓ DECIDED (recommendation accepted):** Read-tracking is a **per-tenant setting**, but the *capability* exists from the start. Tenants that need "trained users accessed the current version" turn it on; others keep audit volume lower.
- **✓ DECIDED:** Cryptographic chaining built in **from day one** (§2.3).
- **✓ DECIDED (recommendation accepted):** The audit trail **outlives the longest document retention period** and has its own retention floor; it is never purged with the records it documents.

---

## 3. Multi-tenancy and organization — built in from line one

### 3.1 Principle

Tenancy is **not** something added later — it is in the data model and the access model from the very first table. Every controlled entity belongs to a tenant, and within a tenant to an organization structure. Retrofitting tenancy is one of the most painful migrations possible, so it is foundational.

### 3.2 The hierarchy

We need to settle the exact shape, but the working model is:

```
Platform
  └─ Tenant            (a customer of the platform; e.g. the auto-center company)
       └─ Organization (the company entity; 1:1 with tenant today, modelled separately)
            └─ Department  (QA, Operations, etc.; QA is the default — see §5)
```

> A **branch / site** level (between Organization and Department) is intentionally *omitted* now — single-site only — but the model is shaped so it can be inserted later without a painful migration if a client ever goes multi-site.

- **✓ DECIDED:** Tenant and organization are modelled as **separate levels** even though they are 1:1 in practice today. Collapsing two levels later is trivial; splitting one level later is a brutal migration — so we keep them distinct from the start for safety, while treating them as 1:1 operationally.
- **✓ DECIDED:** **Single-site only.** There is no branch level. The hierarchy is **Platform → Tenant → Organization → Department**, with QA as the default department. The department layer is structured so that a **branch level could be inserted later** (between Organization and Department) without a painful migration, should a client ever go multi-site — but we do **not** build a dormant branch level now. This also settles QA scoping: with single-site, QA authority is simply **org-wide** (no branch-scoping question exists).

### 3.3 Isolation

- **Hard tenant isolation.** No tenant can ever see, query, or affect another tenant's data. **✓ DECIDED (recommendation accepted):** isolation is **row-level security (RLS) keyed on tenant** on a shared schema — the standard, scalable choice that fits Supabase/Postgres well. (If a future client contractually demands physical separation, that's a per-client escalation, not the default.)
- **Every table carries tenant context.** tenant_id (and org/department where relevant) is on every controlled row, set at creation, never null, never changeable.

### 3.4 Scoping flows to the hierarchy

- A document belongs to a department within an org within a tenant.
- A HOD endorses within their department.
- QA authority is **org-wide** (single-site; no branch-scoping). QA is the default department and root authority (see §5).
- The audit trail records the full hierarchy context on every entry (§2.2).

### 3.5 Decisions for this section

- **✓ DECIDED:** Tenant↔org modelled as separate 1:1 levels (§3.2).
- **✓ DECIDED:** Single-site — no branch level; org-wide QA (§3.2).
- **✓ DECIDED:** Isolation = RLS on shared schema (§3.3); physical separation only as a per-client escalation.
- **✓ DECIDED:** **No cross-tenant users.** A user belongs to exactly **one** tenant. Identity is created by invitation bound to that single tenant; there is no consultant-style multi-tenant account. This simplifies identity, auth, and isolation.

---

## 4. Platform-level governance

### 4.1 Principle

There are **two distinct governance planes**, and conflating them is a fundamental error we want to avoid from the start:

- **Platform governance** — runs the *platform itself*, across all tenants. This is you / the platform operator.
- **Organization governance** — runs *within a single tenant/org*. This is the client's QA and the roles they provision.

These are separate role systems. A platform admin is **not** automatically an org admin, and an org's QA has **no** platform powers. Keeping them distinct prevents the most dangerous confusion in a multi-tenant compliance system.

### 4.2 What platform governance controls

- **Provisioning tenants.** Creating a new tenant/org on the platform.
- **The module switchboard.** Turning modules on/off per tenant, and setting module-level config (§1.6, §1.7).
- **Platform-wide configuration** that isn't a tenant's to set.
- **Cross-tenant oversight** — viewing platform-level audit (who provisioned what), system health, etc.
- **Inviting the first org user** — specifically, the initial QA (see §5.3 and §6).

### 4.3 Platform admin access to tenant data — gated break-glass under NDA

**✓ DECIDED.** The platform admin operates under an **NDA with the organization**, so they *may* see tenant data — but **never by default**. Access is gated:

- **Default state: no visibility.** A platform admin cannot see a tenant's controlled documents or org-level audit trail in the normal course. The data is not shown.
- **Request-to-view gate.** To see tenant data, the admin must pass through an explicit **request-access gate** — a deliberate action, not an ambient permission. Access is granted for a bounded purpose/session, not permanently.
- **Everything is logged.** The access request itself is logged, *and* everything the admin does while access is open is logged — what they viewed, when, for how long. The org can see, in the audit trail, every instance of platform-admin access and what occurred during it.
- **The NDA is the trust basis.** Unlike a strict no-access model, this relies on the contractual NDA plus total logging for accountability, rather than technical impossibility of access.

> **▶ ONE SUB-POINT TO CONFIRM:** When the admin requests access through the gate, is it **self-authorized** (admin opens the gate themselves; the org sees it in the log afterward — *notification-based*) or **org-approved** (the org's QA must grant the request before the gate opens — *consent-based*)? This is written as **self-authorized-but-fully-logged** for now, matching "a gate where they request access," but it's the one trust posture worth a final confirmation. Consent-based is stricter; notification-based is faster for support. We can also make it **per-tenant configurable** (some clients demand consent, others accept notification).

- Platform governance never approves, signs, or participates in a tenant's quality workflows. It runs the platform, not the client's quality system — even when access is open, the admin views, never acts in the quality flow.

### 4.4 Platform admins are invited and owner-scoped

**✓ DECIDED.** The platform plane mirrors the org plane's structure:

- The **platform owner** is the root authority of the platform plane (as QA is the root of an org plane).
- The owner can **invite** additional platform admins.
- The owner **controls each invited admin's scope** — what they can see and what they can do — so platform-admin access is itself least-privilege and granular, not all-or-nothing. One admin might manage the module switchboard but never pass the data-access gate; another might handle support access; etc.
- Every platform-admin invitation, scope grant, and scope change is logged.

### 4.5 Decisions for this section

- **✓ DECIDED:** Gated, logged, NDA-based break-glass access (§4.3) — with the self-authorize-vs-consent sub-point flagged for final confirmation.
- **✓ DECIDED:** Multiple platform admins, invited and owner-scoped, with granular per-admin scope (§4.4).

---

## 5. Organization-level governance — QA is first and default

### 5.1 Principle

Within a tenant, governance is owned by the organization itself, and **QA is the root of that governance.** When a tenant is provisioned, **QA is the first and default department**, and **every other department, role, and user is provisioned by QA** (or by people QA authorizes). QA is the seed from which the org's structure grows.

### 5.2 Why QA is special

In a GxP environment QA is the release authority and the owner of the quality system. Making QA the provisioning root mirrors reality: the quality function stands up the document-control system, defines departments, and grants roles. It also means there is always a defined, accountable owner of the org's structure — never an ambiguous "who set this up?"

### 5.3 Provisioning chain

```
Platform admin provisions a tenant
   → and invites the tenant's first user: the initial QA
        → QA creates departments (QA already exists as the default)
        → QA invites users and assigns roles (HOD, author, signatory, trainer, viewer)
        → HODs are assigned to departments by QA
        → users operate within the roles QA granted
```

- The **initial QA** is the only user that comes from *outside* the org (invited by the platform). Everyone else is invited from *inside* by QA or QA-authorized roles.
- **✓ DECIDED (recommendation accepted):** QA can delegate user-provisioning to an **org admin** capability (so QA isn't stuck doing pure IT admin forever), but **role-granting for quality-critical roles (QA, approver, signatory) stays with QA**. The IT-style work can be delegated; the quality-authority grants cannot.

### 5.4 Org roles are distinct and well-scoped

The org-level roles (from the spec: Author, HOD, QA/Approver, Signatory, Trainer, Admin, Viewer) are **scoped to the org hierarchy** — to departments. A HOD is a HOD *of a department*. QA authority is **org-wide**:

- **✓ DECIDED:** With single-site (no branches), **QA authority is org-wide** — one QA function is the release authority for the whole organization. There is no branch-scoping to configure. (If a branch level is ever added, this is the point that would need revisiting.)

### 5.5 Separation from platform governance

An org's QA — even as the org's root authority — has **zero platform powers**. They cannot provision other tenants, cannot touch the module switchboard (they *consume* the modules the platform enabled for them), cannot see other tenants. The org governance plane is sealed inside the tenant.

- **✓ DECIDED (recommendation accepted):** An org can **see which modules are available to them, read-only**, with a "request a change" path to the platform. They stay informed without holding the switch.

### 5.6 Decisions for this section

- **✓ DECIDED:** QA-delegable user-provisioning; quality-role-granting stays with QA (§5.3).
- **✓ DECIDED:** QA authority org-wide (single-site) (§5.4).
- **✓ DECIDED:** Org has read-only visibility into its module switchboard with a request path (§5.5).

---

## 6. Users are invited, never self-signed-up

### 6.1 Principle

**No one self-registers.** There is no public sign-up. Every user enters the platform by **invitation**:
- The platform invites a tenant's initial QA.
- QA (and QA-authorized roles) invite everyone else into the org.

This is a hard rule — it's how a controlled system guarantees that every account is accountable to someone and tied to a real, authorized identity. An uninvited account cannot exist.

### 6.2 How invitation works

- An authorized inviter (platform admin for the seed QA; QA/org-admin for others) creates an invitation tied to an email and an intended role/scope.
- The invitee receives a one-time, expiring invitation.
- On acceptance, the invitee authenticates (Google sign-in, §6.3) and their account is created **already bound** to the correct tenant, org, department, and role.
- The invitation, acceptance, and initial role grant are all audited (§2).

### 6.3 Auth model — Google sign-in + mandatory, non-annoying MFA

**✓ DECIDED.**

- **Identity is Google sign-in (SSO).** Users authenticate with Google rather than passwords. This fits invite-only well: the invitation binds an email, and the user signs in with that Google identity.
- **MFA is mandatory** — enforced for every user, not optional.
- **But MFA must not be annoying.** The implementation uses **trusted-device remembering**: once a user passes MFA on a device, that device is remembered so the user isn't re-challenged on every login. Re-challenge happens on a sensible cadence (e.g. a new device, a new location, or after a defined interval), not constantly. Google's own session strength carries much of this, so a returning user on a known device has a near-frictionless sign-in while the system still satisfies "MFA enforced."
- **▶ MINOR CONFIRM:** the exact re-challenge cadence/interval (e.g. 30 days, new-device-only) is a tuning detail to set during build, not a fundamental — the principle (enforced but device-remembered) is what's fixed.

### 6.4 Deactivation, not deletion

**✓ DECIDED (recommendation accepted):** When a user leaves, they are **deactivated, never deleted** — their audit history and signatures remain attributable forever. A deactivated user cannot act, but every past action stays attributed to them.

- **▶ MINOR CONFIRM:** the rule for a departing user's **in-flight tasks** — reassign to another holder of the role, or block until reassigned. Recommendation: on deactivation, surface that user's open tasks for QA/org-admin to reassign, so nothing is silently stranded. (A tuning detail, not a fundamental.)

### 6.5 Decisions for this section

- **✓ DECIDED:** Google sign-in + mandatory MFA with trusted-device remembering (§6.3).
- **✓ DECIDED:** Deactivate-not-delete; in-flight tasks reassigned on deactivation (§6.4).

---

## 7. Summary — decisions ledger

Almost everything is now settled (✓). Only a few minor confirmations and one genuine open item remain. The build plan can be written on this basis.

### 7.1 Settled (✓)

**Modularity**
1. ✓ Module switched off mid-flight → in-flight flows continue under old setting; new setting applies only to flows starting after the switch.
2. ✓ Trigger-seam modules (CAPA/deviation/findings) are **not** in the first build — the seam is exposed, modules attach later; ship with manual intake.
3. ✓ Module config (thresholds, retention) lives on the admin switchboard; the core guards it feeds stay fixed.

**Audit**
4. ✓ Read-tracking is a per-tenant setting; capability exists from the start.
5. ✓ Cryptographic chaining built in from day one.
6. ✓ Audit trail outlives the longest document retention; never purged with the records it documents.
7. ✓ Audit viewing is access-controlled: org QA sees their org; platform admins only via gated break-glass; org sees every admin-access event in its log.

**Tenancy**
8. ✓ Tenant and org modelled as separate 1:1 levels.
9. ✓ Single-site — no branch level; hierarchy is Platform → Tenant → Org → Department; QA org-wide. Branch insertable later if ever needed.
10. ✓ Isolation = row-level security on shared schema (physical separation only as a per-client escalation).
11. ✓ No cross-tenant users — a user belongs to exactly one tenant.

**Platform governance**
12. ✓ Platform admin access to tenant data = **gated, logged, NDA-based break-glass**. No default visibility; explicit request gate; all access and actions logged; org sees the access in its audit.
13. ✓ Platform admins are invited by the owner and individually scoped (granular per-admin permissions); owner is the platform-plane root.

**Org governance**
14. ✓ QA can delegate user-provisioning (org-admin capability); granting quality-critical roles (QA, approver, signatory) stays with QA.
15. ✓ QA authority is org-wide (single-site).
16. ✓ Org has read-only visibility into its module switchboard with a request-a-change path.

**Users**
17. ✓ Google sign-in (SSO) + mandatory MFA, made non-annoying via trusted-device remembering.
18. ✓ Deactivate-not-delete; departing user's in-flight tasks surfaced for reassignment.

### 7.2 Remaining to confirm (minor)

- **▶ ONE TRUST SUB-POINT (§4.3):** platform-admin access gate — **self-authorized + logged** (notification-based, written as the current default) vs **org-approved** (consent-based) vs **per-tenant configurable**. The only sub-decision with a real trust posture attached; everything else about the gate is settled.
- **▶ MINOR TUNING (§6.3):** MFA re-challenge cadence (e.g. 30 days / new-device-only) — a build-time tuning value, principle already fixed.
- **▶ MINOR TUNING (§6.4):** exact in-flight-task reassignment mechanics on deactivation — recommendation already given (surface for QA/org-admin reassignment).

---

*This is the foundation. With the above settled, the build plan can be written on solid ground — and we won't be fixing fundamentals mid-build. The single trust sub-point in §4.3 is worth a final word before the build plan locks the access model.*
