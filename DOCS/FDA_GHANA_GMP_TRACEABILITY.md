# FDA Ghana GMP Guideline — Reference & Traceability Foundation

> **Saved for later reference.** This captures the current FDA Ghana GMP guideline (the primary regulatory source your eQMS must satisfy) plus a first-pass clause-to-feature traceability mapping. Use this as the foundation for the client validation package. Verify against the live PDF before any formal use.

---

## The source document (verified current)

- **Title:** Guideline on GMP Requirements for Drugs Manufacturing Facilities
- **Reference:** FDA/MFD/GDL-01/02
- **Version:** 02 — **effective 26 September 2024** (supersedes v01 of 01/12/2022)
- **Issuing body:** Food and Drugs Authority, Ghana (FDA Ghana)
- **URL:** https://fdaghana.gov.gh/guideline-on-the-gmp-requirements-for-drug-manufacturing-facilities/
- **Direct PDF:** https://fdaghana.gov.gh/wp-content/uploads/2024/10/GUIDELINE-ON-THE-GMP-REQUIREMENTS-FOR-DRUG-MANUFACTURING-FACILITIES.pdf

### Legal basis
- **Public Health Act, 2012 (Act 851)** — Sections 115 (control of manufacturing), 130 (registration of premises), 131 (licences and permits), 148 (mandate to issue guidelines), 118(1) (product registration).
- Manufacturing licences and GMP certificates are legally required; inspection is a prerequisite for licensing.

### What standard it actually adopts (important for your positioning)
The guideline **adopts the WHO framework** rather than defining its own detailed clauses. Specifically:
- **WHO TRS 986, Annex 2** — "WHO good manufacturing practices for pharmaceutical products: main principles" (the primary reference).
- **WHO (2007) supplementary guidelines on GMP for herbal medicines** (relevant to your herbal-manufacturer market segment).
- **PIC/S Guidance on Classification of GMP Deficiencies** (used for the critical/major/other deficiency classification).
- The guideline states the **latest WHO versions apply** as revised.

> **Positioning takeaway:** To speak the inspector's language you map your features to (a) the **17 GMP elements** listed below as adopted by FDA Ghana, and (b) the underlying **WHO TRS 986 Annex 2** detail. The FDA Ghana guideline itself is a high-level adopting document; the enforceable detail lives in the WHO texts it points to.

### The 17 GMP elements (as adopted by FDA Ghana, §3(f))
1. Pharmaceutical Quality System (incl. Quality Risk Management, Product Quality Review)
2. Good Manufacturing Practices for pharmaceutical products
3. Sanitation and hygiene
4. Qualification and validation
5. Complaints
6. Product recalls
7. Contract production, analysis and other activities
8. Self-inspection, quality audits and suppliers' audits and approval
9. Personnel
10. Training
11. Personal hygiene
12. Premises
13. Equipment
14. Materials
15. **Documentation**
16. Good practices in production
17. Good practices in quality control

### Deficiency classification (§4) — mirrors your change-control classification
- **Critical** — produces or risks a harmful product; or fraud/misrepresentation/falsification of products or data.
- **Major** — not critical, but produces non-compliant product, fails to ensure GMP control, major deviation, or failure of batch-release procedures.
- **Other** — a departure from GMP not rising to critical/major.

> Note several **Major** examples map directly to features your platform provides evidence for: *"Inadequate initial and ongoing training and/or no training records"* (xi), *"Unapproved/undocumented changes to master batch or equivalent documents"* (xviii), *"Deviations from instructions not approved"* (xix), *"Inadequate change control system"* (xxix), *"Inadequate deviation system"* (xxx). These are the deficiencies your eQMS is designed to prevent — cite them in sales as "the findings we help you avoid."

---

## Clause-to-feature traceability mapping (first pass)

> The two clauses most directly relevant to a document-control eQMS are **§3.15 Documentation** and **§3.10 Training**. §3.1 (PQS), §3.4 (Qualification/Validation), §3.5 (Complaints), §3.6 (Recalls), §3.8 (Self-inspection), and §4 (change/deviation via deficiency examples) are secondary but strengthen the pitch. Mapping below; **GAP** flags where v1 does not yet fully satisfy.

### §3.15 Documentation (the core requirement)

The guideline's stated aims of documentation, each mapped:

| Requirement (from §3.15 / WHO TRS 986 Annex 2) | Platform feature | Evidence for inspector |
|---|---|---|
| Define specifications and procedures for all materials and methods | Controlled SOP documents in the version store | The document library / Master Index |
| Ensure all personnel know what to do and when | Effective-only read surface; department working view | D-READ always shows current effective version |
| Ensure authorized persons have info to release a batch | QA-only approval authority; effective documents current | Approval records; effective-version guarantee |
| **Documented evidence and traceability** | **Append-only, hash-chained audit trail on every action** | Audit export for any document's full journey |
| **Records and an audit trail that permit investigation** | Same audit substrate; who/what/when/old/new/why | S-AUDIT viewer, filterable + exportable |
| Documents approved, signed, dated by authorized persons | E-signatures; SoD (author ≠ approver); QA release | Signature records per version |
| Documents regularly reviewed and kept up to date | Change-control pipe; periodic-review dates | Change records; next-review tracking (surface deferred, data present) |
| Prevent use of superseded documents | Atomic supersession; one-effective-version; read-only current | One-effective constraint; Master Index effective-only |
| Data available for review and statistical analysis | Dashboards; audit data | Oversight dashboards |

### §3.10 Training

| Requirement | Platform feature | Evidence |
|---|---|---|
| Training per a **written programme** for all relevant personnel | Training module: packages per SOP, assignments | Training packages + assignment records |
| Training **documented** | Assignments, assessment attempts, certificates, all version-specific | Training dashboard; certificate archive |
| Ongoing training (not just initial) | Re-training triggered on document revision (version-specific) | Training tied to each effective version |
| Records of who trained on what, when | Append-only training records + audit | Certificate (states doc/rev/date/score) + audit |
| *(Major deficiency xi: "no training records")* — directly prevented | The entire training module exists to produce these | Full training history export |

### Secondary clauses (strengthen the pitch)

| Clause | Relevance | Platform feature | Status |
|---|---|---|---|
| §3.1 Pharmaceutical Quality System (+ QRM) | The eQMS *is* part of the PQS; QRM ↔ risk classification | Change classification (minor/major/critical) | v1 (simple matrix) |
| §3.4 Qualification & Validation | System must be validated; documentary evidence required | The validation package (built from spec/checklist) | **To produce** |
| §3.5 Complaints | Written procedure + corrective action | — | **GAP — future module** |
| §3.6 Product Recalls | System to recall promptly | — | **GAP — out of eQMS scope (or future)** |
| §3.8 Self-inspection / audits | Documented, with follow-up | Audit trail supports; formal self-inspection workflow | **GAP — future** |
| §4 Change/Deviation (deficiency examples xviii, xix, xxix, xxx) | Approved changes; deviation system | Change-control core; deviation seam exposed | Change ✓ / Deviation **deferred module** |

---

## Honest gap summary (what v1 does NOT yet cover)

The FDA Ghana guideline covers all 17 GMP elements; your eQMS addresses the **documentation, training, change-control, and audit** portions — which is the correct and defensible scope for a document-control-first eQMS. Be transparent that:

- **CAPA, deviation, complaints, recalls, self-inspection** are elements of the guideline your platform does **not** cover in v1 (seams exposed for the first two; others future). A firm still needs procedures for these — your system doesn't claim to replace them yet.
- **Qualification/validation of the system itself** (§3.4) is an obligation you *help* satisfy by providing the validation package, but the client's QA owns the validation.
- The mapping above is against the **high-level FDA Ghana adopting guideline**; the enforceable detail is in **WHO TRS 986 Annex 2**, which should be obtained and mapped clause-by-clause for the full validation traceability matrix.

## Next steps to make this validation-grade

1. Obtain **WHO TRS 986, Annex 2** (the actual detailed GMP text) and the **WHO 2007 herbal GMP** supplement.
2. Expand the §3.15 and §3.10 rows to the specific WHO sub-clauses (WHO Annex 2 has detailed documentation sub-sections: SOPs, records, labels, specifications, master formulae, etc.).
3. For each WHO documentation sub-clause, state the platform feature + evidence + any gap.
4. Have the client's QA co-sign the mapping — their sign-off is what turns it into a validation artifact.
5. Keep this file versioned alongside the build; when features change, update the mapping.

---

*Reference captured from the FDA Ghana guideline v02 (effective 26 Sep 2024). Verify against the live PDF before formal validation use.*
